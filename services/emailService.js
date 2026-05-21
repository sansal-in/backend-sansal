const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// --- Resend (HTTP-based, works on Render/Vercel/etc.) ---
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
};

const sendViaResend = async ({ to, subject, text, html, from }) => {
  const resend = getResendClient();
  if (!resend) return null; // fallback to nodemailer

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html
    });

    if (error) {
      return { error: error.message || 'resend-failed', raw: error };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    return { error: err.message || 'resend-failed', raw: err };
  }
};

// --- Nodemailer (SMTP, works on localhost) ---
let smtpDisabled = false; // cache "transport broken" so we don't spam errors

const getTransporter = () => {
  if (smtpDisabled) return null;
  const user = process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: 'gmail',
    port: 587,
    secure: false,
    auth: { user, pass }
  });
};

// --- Admin redirect (testing mode) ---
// When Resend is using its sandbox FROM (onboarding@resend.dev) or the
// EMAIL_REDIRECT_TO_ADMIN flag is set, every outgoing email is rerouted to
// the admin inbox with a banner noting who it was originally for. This lets
// the app run end-to-end without a verified Resend domain or working SMTP.
const isAdminRedirectMode = () => {
  if (String(process.env.EMAIL_REDIRECT_TO_ADMIN || '').toLowerCase() === 'true') return true;
  const from = String(process.env.RESEND_FROM || '').toLowerCase();
  return from.includes('onboarding@resend.dev') || from.includes('@resend.dev');
};

const getAdminEmail = () => process.env.ADMIN_EMAIL || 'sandeep854101@gmail.com';

const wrapForAdminRedirect = ({ to, subject, text, html }) => {
  const originalTo = Array.isArray(to) ? to.join(', ') : to;
  const banner = `[REDIRECTED] Originally for: ${originalTo}`;
  const newSubject = `[For: ${originalTo}] ${subject}`;
  const newText = `${banner}\n\n--- original message follows ---\n\n${text || ''}`;
  const newHtml = html
    ? `<div style="margin:0 0 16px;padding:10px 14px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;font-family:Segoe UI,Inter,Arial,sans-serif;font-size:13px;color:#92400E;">
         <strong>Redirected:</strong> originally for <code>${String(originalTo).replace(/</g, '&lt;')}</code>
       </div>${html}`
    : undefined;
  return { to: getAdminEmail(), subject: newSubject, text: newText, html: newHtml };
};

const sendEmail = async (payload) => {
  let { to, subject, text, html } = payload || {};

  const fromAddress =
    process.env.RESEND_FROM ||
    process.env.EMAIL_FROM ||
    process.env.FROM_EMAIL ||
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    process.env.SMTP_USER;
  const fromName = process.env.EMAIL_FROM_NAME || process.env.FROM_NAME || 'Sansal';
  const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  if (!fromAddress) {
    console.warn('[email] skipped: no FROM address configured');
    return { skipped: true, reason: 'missing-credentials' };
  }

  if (!to) {
    return { skipped: true, reason: 'missing-recipient' };
  }

  // Rewrite the envelope to the admin inbox when in admin-redirect mode.
  const redirected = isAdminRedirectMode();
  if (redirected) {
    ({ to, subject, text, html } = wrapForAdminRedirect({ to, subject, text, html }));
  }

  // Try Resend first (HTTP-based, works on cloud hosts)
  const resendResult = await sendViaResend({ to, subject, text, html, from });
  if (resendResult?.success) {
    console.log(`[email] resend ok -> to=${Array.isArray(to) ? to.join(',') : to} from=${from} id=${resendResult.id} redirected=${redirected}`);
    return redirected ? { ...resendResult, redirectedToAdmin: true } : resendResult;
  }

  if (resendResult?.error) {
    // Surface the real Resend rejection (e.g. "domain not verified", "sandbox can only send to your own email")
    console.warn(`[email] resend rejected -> to=${Array.isArray(to) ? to.join(',') : to} from=${from} error=${resendResult.error}`);
  }

  // Resend not configured, or returned an error (e.g. sandbox 403) — try SMTP fallback
  const transporter = getTransporter();
  if (!transporter) {
    if (resendResult?.error) {
      // One short warn line — never dump the full error object.
      console.warn(`[email] resend failed: ${resendResult.error}`);
      return { error: resendResult.error };
    }
    console.warn('[email] skipped: no Resend API key and no SMTP credentials');
    return { skipped: true, reason: 'missing-credentials' };
  }

  if (resendResult?.error) {
    console.warn(`[email] resend failed (${resendResult.error}); trying SMTP`);
  }

  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return redirected
      ? { success: true, transport: 'smtp', redirectedToAdmin: true }
      : { success: true, transport: 'smtp' };
  } catch (error) {
    // Permanently disable SMTP for this process if credentials are bad, so we
    // don't spam the console on every subsequent send.
    if (error?.code === 'EAUTH' || error?.responseCode === 535) {
      smtpDisabled = true;
      console.warn('[email] SMTP credentials rejected (535); disabling SMTP for this process');
    } else {
      console.warn(`[email] SMTP send failed: ${error?.message || 'unknown error'}`);
    }
    return { error: error?.message || 'send-failed' };
  }
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatSlot = (booking) => {
  const date = booking?.slot?.date ? new Date(booking.slot.date) : null;
  const dateLabel = date ? date.toDateString() : 'Scheduled date';
  const timeLabel = booking?.slot?.startTime && booking?.slot?.endTime
    ? `${booking.slot.startTime} - ${booking.slot.endTime}`
    : 'Time TBD';
  return `${dateLabel} | ${timeLabel}`;
};

