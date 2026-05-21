const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firebaseAdmin'); // Your existing Firebase setup
const { authMiddleware } = require('../middleware/authMiddleware');
const { createNotification } = require('../services/notificationService');
const { sendMeetingStartedEmail } = require('../services/emailService');
const { hasRole } = require('../utils/roleUtils');
const Booking = require('../models/Booking');
const Expert = require('../models/Expert');

// Middleware to verify expert token (backend JWT)
const verifyExpert = (req, res, next) => {
  authMiddleware(req, res, () => {
    if (!req.user || !hasRole(req.user, 'expert')) {
      return res.status(403).json({ error: 'Access denied. Expert role required.' });
    }

    const uid = req.firebaseUid || req.user.firebaseUid || req.user._id?.toString();
    if (!uid) {
      return res.status(401).json({ error: 'User ID missing' });
    }

    req.user.uid = uid;
    req.user.name = req.user.displayName || req.user.name || req.user.email;
    next();
  });
};

const verifyUser = (req, res, next) => {
  authMiddleware(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const uid = req.firebaseUid || req.user.firebaseUid || req.user._id?.toString();
    if (!uid) {
      return res.status(401).json({ error: 'User ID missing' });
    }

    req.user.uid = uid;
    req.user.name = req.user.displayName || req.user.name || req.user.email;
    next();
  });
};
// //console.log(process.env.GOOGLE_CLIENT_ID,
//   process.env.GOOGLE_CLIENT_SECRET,
//   `${process.env.BACKEND_URL}/api/google-meet/callback`)
// Initialize Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_URL}/api/google-meet/callback`
);

// Helper: Store/retrieve Google tokens from Firestore
const storeGoogleTokens = async (uid, tokens) => {
  const ref = db.collection('googleTokens').doc(uid);
  const snap = await ref.get();
  await ref.set({
    ...tokens,
    uid,
    updatedAt: new Date().toISOString(),
    ...(snap.exists ? {} : { createdAt: new Date().toISOString() })
  }, { merge: true });
};

const getGoogleTokens = async (uid) => {
  const doc = await db.collection('googleTokens').doc(uid).get();
  return doc.exists ? doc.data() : null;
};

// Try multiple possible UIDs to find stored Google tokens
const resolveGoogleTokenUid = async (expertRecord, callerUser) => {
  // Collect all possible UIDs (in priority order)
  const candidates = [
    callerUser?.uid,                                    // caller's resolved UID (matches OAuth storage)
    callerUser?.firebaseUid,                            // caller's firebaseUid from User model
    callerUser?._id?.toString(),                        // caller's MongoDB _id
    expertRecord?.firebaseUid,                          // Expert model's firebaseUid
    expertRecord?.user?.toString(),                     // Expert model's user ref
  ].filter(Boolean);

  // Deduplicate
  const uniqueCandidates = [...new Set(candidates)];

  for (const uid of uniqueCandidates) {
    const tokens = await getGoogleTokens(uid);
    if (tokens && tokens.accessToken) {
      return uid;
    }
  }
  return uniqueCandidates[0] || null; // fallback to first candidate even if no tokens
};

const attachMeetingToBooking = async (bookingId, meeting, provider = 'google_meet') => {
  if (!bookingId || !meeting) return null;

  const booking = await Booking.findById(bookingId);
  if (!booking) return null;

  booking.meetingLink = meeting.joinUrl || booking.meetingLink;
  booking.meetingProvider = provider;
  booking.meetingId = meeting.id || booking.meetingId;
  booking.meetingCode = meeting.meetingCode || booking.meetingCode;
  booking.meetingReport = meeting;

  if (['confirmed', 'paid'].includes(booking.status)) {
    booking.status = 'accepted';
  }

  await booking.save();
  return booking;
};

const markBookingCompleted = async (bookingId) => {
  if (!bookingId) return null;
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status === 'completed') return booking;

  booking.status = 'completed';
  await booking.save();

  const expert = await Expert.findById(booking.expertId);
  if (expert) {
    await expert.updateEarnings(booking.amount);
    expert.completedSessions += 1;
    await expert.save();
  }

  return booking;
};

// 1. Check Google connection status
router.get('/status', verifyExpert, async (req, res) => {
  try {
    const tokens = await getGoogleTokens(req.user.uid);
    const isConnected = !!(tokens && tokens.accessToken);

    res.json({
      success: true,
      isConnected,
      email: req.user.email
    });
  } catch (error) {
    console.error('Error checking Google status:', error);
    res.status(500).json({ error: 'Failed to check Google connection' });
  }
});