// --- Sansal brand tokens (mirrors Frontend/src/theme.js light mode) ---
const BRAND = {
  bg: '#FFFCF7',
  panel: '#FBF6ED',
  card: '#FFFFFF',
  text: '#1A1B2E',
  text2: '#5C5D72',
  muted: '#9A9BA8',
  border: '#EFEAE0',
  borderStrong: '#D9D2C2',
  accent: '#F97316',
  accentHover: '#EA580C',
  accentBg: '#FFF7ED',
  accentBorder: '#FED7AA',
  accentText: '#C2410C',
  positive: '#16A34A',
  positiveBg: '#F0FDF4',
  positiveBorder: '#BBF7D0',
  danger: '#E11D48',
  dangerBg: '#FFF1F2'
};

const buildEmailLayout = ({ title, preheader, bodyHtml, cta, accentBlock }) => {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader || '');
  const userPanelUrl = 'https://sansal.in';
  const expertPanelUrl = 'https://expert.sansal.in';

  const ctaHtml = cta?.label && cta?.href
    ? `
      <div style="margin:28px 0 8px;">
        <a href="${cta.href}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;background:${BRAND.accent};color:#FFFFFF;text-decoration:none;
                  padding:13px 26px;border-radius:12px;font-weight:700;font-size:14px;
                  box-shadow:0 8px 20px rgba(249,115,22,0.28);letter-spacing:0.2px;">
          ${escapeHtml(cta.label)}
        </a>
      </div>
    `
    : '';

  const accentBlockHtml = accentBlock
    ? `
      <div style="margin:18px 0;padding:16px 18px;background:${BRAND.accentBg};
                  border:1px solid ${BRAND.accentBorder};border-radius:12px;color:${BRAND.accentText};
                  font-size:14px;line-height:1.6;">
        ${accentBlock}
      </div>
    `
    : '';

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${safeTitle}</title>
      <style>
        @media (max-width: 600px) {
          .container { padding: 16px !important; }
          .card { padding: 22px !important; }
          .brand-row { padding: 18px 22px !important; }
        }
      </style>
    </head>
    <body style="margin:0;background:${BRAND.bg};font-family:'Segoe UI',Inter,Arial,sans-serif;color:${BRAND.text};">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        ${safePreheader}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.bg};">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;">
              <tr>
                <td class="container" style="padding:28px 20px;">

                  <!-- Brand row -->
                  <div class="brand-row" style="display:flex;align-items:center;justify-content:center;
                              padding:20px 24px;background:${BRAND.panel};
                              border:1px solid ${BRAND.border};border-radius:18px 18px 0 0;
                              border-bottom:none;text-align:center;">
                    <div style="display:inline-flex;align-items:center;gap:10px;">
                      <div style="width:36px;height:36px;border-radius:10px;
                                  background:linear-gradient(135deg,${BRAND.accent},#FB923C);
                                  display:inline-block;line-height:36px;color:#FFFFFF;
                                  font-weight:800;font-family:Georgia,serif;font-size:18px;">S</div>
                      <span style="font-size:20px;font-weight:800;letter-spacing:-0.3px;color:${BRAND.text};">
                        sansal<span style="color:${BRAND.accent};">.</span>
                      </span>
                    </div>
                  </div>

                  <!-- Card -->
                  <div class="card" style="background:${BRAND.card};border:1px solid ${BRAND.border};
                              border-top:none;border-radius:0 0 18px 18px;padding:28px 28px 26px;
                              box-shadow:0 14px 28px -14px rgba(26,27,46,0.10);">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;
                                text-transform:uppercase;color:${BRAND.accent};margin-bottom:8px;">
                      Sansal AI
                    </div>
                    <div style="font-size:22px;font-weight:700;color:${BRAND.text};
                                margin:0 0 14px;line-height:1.3;font-family:Georgia,serif;">
                      ${safeTitle}
                    </div>
                    <div style="font-size:14.5px;line-height:1.65;color:${BRAND.text2};">
                      ${bodyHtml}
                    </div>
                    ${accentBlockHtml}
                    ${ctaHtml}
                    <div style="margin-top:24px;padding-top:16px;border-top:1px solid ${BRAND.border};
                                font-size:12.5px;color:${BRAND.muted};line-height:1.7;">
                      Student panel: <a href="${userPanelUrl}" style="color:${BRAND.accentText};text-decoration:none;font-weight:600;">sansal.in</a><br/>
                      Expert panel: <a href="${expertPanelUrl}" style="color:${BRAND.accentText};text-decoration:none;font-weight:600;">expert.sansal.in</a>
                    </div>
                  </div>

                  <div style="margin-top:16px;font-size:11.5px;color:${BRAND.muted};text-align:center;line-height:1.6;">
                    You received this because you have an account with Sansal AI.<br/>
                    &copy; ${new Date().getFullYear()} Sansal &middot; Smart Interview Platform
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

const sendBookingConfirmation = async (booking, user, expert) => {
  const to = user?.email;
  if (!to) return { skipped: true };
  const subject = 'Your booking is confirmed';
  const studentName = user?.displayName || user?.name || 'Student';
  const expertName = expert?.name || 'Expert';
  const schedule = formatSlot(booking);
  const text = [
    `Hi ${studentName},`,
    '',
    `Your session with ${expertName} is confirmed.`,
    `Schedule: ${schedule}`,
    '',
    'Thanks,',
    'Sansal'
  ].join('\n');
  const html = buildEmailLayout({
    title: 'Your booking is confirmed',
    preheader: `Session confirmed with ${expertName}.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(studentName)},</p>
      <p style="margin:0 0 10px;">Your session with <strong>${escapeHtml(expertName)}</strong> is confirmed.</p>
      <p style="margin:0 0 10px;"><strong>Schedule:</strong> ${escapeHtml(schedule)}</p>
      <p style="margin:0;">We'll notify you when the expert accepts and the meeting is ready.</p>
    `,
    cta: {
      label: 'Open Your Dashboard',
      href: 'https://sansal.in/dashboard/sessions'
    }
  });
  return sendEmail({ to, subject, text, html });
};

const sendExpertBookingNotification = async (booking, user, expert) => {
  const to = expert?.email;
  if (!to) return { skipped: true };
  const subject = 'New booking received';
  const studentName = user?.displayName || user?.name || 'Student';
  const schedule = formatSlot(booking);
  const text = [
    `Hi ${expert?.name || 'Expert'},`,
    '',
    `You have a new booking from ${studentName}.`,
    `Schedule: ${schedule}`,
    '',
    'Thanks,',
    'Sansal'
  ].join('\n');
  const html = buildEmailLayout({
    title: 'New booking received',
    preheader: `A new session was booked by ${studentName}.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(expert?.name || 'Expert')},</p>
      <p style="margin:0 0 10px;">You have a new booking from <strong>${escapeHtml(studentName)}</strong>.</p>
      <p style="margin:0 0 10px;"><strong>Schedule:</strong> ${escapeHtml(schedule)}</p>
      <p style="margin:0;">Please accept or reject this session from your expert dashboard.</p>
    `,
    cta: {
      label: 'Open Expert Dashboard',
      href: 'https://expert.sansal.in'
    }
  });
  return sendEmail({ to, subject, text, html });
};

const sendPaymentSuccess = async (payment, user) => {
  const to = user?.email;
  if (!to) return { skipped: true };
  const subject = 'Payment received';
  const amount = payment?.amount ? `INR ${payment.amount}` : 'your payment';
  const text = [
    `Hi ${user?.displayName || user?.name || 'Student'},`,
    '',
    `We received ${amount} for your booking.`,
    '',
    'Thanks,',
    'Sansal'
  ].join('\n');
  const html = buildEmailLayout({
    title: 'Payment received',
    preheader: `We received ${amount} for your booking.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(user?.displayName || user?.name || 'Student')},</p>
      <p style="margin:0 0 10px;">We received <strong>${escapeHtml(amount)}</strong> for your booking.</p>
      <p style="margin:0;">We'll notify you once the expert accepts the session.</p>
    `,
    cta: {
      label: 'View Booking',
      href: 'https://sansal.in/dashboard/sessions'
    }
  });
  return sendEmail({ to, subject, text, html });
};

const sendBookingAccepted = async (booking, user, expert) => {
  const to = user?.email;
  if (!to) return { skipped: true };
  const subject = 'Your booking was accepted';
  const expertName = expert?.name || 'Expert';
  const schedule = formatSlot(booking);
  const text = [
    `Hi ${user?.displayName || user?.name || 'Student'},`,
    '',
    `Your booking with ${expertName} has been accepted.`,
    `Schedule: ${schedule}`,
    '',
    'Thanks,',
    'Sansal'
  ].join('\n');
  const html = buildEmailLayout({
    title: 'Booking accepted',
    preheader: `Your session with ${expertName} is accepted.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(user?.displayName || user?.name || 'Student')},</p>
      <p style="margin:0 0 10px;">Your booking with <strong>${escapeHtml(expertName)}</strong> has been accepted.</p>
      <p style="margin:0 0 10px;"><strong>Schedule:</strong> ${escapeHtml(schedule)}</p>
      <p style="margin:0;">Check your dashboard for meeting details.</p>
    `,
    cta: {
      label: 'Go to My Sessions',
      href: 'https://sansal.in/dashboard/sessions'
    }
  });
  return sendEmail({ to, subject, text, html });
};

const sendBookingRejected = async (booking, user, expert, reason) => {
  const to = user?.email;
  if (!to) return { skipped: true };
  const subject = 'Your booking was rejected';
  const expertName = expert?.name || 'Expert';
  const schedule = formatSlot(booking);
  const safeReason = reason || 'No reason provided';
  const text = [
    `Hi ${user?.displayName || user?.name || 'Student'},`,
    '',
    `Your booking with ${expertName} was rejected.`,
    `Schedule: ${schedule}`,
    `Reason: ${safeReason}`,
    '',
    'Thanks,',
    'Sansal'
  ].join('\n');
  const html = buildEmailLayout({
    title: 'Booking rejected',
    preheader: `Your session with ${expertName} was rejected.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(user?.displayName || user?.name || 'Student')},</p>
      <p style="margin:0 0 10px;">Your booking with <strong>${escapeHtml(expertName)}</strong> was rejected.</p>
      <p style="margin:0 0 10px;"><strong>Schedule:</strong> ${escapeHtml(schedule)}</p>
      <p style="margin:0 0 10px;"><strong>Reason:</strong> ${escapeHtml(safeReason)}</p>
      <p style="margin:0;">You can book another expert anytime.</p>
    `,
    cta: {
      label: 'Find Experts',
      href: 'https://sansal.in/experts'
    }
  });
  return sendEmail({ to, subject, text, html });
};

const sendMeetingStartedEmail = async ({ to, studentName, expertName, joinUrl, startTime }) => {
  if (!to || !joinUrl) return { skipped: true };

  const subject = 'Your session has started - Join now';
  const safeStudent = studentName || 'Student';
  const safeExpert = expertName || 'Your expert';
  const safeStart = startTime ? new Date(startTime).toISOString() : 'now';

  const text = [
    `Hi ${safeStudent},`,
    '',
    `Your session with ${safeExpert} has started.`,
    `Start time: ${safeStart}`,
    `Join link: ${joinUrl}`,
    '',
    'See you inside,',
    'Sansal'
  ].join('\n');

  const html = buildEmailLayout({
    title: 'Your session has started',
    preheader: `Join your session with ${safeExpert} now.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(safeStudent)},</p>
      <p style="margin:0 0 10px;">Your session with <strong>${escapeHtml(safeExpert)}</strong> has started.</p>
      <p style="margin:0 0 10px;"><strong>Start time:</strong> ${escapeHtml(safeStart)}</p>
      <p style="margin:0;">Tap below to join immediately.</p>
    `,
    cta: {
      label: 'Join Session',
      href: joinUrl
    }
  });

  return sendEmail({ to, subject, text, html });
};

const sendOtpEmail = async ({ to, otp, purpose }) => {
  if (!to || !otp) return { skipped: true };

  const isSignup = purpose === 'signup';
  const subject = isSignup ? 'Verify your email - OTP' : 'Reset your password - OTP';
  const title = isSignup ? 'Email Verification' : 'Password Reset';
  const preheader = isSignup
    ? 'Use this OTP to verify your email address.'
    : 'Use this OTP to reset your password.';
  const description = isSignup
    ? 'Use the OTP below to verify your email address and complete your registration.'
    : 'Use the OTP below to reset your password. If you did not request this, please ignore this email.';

  const text = [
    `Hi,`,
    '',
    description,
    '',
    `Your OTP: ${otp}`,
    '',
    'This OTP is valid for 5 minutes.',
    '',
    'Thanks,',
    'Sansal'
  ].join('\n');

  const html = buildEmailLayout({
    title,
    preheader,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi,</p>
      <p style="margin:0 0 16px;">${escapeHtml(description)}</p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:${BRAND.accentBg};border:2px solid ${BRAND.accent};border-radius:14px;padding:16px 32px;letter-spacing:8px;font-size:32px;font-weight:800;color:${BRAND.accentText};font-family:Menlo,Consolas,'Courier New',monospace;">
          ${escapeHtml(otp)}
        </div>
      </div>
      <p style="margin:0 0 10px;font-size:13px;color:${BRAND.muted};">This OTP is valid for <strong>5 minutes</strong>. Do not share it with anyone.</p>
    `
  });

  return sendEmail({ to, subject, text, html });
};

// =============================================================
// Welcome Email — sent to user + admin on first sign-up
// =============================================================
const sendWelcomeEmail = async (user) => {
  const to = user?.email;
  if (!to) return { skipped: true };

  const studentName = user?.displayName || user?.name || 'Student';
  const college = user?.college ? ` from ${user.college}` : '';

  const subject = 'Welcome to Sansal AI';
  const text = [
    `Hi ${studentName},`,
    '',
    'Welcome to Sansal AI — your placement preparation companion.',
    '',
    'You can now:',
    '  • Take AI-powered mock interviews',
    '  • Practice aptitude tests',
    '  • Book sessions with expert mentors',
    '  • Track your progress over time',
    '',
    'Start whenever you are ready: https://sansal.in',
    '',
    'Cheers,',
    'Team Sansal'
  ].join('\n');

  const html = buildEmailLayout({
    title: `Welcome aboard, ${escapeHtml(studentName)}.`,
    preheader: 'Your placement preparation journey starts here.',
    bodyHtml: `
      <p style="margin:0 0 14px;">
        We're glad to have you${escapeHtml(college)} on Sansal AI. You're all set to start
        practicing — interviews, aptitude, and expert mentorship are just a click away.
      </p>
      <p style="margin:0 0 8px;font-weight:600;color:${BRAND.text};">Here's what you can do today:</p>
      <ul style="margin:0 0 6px;padding-left:20px;color:${BRAND.text2};">
        <li style="margin-bottom:6px;">Run an <strong>AI mock interview</strong> tailored to your role.</li>
        <li style="margin-bottom:6px;">Take an <strong>aptitude test</strong> and benchmark your score.</li>
        <li style="margin-bottom:6px;">Book a <strong>1:1 session</strong> with a vetted expert.</li>
        <li>Track your progress on the dashboard.</li>
      </ul>
    `,
    cta: { label: 'Open my dashboard', href: 'https://sansal.in/dashboard' }
  });

  const adminTo = getAdminEmail();
  const adminHtml = buildEmailLayout({
    title: 'A new student just signed up.',
    preheader: `${studentName} just joined Sansal AI.`,
    bodyHtml: `
      <p style="margin:0 0 10px;">A new account was created on Sansal AI.</p>
    `,
    accentBlock: `
      <div><strong>Name:</strong> ${escapeHtml(studentName)}</div>
      <div><strong>Email:</strong> ${escapeHtml(to)}</div>
      <div><strong>College:</strong> ${escapeHtml(user?.college || '—')}</div>
      <div><strong>Joined:</strong> ${escapeHtml(new Date().toLocaleString())}</div>
    `,
    cta: { label: 'Open admin panel', href: 'https://sansal.in/admin' }
  });

  const userResult = await sendEmail({ to, subject, text, html });
  const adminResult = adminTo
    ? await sendEmail({
        to: adminTo,
        subject: `New signup: ${studentName}`,
        text: `New signup on Sansal AI\n\nName: ${studentName}\nEmail: ${to}\nCollege: ${user?.college || '—'}`,
        html: adminHtml
      })
    : { skipped: true };

  return { user: userResult, admin: adminResult };
};

// =============================================================
// Interview Started Email — sent to user only
// =============================================================
const sendInterviewStartedEmail = async ({ user, interview }) => {
  const to = user?.email;
  if (!to) return { skipped: true };

  const studentName = user?.displayName || user?.name || 'Student';
  const role = interview?.config?.role || 'your selected role';
  const difficulty = interview?.config?.difficulty_level || interview?.config?.difficulty || '';
  const startedAt = interview?.startedAt ? new Date(interview.startedAt).toLocaleString() : new Date().toLocaleString();

  const subject = 'Your interview has started';
  const text = [
    `Hi ${studentName},`,
    '',
    `Your AI mock interview for ${role} has started.`,
    `Started at: ${startedAt}`,
    '',
    'Take your time, think out loud, and answer naturally.',
    '',
    '— Team Sansal'
  ].join('\n');

  const html = buildEmailLayout({
    title: 'Your interview has started.',
    preheader: `Mock interview for ${role} is now live.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi <strong>${escapeHtml(studentName)}</strong>,</p>
      <p style="margin:0 0 10px;">
        Your AI mock interview for <strong>${escapeHtml(role)}</strong> is now in progress.
        Stay focused, answer in your own words, and don't worry — you can review every
        response in your report once you finish.
      </p>
    `,
    accentBlock: `
      <div><strong>Role:</strong> ${escapeHtml(role)}</div>
      ${difficulty ? `<div><strong>Difficulty:</strong> ${escapeHtml(difficulty)}</div>` : ''}
      <div><strong>Started:</strong> ${escapeHtml(startedAt)}</div>
    `,
    cta: { label: 'Continue interview', href: 'https://sansal.in/interview' }
  });

  return sendEmail({ to, subject, text, html });
};

// =============================================================
// Interview Result Email — sent to user + admin
// =============================================================
const sendInterviewResultEmail = async ({ user, interview }) => {
  const to = user?.email;
  if (!to) return { skipped: true };

  const studentName = user?.displayName || user?.name || 'Student';
  const role = interview?.config?.role || 'your interview';
  const totalScore = Number(interview?.totalScore || 0);
  const questionCount = Array.isArray(interview?.questions) ? interview.questions.length : 0;
  const maxScore = questionCount > 0 ? questionCount * 10 : 0;
  const percent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const timeSpentMin = interview?.timeSpent ? Math.max(1, Math.round(interview.timeSpent / 60)) : null;

  const verdict = percent >= 80 ? 'Excellent work' : percent >= 60 ? 'Solid performance' : percent >= 40 ? 'Good effort' : 'Keep practicing';
  const accentColor = percent >= 60 ? BRAND.positive : percent >= 40 ? BRAND.accent : BRAND.danger;

  const subject = `Your interview result — ${percent}%`;
  const text = [
    `Hi ${studentName},`,
    '',
    `Your interview for ${role} is complete.`,
    `Score: ${totalScore}${maxScore ? `/${maxScore}` : ''} (${percent}%)`,
    `Questions: ${questionCount}`,
    timeSpentMin ? `Time spent: ${timeSpentMin} min` : '',
    '',
    `${verdict}. Open your dashboard for the full breakdown.`,
    '',
    '— Team Sansal'
  ].filter(Boolean).join('\n');

  const html = buildEmailLayout({
    title: `${verdict}, ${escapeHtml(studentName)}.`,
    preheader: `Your interview score: ${percent}%`,
    bodyHtml: `
      <p style="margin:0 0 14px;">
        Your AI mock interview for <strong>${escapeHtml(role)}</strong> is complete.
        Here's a quick summary — head to your dashboard for the question-by-question breakdown.
      </p>
      <div style="text-align:center;margin:18px 0 6px;">
        <div style="display:inline-block;padding:14px 26px;border-radius:14px;
                    background:${BRAND.accentBg};border:1px solid ${BRAND.accentBorder};">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.muted};">
            Final Score
          </div>
          <div style="font-size:38px;font-weight:800;color:${accentColor};line-height:1.1;margin-top:4px;font-family:Georgia,serif;">
            ${percent}%
          </div>
          <div style="font-size:13px;color:${BRAND.text2};margin-top:2px;">
            ${totalScore}${maxScore ? `&nbsp;/&nbsp;${maxScore}` : ''}
          </div>
        </div>
      </div>
    `,
    accentBlock: `
      <div><strong>Role:</strong> ${escapeHtml(role)}</div>
      <div><strong>Questions:</strong> ${questionCount}</div>
      ${timeSpentMin ? `<div><strong>Time spent:</strong> ${timeSpentMin} min</div>` : ''}
    `,
    cta: { label: 'View detailed report', href: 'https://sansal.in/dashboard' }
  });

  const adminTo = getAdminEmail();
  const adminHtml = buildEmailLayout({
    title: 'Interview completed by a student.',
    preheader: `${studentName} just completed an interview.`,
    bodyHtml: `<p style="margin:0;">An interview was completed on Sansal AI.</p>`,
    accentBlock: `
      <div><strong>Student:</strong> ${escapeHtml(studentName)} (${escapeHtml(to)})</div>
      <div><strong>College:</strong> ${escapeHtml(user?.college || '—')}</div>
      <div><strong>Role:</strong> ${escapeHtml(role)}</div>
      <div><strong>Score:</strong> ${totalScore}${maxScore ? `/${maxScore}` : ''} (${percent}%)</div>
      <div><strong>Questions:</strong> ${questionCount}</div>
      ${timeSpentMin ? `<div><strong>Time spent:</strong> ${timeSpentMin} min</div>` : ''}
    `,
    cta: { label: 'Open admin panel', href: 'https://sansal.in/admin' }
  });

  const userResult = await sendEmail({ to, subject, text, html });
  const adminResult = adminTo
    ? await sendEmail({
        to: adminTo,
        subject: `Interview completed: ${studentName} — ${percent}%`,
        text: `Interview completed on Sansal AI\n\nStudent: ${studentName} (${to})\nCollege: ${user?.college || '—'}\nRole: ${role}\nScore: ${totalScore}${maxScore ? `/${maxScore}` : ''} (${percent}%)`,
        html: adminHtml
      })
    : { skipped: true };

  return { user: userResult, admin: adminResult };
};

// =============================================================
// Aptitude Result Email — sent to user + admin
// =============================================================
const sendAptitudeResultEmail = async ({ user, attempt }) => {
  const to = user?.email;
  if (!to) return { skipped: true };

  const studentName = user?.displayName || user?.name || 'Student';
  const datasetLabel = attempt?.datasetLabel || 'Aptitude test';
  const scorePercent = Number(attempt?.scorePercent || 0);
  const totalQuestions = Number(attempt?.totalQuestions || 0);
  const correctCount = Number(attempt?.correctCount || 0);
  const incorrectCount = Number(attempt?.incorrectCount || 0);
  const unansweredCount = Number(attempt?.unansweredCount || 0);

  const verdict = scorePercent >= 80 ? 'Outstanding' : scorePercent >= 60 ? 'Well done' : scorePercent >= 40 ? 'Decent attempt' : 'Keep practicing';
  const accentColor = scorePercent >= 60 ? BRAND.positive : scorePercent >= 40 ? BRAND.accent : BRAND.danger;

  const subject = `Your aptitude result — ${scorePercent}%`;
  const text = [
    `Hi ${studentName},`,
    '',
    `Your aptitude test (${datasetLabel}) is scored.`,
    `Score: ${scorePercent}%`,
    `Correct: ${correctCount} / ${totalQuestions}`,
    `Incorrect: ${incorrectCount}`,
    `Unanswered: ${unansweredCount}`,
    '',
    `${verdict}. Open your dashboard for a question-by-question review.`,
    '',
    '— Team Sansal'
  ].join('\n');

  const html = buildEmailLayout({
    title: `${verdict}, ${escapeHtml(studentName)}.`,
    preheader: `Your aptitude score: ${scorePercent}%`,
    bodyHtml: `
      <p style="margin:0 0 14px;">
        Your aptitude test for <strong>${escapeHtml(datasetLabel)}</strong> is complete.
        Here's how you did:
      </p>
      <div style="text-align:center;margin:18px 0 6px;">
        <div style="display:inline-block;padding:14px 26px;border-radius:14px;
                    background:${BRAND.accentBg};border:1px solid ${BRAND.accentBorder};">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.muted};">
            Score
          </div>
          <div style="font-size:38px;font-weight:800;color:${accentColor};line-height:1.1;margin-top:4px;font-family:Georgia,serif;">
            ${scorePercent}%
          </div>
          <div style="font-size:13px;color:${BRAND.text2};margin-top:2px;">
            ${correctCount}&nbsp;/&nbsp;${totalQuestions} correct
          </div>
        </div>
      </div>
    `,
    accentBlock: `
      <div><strong>Test:</strong> ${escapeHtml(datasetLabel)}</div>
      <div><strong>Correct:</strong> ${correctCount}</div>
      <div><strong>Incorrect:</strong> ${incorrectCount}</div>
      <div><strong>Unanswered:</strong> ${unansweredCount}</div>
    `,
    cta: { label: 'Review answers', href: 'https://sansal.in/dashboard' }
  });

  const adminTo = getAdminEmail();
  const adminHtml = buildEmailLayout({
    title: 'Aptitude attempt submitted.',
    preheader: `${studentName} just completed an aptitude test.`,
    bodyHtml: `<p style="margin:0;">An aptitude test attempt was submitted on Sansal AI.</p>`,
    accentBlock: `
      <div><strong>Student:</strong> ${escapeHtml(studentName)} (${escapeHtml(to)})</div>
      <div><strong>College:</strong> ${escapeHtml(user?.college || '—')}</div>
      <div><strong>Test:</strong> ${escapeHtml(datasetLabel)}</div>
      <div><strong>Score:</strong> ${scorePercent}% (${correctCount}/${totalQuestions})</div>
      <div><strong>Incorrect:</strong> ${incorrectCount}, Unanswered: ${unansweredCount}</div>
    `,
    cta: { label: 'Open admin panel', href: 'https://sansal.in/admin' }
  });

  const userResult = await sendEmail({ to, subject, text, html });
  const adminResult = adminTo
    ? await sendEmail({
        to: adminTo,
        subject: `Aptitude completed: ${studentName} — ${scorePercent}%`,
        text: `Aptitude test completed on Sansal AI\n\nStudent: ${studentName} (${to})\nCollege: ${user?.college || '—'}\nTest: ${datasetLabel}\nScore: ${scorePercent}% (${correctCount}/${totalQuestions})`,
        html: adminHtml
      })
    : { skipped: true };

  return { user: userResult, admin: adminResult };
};

module.exports = {
  sendEmail,
  sendOtpEmail,
  sendMeetingStartedEmail,
  sendBookingConfirmation,
  sendExpertBookingNotification,
  sendPaymentSuccess,
  sendBookingAccepted,
  sendBookingRejected,
  sendWelcomeEmail,
  sendInterviewStartedEmail,
  sendInterviewResultEmail,
  sendAptitudeResultEmail
};