// 2. Get Google OAuth URL
router.get('/auth-url', verifyExpert, async (req, res) => {
  try {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/meetings.space.readonly'
    ];

    const state = uuidv4();

    // Store state in Firestore (expire after 10 minutes)
    await db.collection('oauthStates').doc(state).set({
      uid: req.user.uid,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: state,
      login_hint: req.user.email
    });

    res.json({ success: true, url: authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// 3. OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error('Google OAuth error param:', oauthError);
    return res.redirect(`${process.env.FRONTEND_URL}/expert/dashboard?error=google_auth_failed&reason=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    console.error('Google OAuth callback missing code or state');
    return res.redirect(`${process.env.FRONTEND_URL}/expert/dashboard?error=google_auth_failed&reason=missing_params`);
  }

  try {
    // Verify state
    const stateDoc = await db.collection('oauthStates').doc(state).get();
    if (!stateDoc.exists) {
      console.error('Google OAuth invalid state:', state);
      return res.redirect(`${process.env.FRONTEND_URL}/expert/dashboard?error=invalid_state`);
    }

    const stateData = stateDoc.data();

    // Check if state has expired
    if (stateData.expiresAt && new Date() > new Date(stateData.expiresAt.toDate ? stateData.expiresAt.toDate() : stateData.expiresAt)) {
      await db.collection('oauthStates').doc(state).delete();
      console.error('Google OAuth state expired');
      return res.redirect(`${process.env.FRONTEND_URL}/expert/dashboard?error=google_auth_failed&reason=state_expired`);
    }

    // Clean up state document
    await db.collection('oauthStates').doc(state).delete();

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Google OAuth tokens received for uid:', stateData.uid);

    // Store tokens
    await storeGoogleTokens(stateData.uid, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
      tokenType: tokens.token_type
    });

    // Create or update expert profile with Google integration
    try {
      const expertRef = db.collection('users').doc(stateData.uid);
      const expertDoc = await expertRef.get();
      if (expertDoc.exists) {
        await expertRef.update({
          googleConnected: true,
          googleConnectedAt: new Date().toISOString()
        });
      } else {
        // Firestore doc may not exist if user was created via MongoDB only
        await expertRef.set({
          googleConnected: true,
          googleConnectedAt: new Date().toISOString()
        });
      }
    } catch (firestoreError) {
      // Non-fatal — tokens are already stored
      console.warn('Could not update Firestore user doc (non-fatal):', firestoreError.message);
    }

    res.redirect(`https://expert.sansal.in/expert/dashboard?google_connected=true`);
  } catch (error) {
    console.error('OAuth callback error:', error.message, error.response?.data || '');
    res.redirect(`https://expert.sansal.in/expert/dashboard?error=google_auth_failed&reason=${encodeURIComponent(error.message || 'unknown')}`);
  }
});

// 4. Disconnect Google
router.post('/disconnect', verifyExpert, async (req, res) => {
  try {
    const tokens = await getGoogleTokens(req.user.uid);

    if (tokens && tokens.accessToken) {
      // Revoke Google token
      await oauth2Client.revokeToken(tokens.accessToken);
    }

    // Remove tokens from Firestore
    await db.collection('googleTokens').doc(req.user.uid).delete();

    // Update expert profile
    const expertRef = db.collection('users').doc(req.user.uid);
    await expertRef.update({
      googleConnected: false,
      googleDisconnectedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Google account disconnected' });
  } catch (error) {
    console.error('Error disconnecting Google:', error);
    res.status(500).json({ error: 'Failed to disconnect Google account' });
  }
});

// Helper: Get authenticated Google client
const getAuthenticatedClient = async (uid) => {
  const tokens = await getGoogleTokens(uid);

  if (!tokens || !tokens.accessToken) {
    throw new Error('Google account not connected');
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  // Convert camelCase tokens to snake_case for Google auth library
  const credentials = {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
    token_type: tokens.tokenType,
    scope: tokens.scope
  };

  client.setCredentials(credentials);

  // Refresh token if expired
  if (tokens.expiryDate && new Date() >= new Date(tokens.expiryDate)) {
    try {
      const { credentials: refreshedCredentials } = await client.refreshAccessToken();

      // Update stored tokens (keep camelCase for storage)
      await storeGoogleTokens(uid, {
        accessToken: refreshedCredentials.access_token,
        refreshToken: refreshedCredentials.refresh_token,
        expiryDate: refreshedCredentials.expiry_date,
        tokenType: refreshedCredentials.token_type,
        scope: refreshedCredentials.scope,
        updatedAt: new Date().toISOString()
      });

      client.setCredentials(refreshedCredentials);
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error('Token refresh failed. Please reconnect Google account.');
    }
  }

  return client;
};

const getMeetService = async (uid) => {
  const auth = await getAuthenticatedClient(uid);
  if (!google.meet) {
    throw new Error('Google Meet API client not available');
  }
  return google.meet({ version: 'v2', auth });
};

const extractMeetingCode = (meetingLink = '') => {
  const match = meetingLink.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
};

const getJoinUrlFromEvent = (event) => {
  return (
    event?.hangoutLink ||
    event?.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ||
    event?.conferenceData?.entryPoints?.[0]?.uri ||
    null
  );
};

const getMeetingCodeFromEvent = (event) => {
  return (
    event?.conferenceData?.conferenceId ||
    extractMeetingCode(getJoinUrlFromEvent(event)) ||
    null
  );
};

// 5. Schedule meeting with student
router.post('/schedule', verifyExpert, async (req, res) => {
  try {
    const { studentEmail, studentId, title, description, startTime, duration, bookingId } = req.body;

    let resolvedStudentEmail = studentEmail;
    let resolvedStudentId = studentId;

    if (bookingId) {
      const expert = await Expert.findOne({ user: req.user._id });
      if (!expert) {
        return res.status(404).json({ error: 'Expert profile not found' });
      }

      const booking = await Booking.findById(bookingId).populate('userId', 'email displayName');
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      if (booking.expertId.toString() !== expert._id.toString()) {
        return res.status(403).json({ error: 'Access denied for this booking' });
      }

      resolvedStudentEmail = booking.userId?.email || resolvedStudentEmail;
      resolvedStudentId = booking.userId?._id?.toString() || resolvedStudentId;
    }

    if (!resolvedStudentEmail) {
      return res.status(400).json({ error: 'Student email is required' });
    }

    // Get student details from database
    const studentDoc = resolvedStudentId
      ? await db.collection('users').doc(resolvedStudentId).get()
      : null;
    const student = studentDoc.exists ? studentDoc.data() : null;

    // Get authenticated Google client
    const oauth2Client = await getAuthenticatedClient(req.user.uid);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Prepare meeting times
    const start = new Date(startTime);
    const end = new Date(start.getTime() + (duration || 30) * 60000);

    // Create Google Calendar event with Meet
    const event = {
      summary: title || `Session with ${student?.name || 'Student'}`,
      description: description || `Session scheduled through Sansal`,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'Asia/Kolkata', // Or get from user profile
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      attendees: [
        { email: req.user.email, displayName: req.user.name || 'Expert' },
        { email: resolvedStudentEmail, displayName: student?.name || 'Student' }
      ],
      conferenceData: {
        createRequest: {
          requestId: `sansal-${Date.now()}-${req.user.uid}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    });

    const joinUrl = getJoinUrlFromEvent(response.data);
    const meetingCode = getMeetingCodeFromEvent(response.data);

    // Store meeting in database
    const meetingId = uuidv4();
    await db.collection('meetings').doc(meetingId).set({
      id: meetingId,
      expertId: req.user.uid,
      expertName: req.user.name,
      expertEmail: req.user.email,
      studentId: resolvedStudentId,
      studentEmail: resolvedStudentEmail,
      studentName: student?.name,
      title: event.summary,
      description: event.description,
      googleEventId: response.data.id,
      joinUrl,
      meetingCode,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      duration: duration || 30,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      bookingId: bookingId || null
    });

    // Update student's last session
    if (resolvedStudentId) {
      await db.collection('users').doc(resolvedStudentId).update({
        lastSession: new Date().toISOString(),
        $inc: { totalSessions: 1 }
      });
    }

    if (bookingId) {
      await attachMeetingToBooking(bookingId, {
        id: meetingId,
        joinUrl,
        meetingCode,
        startTime: response.data.start.dateTime,
        endTime: response.data.end.dateTime,
        googleEventId: response.data.id,
        status: 'scheduled',
        bookingId
      });
    }

    res.json({
      success: true,
      meeting: {
        id: meetingId,
        joinUrl,
        meetingCode,
        startTime: response.data.start.dateTime,
        endTime: response.data.end.dateTime,
        googleEventId: response.data.id
      }
    });

  } catch (error) {
    console.error('Error scheduling meeting:', error);

    if (error.message.includes('not connected')) {
      return res.status(401).json({
        error: 'Google account not connected',
        needsReauth: true
      });
    }

    res.status(500).json({
      error: 'Failed to schedule meeting',
      details: error.message
    });
  }
});

// 6. Start instant meeting
router.post('/meet-now', verifyExpert, async (req, res) => {
  try {
    const { studentEmail, studentId, bookingId } = req.body;

    let resolvedStudentEmail = studentEmail;
    let resolvedStudentId = studentId;
    let resolvedBookingId = bookingId;

    if (bookingId) {
      const expert = await Expert.findOne({ user: req.user._id });
      if (!expert) {
        return res.status(404).json({ error: 'Expert profile not found' });
      }

      const booking = await Booking.findById(bookingId).populate('userId', 'email displayName');
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      if (booking.expertId.toString() !== expert._id.toString()) {
        return res.status(403).json({ error: 'Access denied for this booking' });
      }

      resolvedStudentEmail = booking.userId?.email || resolvedStudentEmail;
      resolvedStudentId = booking.userId?._id?.toString() || resolvedStudentId;
    }

    if (!resolvedBookingId && resolvedStudentId) {
      const expert = await Expert.findOne({ user: req.user._id });
      if (expert) {
        const latestBooking = await Booking.findOne({
          expertId: expert._id,
          userId: resolvedStudentId
        }).sort({ createdAt: -1 });
        resolvedBookingId = latestBooking?._id?.toString();
      }
    }

    if (!resolvedStudentEmail) {
      return res.status(400).json({ error: 'Student email is required' });
    }

    // Schedule meeting starting now
    const result = await scheduleMeeting(req.user.uid, {
      studentEmail: resolvedStudentEmail,
      studentId: resolvedStudentId,
      expertEmail: req.user.email,
      expertName: req.user.name,
      title: 'Instant Session',
      description: 'Instant session started via Sansal',
      startTime: new Date().toISOString(),
      duration: 45,
      bookingId: resolvedBookingId
    });

    try {
      const meeting = result.meeting || {};
      if (resolvedStudentId) {
        await createNotification({
          userId: resolvedStudentId,
          type: 'meeting_started',
          audience: 'student',
          title: 'Your session has started',
          message: 'Your expert has started the session. Click to join.',
          data: {
            meetingId: meeting.id,
            joinUrl: meeting.joinUrl,
            startTime: meeting.startTime
          }
        });
      }

      await sendMeetingStartedEmail({
        to: resolvedStudentEmail,
        studentName: null,
        expertName: req.user.name,
        joinUrl: meeting.joinUrl,
        startTime: meeting.startTime
      });
    } catch (notifyError) {
      console.error('Meeting start notification/email failed:', notifyError);
    }

    if (resolvedBookingId) {
      await attachMeetingToBooking(resolvedBookingId, result.meeting, 'google_meet');
      // Don't mark completed yet — expert will mark completed after the meeting ends
    }

    res.json(result);
  } catch (error) {
    console.error('Error starting instant meeting:', error);
    res.status(500).json({
      error: 'Failed to start meeting',
      details: error.message
    });
  }
});

// 6b. Start group meeting (all participants in a group slot)
router.post('/meet-now-group', verifyExpert, async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }

    const expert = await Expert.findOne({ user: req.user._id });
    if (!expert) {
      return res.status(404).json({ error: 'Expert profile not found' });
    }

    const anchorBooking = await Booking.findById(bookingId).populate('userId', 'email displayName');
    if (!anchorBooking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (anchorBooking.expertId.toString() !== expert._id.toString()) {
      return res.status(403).json({ error: 'Access denied for this booking' });
    }

    const slotId = anchorBooking.slot?.slotId;
    if (!slotId) {
      return res.status(400).json({ error: 'Booking slot not found' });
    }

    const groupBookings = await Booking.find({
      expertId: expert._id,
      'slot.slotId': slotId,
      status: { $nin: ['cancelled', 'rejected'] }
    }).populate('userId', 'email displayName');

    if (!groupBookings.length) {
      return res.status(404).json({ error: 'No group participants found' });
    }

    // If a meeting already exists for this slot, reuse it
    let meeting = null;
    const existing = groupBookings.find(b => b.meetingLink);
    if (existing?.meetingLink) {
      meeting = {
        id: existing.meetingId,
        joinUrl: existing.meetingLink,
        meetingCode: existing.meetingCode,
        startTime: existing.scheduledAt
      };
    } else {
      const studentEmails = groupBookings
        .map(b => b.userId?.email)
        .filter(Boolean);
      const primaryStudent = groupBookings.find(b => b.userId?.email) || anchorBooking;
      const result = await scheduleMeeting(req.user.uid, {
        studentEmail: primaryStudent.userId?.email,
        studentId: primaryStudent.userId?._id?.toString(),
        expertEmail: req.user.email,
        expertName: req.user.name,
        title: 'Group Session',
        description: 'Group session started via Sansal',
        startTime: new Date().toISOString(),
        duration: 45,
        bookingId: anchorBooking._id?.toString(),
        attendees: studentEmails
      });
      meeting = result.meeting;
    }

    // Notify all participants and attach meeting to all bookings
    for (const booking of groupBookings) {
      await attachMeetingToBooking(booking._id, meeting, 'google_meet');

      const studentId = booking.userId?._id?.toString();
      const studentEmail = booking.userId?.email;
      if (studentId) {
        try {
          await createNotification({
            userId: studentId,
            type: 'meeting_started',
            audience: 'student',
            title: 'Your session has started',
            message: 'Your expert has started the group session. Click to join.',
            data: {
              meetingId: meeting.id,
              joinUrl: meeting.joinUrl,
              startTime: meeting.startTime
            }
          });
        } catch (notifyError) {
          console.error('Group meeting notification failed:', notifyError);
        }
      }

      if (studentEmail) {
        try {
          await sendMeetingStartedEmail({
            to: studentEmail,
            studentName: booking.userId?.displayName || null,
            expertName: req.user.name,
            joinUrl: meeting.joinUrl,
            startTime: meeting.startTime
          });
        } catch (emailError) {
          console.error('Group meeting email failed:', emailError);
        }
      }
    }

    res.json({
      success: true,
      meeting,
      count: groupBookings.length
    });
  } catch (error) {
    console.error('Error starting group meeting:', error);
    res.status(500).json({
      error: 'Failed to start group meeting',
      details: error.message
    });
  }
});

// Helper function for scheduling
async function scheduleMeeting(uid, meetingData) {
  const oauth2Client = await getAuthenticatedClient(uid);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const start = new Date(meetingData.startTime);
  const end = new Date(start.getTime() + meetingData.duration * 60000);

  const attendeeEmails = new Set();
  if (meetingData.expertEmail) attendeeEmails.add(meetingData.expertEmail);
  if (Array.isArray(meetingData.attendees)) {
    meetingData.attendees.forEach(email => {
      if (email) attendeeEmails.add(email);
    });
  }
  if (meetingData.studentEmail) attendeeEmails.add(meetingData.studentEmail);

  const attendees = Array.from(attendeeEmails).map(email => ({ email }));
  const defaultDescription = attendees.length > 2
    ? `Group session with ${attendees.length - 1} participants`
    : `Session with ${meetingData.studentEmail}`;

  const event = {
    summary: meetingData.title,
    description: meetingData.description || defaultDescription,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
    attendees,
    conferenceData: {
      createRequest: {
        requestId: `instant-${Date.now()}-${uid}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
  });
  
  const joinUrl = getJoinUrlFromEvent(response.data);
  const meetingCode = getMeetingCodeFromEvent(response.data);

  // Store in database
  const meetingId = uuidv4();
  await db.collection('meetings').doc(meetingId).set({
    id: meetingId,
    expertId: uid,
    expertEmail: meetingData.expertEmail,
    expertName: meetingData.expertName,
    studentEmail: meetingData.studentEmail,
    studentId: meetingData.studentId,
    attendees: Array.from(attendeeEmails),
    googleEventId: response.data.id,
    joinUrl,
    meetingCode,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    duration: meetingData.duration,
    status: 'active',
    createdAt: new Date().toISOString(),
    type: 'instant',
    bookingId: meetingData.bookingId || null
  });

  return {
    success: true,
    meeting: {
      id: meetingId,
      joinUrl,
      meetingCode,
      startTime: response.data.start.dateTime,
      endTime: response.data.end.dateTime,
      googleEventId: response.data.id
    }
  };
}

// 7. Get meeting report/details by meeting ID
router.get('/report/:meetingId', verifyUser, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const doc = await db.collection('meetings').doc(meetingId).get();
    console.log('Fetched meeting report for ID:', meetingId, 'Exists:', doc.exists);
    if (!doc.exists) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const meeting = doc.data();

    const candidateIds = [
      req.user.uid,
      req.user._id?.toString(),
      req.user.firebaseUid
    ].filter(Boolean);

    const isAllowed = candidateIds.includes(meeting.expertId) || candidateIds.includes(meeting.studentId);
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied for this meeting' });
    }

    if (meeting.bookingId) {
      await Booking.findByIdAndUpdate(meeting.bookingId, {
        meetingReport: meeting,
        meetingId: meeting.id || meetingId,
        meetingProvider: 'google_meet',
        ...(meeting.joinUrl ? { meetingLink: meeting.joinUrl } : {})
      });
    }

    res.json({ success: true, meeting });
  } catch (error) {
    console.error('Error fetching meeting report:', error);
    res.status(500).json({ error: 'Failed to fetch meeting report' });
  }
});

// 8. Attendance report for a booking (expert or booking owner)
router.get('/attendance/:bookingId', verifyUser, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId).populate('userId', 'email displayName');
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const isBookingOwner = booking.userId?._id?.toString() === req.user._id?.toString();
    let expert = null;
    if (hasRole(req.user, 'expert')) {
      expert = await Expert.findOne({ user: req.user._id });
    }
    const isExpertOwner = expert && booking.expertId.toString() === expert._id.toString();

    if (!isBookingOwner && !isExpertOwner) {
      return res.status(403).json({ error: 'Access denied for this booking' });
    }

    let meetingLink = booking.meetingLink;
    let meetingCode = booking.meetingCode || extractMeetingCode(meetingLink);

    let meetingData = null;

    if (!meetingCode) {
      const meetingById = booking.meetingId
        ? await db.collection('meetings').doc(booking.meetingId).get()
        : null;

      if (meetingById?.exists) {
        meetingData = meetingById.data();
        meetingLink = meetingData.joinUrl || meetingLink;
        meetingCode = meetingData.meetingCode || extractMeetingCode(meetingLink);

        await Booking.findByIdAndUpdate(bookingId, {
          ...(meetingLink ? { meetingLink } : {}),
          meetingProvider: 'google_meet',
          meetingId: meetingData.id || booking.meetingId,
          meetingCode: meetingData.meetingCode || booking.meetingCode,
          meetingReport: meetingData
        });
      }
    }

    if (!meetingCode) {
      const meetingQuery = await db
        .collection('meetings')
        .where('bookingId', '==', bookingId)
        .limit(1)
        .get();

      if (!meetingQuery.empty) {
        meetingData = meetingQuery.docs[0].data();
        meetingLink = meetingData.joinUrl || meetingLink;
        meetingCode = meetingData.meetingCode || extractMeetingCode(meetingLink);

        await Booking.findByIdAndUpdate(bookingId, {
          ...(meetingLink ? { meetingLink } : {}),
          meetingProvider: 'google_meet',
          meetingId: meetingData.id || booking.meetingId,
          meetingCode: meetingData.meetingCode || booking.meetingCode,
          meetingReport: meetingData
        });
      }
    }

    if (!meetingCode && meetingData?.googleEventId) {
      const expertRecord = (await Expert.findById(booking.expertId)) || null;
      const expertUid = isExpertOwner
        ? await resolveGoogleTokenUid(expertRecord, req.user)
        : (expertRecord?.firebaseUid || expertRecord?.user?.toString());
      if (expertUid) {
        try {
          const oauth2Client = await getAuthenticatedClient(expertUid);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          const eventRes = await calendar.events.get({
            calendarId: 'primary',
            eventId: meetingData.googleEventId
          });

          const eventJoinUrl = getJoinUrlFromEvent(eventRes.data);
          const eventMeetingCode = getMeetingCodeFromEvent(eventRes.data);
          meetingLink = eventJoinUrl || meetingLink;
          meetingCode = eventMeetingCode || meetingCode;

          await Booking.findByIdAndUpdate(bookingId, {
            ...(meetingLink ? { meetingLink } : {}),
            meetingProvider: 'google_meet',
            meetingId: meetingData.id || booking.meetingId,
            meetingCode: meetingCode || booking.meetingCode,
            meetingReport: meetingData
          });
        } catch (error) {
          if (
            error?.status === 403 ||
            error?.response?.status === 403 ||
            error?.message?.toLowerCase?.().includes('insufficient authentication scopes')
          ) {
            return res.status(401).json({
              error: 'Google permissions required',
              needsReauth: true
            });
          }
          throw error;
        }
      }
    }

    if (!meetingCode) {
      return res.status(400).json({ error: 'Meeting link not found for this booking' });
    }

    const expertRecord = expert || await Expert.findById(booking.expertId);
    if (!expertRecord) {
      return res.status(404).json({ error: 'Expert profile not found' });
    }

    // Resolve the UID that has Google tokens stored
    // When the expert themselves is calling, use their auth UID (matches OAuth storage key)
    const expertUid = isExpertOwner
      ? await resolveGoogleTokenUid(expertRecord, req.user)
      : (expertRecord.firebaseUid || expertRecord.user?.toString());
    if (!expertUid) {
      return res.status(400).json({ error: 'Expert Google account not linked' });
    }

    console.log('Attendance: resolved expertUid =', expertUid, '| isExpertOwner =', isExpertOwner);

    // Helper: build a basic report from stored booking/meeting data (fallback)
    const buildBasicReport = () => {
      const storedReport = booking.meetingReport || {};
      const startTime = storedReport.startTime || booking.slot?.date || null;
      const endTime = storedReport.endTime || null;
      let totalDurationSeconds = 0;
      if (startTime && endTime) {
        totalDurationSeconds = Math.max(0, Math.round((new Date(endTime) - new Date(startTime)) / 1000));
      }

      // Get student info from populated booking
      const studentName = booking.userId?.displayName || booking.userId?.email || 'Student';
      const studentEmail = booking.userId?.email || null;

      return {
        bookingId,
        meetingCode,
        startTime,
        endTime,
        totalParticipants: 2,
        totalSessions: 1,
        totalDurationSeconds,
        source: 'stored', // indicates this is from stored data, not live Google API
        participants: [
          {
            participantId: 'expert',
            displayName: expertRecord.name || 'Expert',
            email: expertRecord.email || null,
            sessionsCount: 1,
            totalDurationSeconds,
            firstJoin: startTime,
            lastLeave: endTime
          },
          {
            participantId: 'student',
            displayName: studentName,
            email: studentEmail,
            sessionsCount: 1,
            totalDurationSeconds,
            firstJoin: startTime,
            lastLeave: endTime
          }
        ]
      };
    };

    // Try to get detailed attendance from Google Meet API
    let meet;
    try {
      meet = await getMeetService(expertUid);
    } catch (authError) {
      console.warn('Google Meet service unavailable, using stored data:', authError.message);
      return res.json({ success: true, report: buildBasicReport() });
    }

    let recordsRes;
    try {
      recordsRes = await meet.conferenceRecords.list({
        filter: `space.meeting_code="${meetingCode}"`,
        pageSize: 10
      });
    } catch (error) {
      console.warn('Conference records API failed, using stored data:', error.message);
      if (
        error?.status === 403 ||
        error?.response?.status === 403 ||
        error?.message?.toLowerCase?.().includes('insufficient authentication scopes')
      ) {
        // Still return stored data, but flag that reauth would improve it
        const report = buildBasicReport();
        report.needsReauth = true;
        return res.json({ success: true, report, needsReauthForDetails: true });
      }
      // For any other error, return stored data
      return res.json({ success: true, report: buildBasicReport() });
    }

    const records = recordsRes.data?.conferenceRecords || [];
    if (!records.length) {
      // No conference records yet — return stored data instead of an error
      console.log('No conference records found, using stored data for bookingId:', bookingId);
      return res.json({ success: true, report: buildBasicReport() });
    }

    const getRecordTime = (record) => new Date(record.startTime || record.start_time || 0).getTime();
    const conferenceRecord = records.sort((a, b) => getRecordTime(b) - getRecordTime(a))[0];

    // Try to get detailed participant data; fall back to basic report on failure
    let participantSummaries = [];
    try {
      const listAll = async (fn, params, field) => {
        let items = [];
        let pageToken;
        do {
          const res = await fn({ ...params, pageToken });
          items = items.concat(res.data?.[field] || []);
          pageToken = res.data?.nextPageToken;
        } while (pageToken);
        return items;
      };

      const participants = await listAll(
        meet.conferenceRecords.participants.list,
        { parent: conferenceRecord.name },
        'participants'
      );

      for (const participant of participants) {
        const sessions = await listAll(
          meet.conferenceRecords.participants.participantSessions.list,
          { parent: participant.name },
          'participantSessions'
        );

        let totalDurationMs = 0;
        let firstJoin = null;
        let lastLeave = null;

        sessions.forEach((session) => {
          const start = new Date(session.startTime || session.start_time || 0);
          const end = new Date(session.endTime || session.end_time || new Date().toISOString());
          if (!firstJoin || start < firstJoin) firstJoin = start;
          if (!lastLeave || end > lastLeave) lastLeave = end;
          totalDurationMs += Math.max(0, end - start);
        });

        const profile = participant.signedinUser || participant.anonymousUser || {};
        participantSummaries.push({
          participantId: participant.name?.split('/').pop(),
          displayName: profile.displayName || profile.display_name || 'Guest',
          email: profile.email || null,
          sessionsCount: sessions.length,
          totalDurationSeconds: Math.round(totalDurationMs / 1000),
          firstJoin: firstJoin ? firstJoin.toISOString() : null,
          lastLeave: lastLeave ? lastLeave.toISOString() : null
        });
      }
    } catch (participantError) {
      console.warn('Failed to fetch participants from Google Meet API, using basic report:', participantError.message);
      return res.json({ success: true, report: buildBasicReport() });
    }

    const report = {
      bookingId,
      meetingCode,
      conferenceRecord: conferenceRecord.name,
      startTime: conferenceRecord.startTime || conferenceRecord.start_time || null,
      endTime: conferenceRecord.endTime || conferenceRecord.end_time || null,
      totalParticipants: participantSummaries.length,
      totalSessions: participantSummaries.reduce((sum, p) => sum + p.sessionsCount, 0),
      totalDurationSeconds: participantSummaries.reduce((sum, p) => sum + p.totalDurationSeconds, 0),
      source: 'google_meet_api',
      participants: participantSummaries
    };

    booking.meetingReport = report;
    booking.meetingProvider = 'google_meet';
    booking.meetingId = booking.meetingId || report.conferenceRecord;
    booking.meetingCode = booking.meetingCode || meetingCode;
    await booking.save();

    if (booking.status !== 'completed') {
      await markBookingCompleted(bookingId);
    }

    console.log('Attendance report', {
      bookingId,
      totalParticipants: report.totalParticipants,
      totalSessions: report.totalSessions,
      totalDurationSeconds: report.totalDurationSeconds
    });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Attendance report error:', error.message);

    // Last-resort fallback: try to return basic data from the booking itself
    try {
      const fallbackBooking = await Booking.findById(req.params.bookingId).populate('userId', 'email displayName');
      if (fallbackBooking && (fallbackBooking.meetingLink || fallbackBooking.meetingId)) {
        const storedReport = fallbackBooking.meetingReport || {};
        const startTime = storedReport.startTime || null;
        const endTime = storedReport.endTime || null;
        let totalDurationSeconds = 0;
        if (startTime && endTime) {
          totalDurationSeconds = Math.max(0, Math.round((new Date(endTime) - new Date(startTime)) / 1000));
        }
        const studentName = fallbackBooking.userId?.displayName || fallbackBooking.userId?.email || 'Student';
        const studentEmail = fallbackBooking.userId?.email || null;

        return res.json({
          success: true,
          report: {
            bookingId: req.params.bookingId,
            meetingCode: fallbackBooking.meetingCode || extractMeetingCode(fallbackBooking.meetingLink),
            startTime,
            endTime,
            totalParticipants: 2,
            totalSessions: 1,
            totalDurationSeconds,
            source: 'fallback',
            participants: [
              { participantId: 'expert', displayName: 'Expert', email: null, sessionsCount: 1, totalDurationSeconds, firstJoin: startTime, lastLeave: endTime },
              { participantId: 'student', displayName: studentName, email: studentEmail, sessionsCount: 1, totalDurationSeconds, firstJoin: startTime, lastLeave: endTime }
            ]
          }
        });
      }
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr.message);
    }

    res.status(500).json({
      error: 'Failed to fetch attendance report',
      details: error.message
    });
  }
});

// 9. Get expert's upcoming meetings
router.get('/upcoming', verifyExpert, async (req, res) => {
  try {
    const oauth2Client = await getAuthenticatedClient(req.user.uid);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
      q: 'hangoutsMeet'
    });

    const meetings = (response.data.items || []).map(event => ({
      id: event.id,
      title: event.summary,
      description: event.description,
      joinUrl: event.hangoutLink,
      startTime: event.start.dateTime,
      endTime: event.end.dateTime,
      attendees: event.attendees || [],
      status: event.status
    }));

    res.json({ success: true, meetings });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

module.exports = router;
