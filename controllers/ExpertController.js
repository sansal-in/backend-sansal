const User = require("../models/User");
const Expert = require("../models/Expert");
const Interview = require("../models/Interview");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { generateToken } = require("../utils/token");
const { createNotification } = require("../services/notificationService");
const { hasRole, addRoles } = require("../utils/roleUtils");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const slotService = require("../services/slotService");
const emailService = require("../services/emailService");
const { asyncHandler, AppError } = require("../middleware/errorMiddleware");
const { buildPaginationQuery } = require("../utils/helpers");
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const mongoose = require('mongoose');

// Helper function to get authenticated expert
const getAuthenticatedExpert = async (req) => {
  // If req.expert is already set and is a valid Mongoose document
  if (req.expert && req.expert._id && typeof req.expert.addSlot === 'function') {
    return req.expert;
  }
  
  // If req.expert is set but not a full document, fetch it
  if (req.expert && req.expert._id) {
    const expert = await Expert.findById(req.expert._id);
    if (expert) return expert;
  }
  
  // Try to get from req.user
  if (req.user && req.user._id) {
    const expert = await Expert.findOne({ user: req.user._id });
    if (expert) {
      req.expert = expert;
      return expert;
    }
  }
  
  // Try to decode from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    
    // Try JWT
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      let expertId = decoded.expertId || decoded.id;
      
      if (expertId) {
        const expert = await Expert.findById(expertId);
        if (expert) {
          req.expert = expert;
          return expert;
        }
      }
      
      if (decoded.userId) {
        const expert = await Expert.findOne({ user: decoded.userId });
        if (expert) {
          req.expert = expert;
          return expert;
        }
      }
    } catch (jwtError) {
      console.log('JWT decode in helper failed:', jwtError.message);
    }
    
    // Try Firebase
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const expert = await Expert.findOne({ firebaseUid: decodedToken.uid });
      if (expert) {
        req.expert = expert;
        return expert;
      }
    } catch (fbError) {
      console.log('Firebase decode in helper failed:', fbError.message);
    }
  }
  
  return null;
};

const normalizeSlotType = (slot) => (slot?.type === 'group' ? 'group' : 'individual');

const getSlotCapacity = (slot, slotType) => {
  const normalizedType = slotType === 'group' ? 'group' : 'individual';
  let capacity = Number(slot?.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    capacity = normalizedType === 'group' ? 10 : 1;
  }
  if (normalizedType === 'individual') return 1;
  return Math.max(2, Math.min(10, capacity));
};

const getSlotBookedCount = (slot) => {
  let count = Number(slot?.bookedCount);
  if (!Number.isFinite(count) || count < 0) count = 0;
  if (Array.isArray(slot?.bookingIds) && slot.bookingIds.length > 0) {
    count = Math.max(count, slot.bookingIds.length);
  }
  if (count === 0 && slot?.bookingId) count = 1;
  return count;
};

exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      specialization,
      experience,
      bio,
      hourlyRate,
    } = req.body;
    const normalizedEmail = String(email || "")
      .toLowerCase()
      .trim();
    const normalizedHourlyRate = Number(hourlyRate);
    const normalizedExperience = Number(experience);
    const specializationArray = Array.isArray(specialization)
      ? specialization
      : typeof specialization === "string"
        ? specialization
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    if (!name || !normalizedEmail || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are required" });
    }

    if (!Number.isFinite(normalizedHourlyRate)) {
      return res
        .status(400)
        .json({ message: "Hourly rate must be a valid number" });
    }

    if (!Number.isFinite(normalizedExperience)) {
      return res
        .status(400)
        .json({ message: "Experience must be a valid number" });
    }

    if (specializationArray.length === 0) {
      return res.status(400).json({ message: "Specialization is required" });
    }

    // Check if user exists
    let user = await User.findOne({ email: normalizedEmail });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user (Expert)
    user = new User({
      displayName: name,
      email: normalizedEmail,
      phone,
      password: hashedPassword,
      role: ["student", "expert"],
      provider: "local",
      firebaseUid: `expert_${crypto.randomBytes(12).toString("hex")}`, // Generate placeholder UID to satisfy schema
    });

    await user.save();

    // Create Expert Profile
    const expert = new Expert({
      user: user._id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      name: user.displayName || name,
      specialization: specializationArray,
      experience: normalizedExperience,
      bio: bio || "",
      hourlyRate: normalizedHourlyRate,
      pricePerSession: normalizedHourlyRate,
      avatar: user.photoURL || "",
    });
    await expert.save();

    const token = generateToken(user._id);

    const expertProfile = await Expert.findById(expert._id).populate(
      "user",
      "displayName email photoURL phone role",
    );

    res.status(201).json({
      message: "Expert registered successfully",
      token,
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
        role: user.role,
      },
      expertProfile,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email }).select("+password"); // Explicitly select password
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check role
    if (!hasRole(user, "expert")) {
      return res
        .status(403)
        .json({ message: "Access denied. Not an expert account." });
    }

    // Get Expert Profile
    const expert = await Expert.findOne({ user: user._id });

    // Validate password
    if (!user.password) {
      return res
        .status(400)
        .json({
          message:
            "Invalid credentials. Please login via your original provider.",
        });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
        role: user.role,
      },
      expertProfile: expert,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { email, name, photoURL, uid } = req.body;

    let user = await User.findOne({ email });
    let expert;

    if (user) {
      // User exists - check role
      if (!hasRole(user, "expert")) {
        return res
          .status(403)
          .json({ message: "Access denied. Not an expert account." });
      }

      // Update firebaseUid/photo if missing (linking accounts)
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
        user.provider = "google";
        if (photoURL) user.photoURL = photoURL;
        await user.save();
      }

      expert = await Expert.findOne({ user: user._id });
    } else {
      // Create new user
      // Generate a random password to satisfy schema requirements
      const randomPassword = Math.random().toString(36).slice(-8);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = new User({
        displayName: name,
        email,
        password: hashedPassword,
        role: ["student", "expert"],
        provider: "google",
        firebaseUid: uid,
        photoURL,
      });
      await user.save();

      // Create default Expert Profile
      expert = new Expert({
        user: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.displayName || name || user.email,
        specialization: "Not set",
        experience: 0,
        bio: "Not set",
        hourlyRate: 0,
        pricePerSession: 0,
        avatar: user.photoURL || photoURL || "",
      });
      await expert.save();
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL,
      },
      expertProfile: expert,
    });
  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.becomeExpert = async (req, res) => {
  try {
    const { specialization, experience, bio, hourlyRate, pricePerSession } =
      req.body;
    const userId = req.user.id;

    // Validation
    const normalizedPrice = pricePerSession ?? hourlyRate;
    const missingExperience =
      experience === undefined || experience === null || experience === "";
    const missingPrice =
      normalizedPrice === undefined ||
      normalizedPrice === null ||
      normalizedPrice === "";
    if (!specialization || missingExperience || missingPrice) {
      return res.status(400).json({
        message: "Specialization, experience, and hourly rate are required",
      });
    }

    // Check if already expert
    let expert = await Expert.findOne({ user: userId });
    if (expert) {
      return res.status(400).json({
        message: "User is already an expert",
        expert,
      });
    }

    // Update User role to include expert
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = addRoles(user.role, ["student", "expert"]);
    await user.save();

    // Create Expert Profile
    expert = new Expert({
      user: userId,
      firebaseUid: user.firebaseUid,
      email: user.email,
      name: user.displayName || user.email,
      specialization,
      experience: Number(experience),
      bio,
      hourlyRate: Number(hourlyRate ?? normalizedPrice),
      pricePerSession: Number(normalizedPrice),
      avatar: user.photoURL || "",
      isVerified: false, // Initially unverified, can be verified by admin later
    });
    await expert.save();

    // Populate user data
    const populatedExpert = await Expert.findById(expert._id).populate(
      "user",
      "email displayName photoURL",
    );

    res.status(200).json({
      message: "Successfully upgraded to expert. Your profile is under review.",
      expert: populatedExpert,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Become expert error:", error);
    res.status(500).json({
      message: "Server error while upgrading to expert",
      error: error.message,
    });
  }
};

exports.healthCheck = async (req, res) => {
  try {
    res.status(200).json({ message: "Server is running" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.bookExpert = async (req, res) => {
  try {
    const { expertId, timeSlot, notes, slotId, duration, sessionType } =
      req.body;
    const userId = req.user.id;

    if (!expertId || (!timeSlot && !slotId)) {
      return res
        .status(400)
        .json({ message: "Expert ID and time slot are required" });
    }

    const expertProfile = await Expert.findById(expertId).populate(
      "user",
      "displayName email",
    );
    if (!expertProfile) {
      return res.status(404).json({ message: "Expert not found" });
    }

    const expertUserId = expertProfile.user?._id?.toString();
    if (expertUserId && expertUserId === userId.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot book your own session" });
    }

    const requestedType =
      sessionType === "group"
        ? "group"
        : sessionType === "individual"
          ? "individual"
          : null;

    if (sessionType && !requestedType) {
      return res.status(400).json({ message: "Invalid session type" });
    }

    let selectedSlot = null;

    const padTime = (value) => String(value).padStart(2, "0");

    if (slotId) {
      selectedSlot = expertProfile.availableSlots.id(slotId);
      if (!selectedSlot) {
        return res.status(404).json({ message: "Selected slot not found" });
      }
    } else if (timeSlot) {
      const scheduledDate = new Date(timeSlot);
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ message: "Invalid time slot provided" });
      }

      const startTime = `${padTime(scheduledDate.getHours())}:${padTime(scheduledDate.getMinutes())}`;
      const sessionMinutes =
        Number(duration) || expertProfile.sessionDuration || 60;
      const endDate = new Date(
        scheduledDate.getTime() + sessionMinutes * 60 * 1000,
      );
      const endTime = `${padTime(endDate.getHours())}:${padTime(endDate.getMinutes())}`;

      selectedSlot = expertProfile.availableSlots.find((slot) => {
        const slotDate = new Date(slot.date);
        return (
          slotDate.toDateString() === scheduledDate.toDateString() &&
          slot.startTime === startTime
        );
      });

      if (!selectedSlot) {
        expertProfile.availableSlots.push({
          date: new Date(scheduledDate),
          startTime,
          endTime,
          status: "available",
          type: requestedType === "group" ? "group" : "individual",
          capacity: requestedType === "group" ? 10 : 1,
          bookedCount: 0,
        });
        selectedSlot =
          expertProfile.availableSlots[expertProfile.availableSlots.length - 1];
      }
    }

    if (!selectedSlot) {
      return res
        .status(400)
        .json({ message: "Please select a valid time slot" });
    }

    const slotType = normalizeSlotType(selectedSlot);
    if (requestedType && slotType !== requestedType) {
      return res.status(400).json({
        message: `Selected slot is for ${slotType} sessions`,
      });
    }
    const capacity = getSlotCapacity(selectedSlot, slotType);
    const bookedCount = getSlotBookedCount(selectedSlot);
    const lockedCount = Array.isArray(selectedSlot.lockedSeats)
      ? selectedSlot.lockedSeats.length
      : 0;

    if (slotType === "group") {
      if (
        selectedSlot.status === "booked" ||
        bookedCount + lockedCount >= capacity
      ) {
        return res.status(400).json({ message: "Selected group slot is full" });
      }
    } else if (selectedSlot.status !== "available") {
      return res
        .status(400)
        .json({ message: "Selected slot is not available" });
    }

    const slotDateTime = new Date(selectedSlot.date);
    const [hours, minutes] = selectedSlot.startTime.split(":").map(Number);
    slotDateTime.setHours(hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);

    if (slotDateTime <= new Date()) {
      return res
        .status(400)
        .json({ message: "Please select a future time slot" });
    }

    const booking = await Booking.create({
      userId,
      expertId,
      slot: {
        slotId: selectedSlot._id,
        date: selectedSlot.date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
      },
      sessionType: slotType,
      amount: expertProfile.pricePerSession || 0,
      currency: expertProfile.currency || "INR",
      paymentMode: "free",
      status: "confirmed",
      notes: {
        userNotes: notes || "",
      },
    });

    if (slotType === "group") {
      if (!Array.isArray(selectedSlot.bookingIds)) {
        selectedSlot.bookingIds = [];
      }
      const bookingIdStr = booking._id.toString();
      if (
        !selectedSlot.bookingIds.some((id) => id.toString() === bookingIdStr)
      ) {
        selectedSlot.bookingIds.push(booking._id);
      }
      selectedSlot.bookingId = null;
      selectedSlot.type = "group";
      selectedSlot.capacity = capacity;
      selectedSlot.bookedCount = getSlotBookedCount(selectedSlot);
      selectedSlot.status =
        selectedSlot.bookedCount >= capacity ? "booked" : "available";
      selectedSlot.lockedAt = null;
      selectedSlot.lockedBy = null;
    } else {
      selectedSlot.status = "booked";
      selectedSlot.bookingId = booking._id;
      selectedSlot.type = "individual";
      selectedSlot.capacity = 1;
      selectedSlot.bookedCount = 1;
      selectedSlot.lockedAt = null;
      selectedSlot.lockedBy = null;
    }
    await expertProfile.save();

    try {
      const studentName = req.user.displayName || req.user.email || "Student";
      const scheduledLabel = slotDateTime.toISOString();

      await createNotification({
        userId: expertProfile.user?._id,
        type: "booking",
        audience: "expert",
        title: "New session booking",
        message: `${studentName} booked a session for ${scheduledLabel}.`,
        data: {
          bookingId: booking._id,
          studentId: userId,
          studentName,
          studentEmail: req.user.email,
          scheduledAt: booking.scheduledAt || slotDateTime.toISOString(),
        },
      });
    } catch (notifyError) {
      console.error("Failed to create booking notification:", notifyError);
    }

    try {
      await emailService.sendExpertBookingNotification(
        booking,
        req.user,
        expertProfile,
      );
    } catch (emailError) {
      console.error("Failed to send expert booking email:", emailError);
    }

    res.status(200).json({
      message: "Booking created successfully",
      booking,
    });
  } catch (error) {
    console.error("Book expert error:", error);
    res.status(500).json({ message: "Server error while booking session" });
  }
};

exports.getExpertBookings = async (req, res) => {
  try {
    // Build identifier queries (use a single $or to ensure consistent matching)
    const identifiers = [{ user: req.user._id }];
    if (req.user.firebaseUid)
      identifiers.push({ firebaseUid: req.user.firebaseUid });
    if (req.user.email)
      identifiers.push({ email: req.user.email.toLowerCase() });

    let expert = await Expert.findOne({ $or: identifiers });

    // If we found an expert record but it's not linked to the User doc, link it.
    if (expert && !expert.user) {
      try {
        expert.user = req.user._id;
        await expert.save();
      } catch (linkErr) {
        console.error("Failed to link expert.user:", linkErr);
      }
    }

    if (!expert) {
      try {
        const newExpert = new Expert({
          user: req.user._id,
          firebaseUid:
            req.user.firebaseUid ||
            `expert_${crypto.randomBytes(6).toString("hex")}`,
          email: req.user.email
            ? req.user.email.toLowerCase()
            : `expert_${Date.now()}@example.com`,
          name: req.user.displayName || "Expert",
          pricePerSession: 0,
          hourlyRate: req.user.hourlyRate || 0,
          isVerified: false,
        });

        await newExpert.save();
        expert = newExpert;
      } catch (createErr) {
        return res.status(404).json({ message: "Expert profile not found" });
      }
    }

    const bookings = await Booking.find({ expertId: expert._id })
      .populate(
        "userId",
        "displayName email photoURL phone interviewsCompleted averageScore",
      )
      .sort({ "slot.date": 1, "slot.startTime": 1 });

    // Calculate unique students count
    const uniqueStudents = new Set(
      bookings.map((b) => b.userId?._id.toString()).filter(Boolean),
    );

    res.status(200).json({
      success: true,
      bookings,
      expert,
      totalUniqueStudents: uniqueStudents.size,
    });
  } catch (error) {
    console.error("Get expert bookings error:", error);
    res.status(500).json({ message: "Server error while fetching bookings" });
  }
};

exports.getBookingDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid booking ID format" 
      });
    }
    
    const expert = await Expert.findOne({ user: req.user.id });

    if (!expert) {
      return res.status(404).json({ 
        success: false,
        message: "Expert profile not found" 
      });
    }

    const booking = await Booking.findOne({
      _id: id,
      expertId: expert._id,
    }).populate(
      "userId",
      "displayName email photoURL phone interviewsCompleted averageScore",
    );

    if (!booking) {
      return res.status(404).json({ 
        success: false,
        message: "Booking not found" 
      });
    }

    // Only fetch interviews if userId exists
    let interviews = [];
    if (booking?.userId?._id) {
      interviews = await Interview.find({ userId: booking.userId._id })
        .sort({ completedAt: -1 })
        .select(
          "config role company difficulty totalScore timeSpent completedAt createdAt status",
        );
    }

    const bookingData = booking.toObject();
    bookingData.interviews = interviews;

    res.status(200).json({
      success: true,
      data: bookingData,  // Frontend expects 'data' field
    });
  } catch (error) {
    console.error("Get booking details error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error while fetching booking details" 
    });
  }
};

exports.getExpertStudents = async (req, res) => {
  try {
    const expert = await Expert.findOne({ user: req.user.id });
    if (!expert) {
      return res.status(404).json({ message: "Expert profile not found" });
    }

    // Aggregate to find unique students and count their sessions
    const students = await Booking.aggregate([
      {
        $match: {
          expertId: expert._id,
          status: { $nin: ["cancelled", "rejected"] },
        },
      },
      {
        $group: {
          _id: "$userId",
          totalSessions: { $sum: 1 },
          lastSession: { $max: "$slot.date" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "studentInfo",
        },
      },
      { $unwind: "$studentInfo" },
      {
        $project: {
          _id: 1,
          totalSessions: 1,
          lastSession: 1,
          name: "$studentInfo.displayName",
          email: "$studentInfo.email",
          photoURL: "$studentInfo.photoURL",
          phone: "$studentInfo.phone",
          interviewsCompleted: "$studentInfo.interviewsCompleted",
          averageScore: "$studentInfo.averageScore",
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: students.length,
      students,
    });
  } catch (error) {
    console.error("Get expert students error:", error);
    res.status(500).json({ message: "Server error while fetching students" });
  }
};

exports.getStudentDetailsForExpert = async (req, res) => {
  try {
    const { studentId } = req.params;
    const expert = await Expert.findOne({ user: req.user.id });

    if (!expert) {
      return res.status(404).json({ message: "Expert profile not found" });
    }

    // Check if student has booked with this expert
    const hasBooking = await Booking.findOne({
      expertId: expert._id,
      userId: studentId,
    });
    if (!hasBooking) {
      return res
        .status(403)
        .json({
          message:
            "Access denied. This student has not booked a session with you.",
        });
    }

    const student = await User.findById(studentId).select("-password");
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Get all interviews of the student (background)
    const interviews = await Interview.find({ userId: studentId })
      .sort({ completedAt: -1 })
      .select(
        "role company difficulty totalScore timeSpent completedAt feedback status",
      );

    res.status(200).json({
      success: true,
      student,
      interviews,
    });
  } catch (error) {
    console.error("Get student details error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching student details" });
  }
};

exports.getExperts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    skills,
    minPrice,
    maxPrice,
    sortBy,
  } = req.query;

  // Build query
  const query = { isActive: true };

  if (skills) {
    const skillArray = skills.split(",").map((s) => s.trim());
    query.skills = { $in: skillArray };
  }

  if (minPrice || maxPrice) {
    query.pricePerSession = {};
    if (minPrice) query.pricePerSession.$gte = Number(minPrice);
    if (maxPrice) query.pricePerSession.$lte = Number(maxPrice);
  }

  // Build sort
  let sort = { "rating.average": -1 }; // Default sort by rating
  if (sortBy === "price_low") sort = { pricePerSession: 1 };
  if (sortBy === "price_high") sort = { pricePerSession: -1 };
  if (sortBy === "experience") sort = { experience: -1 };

  const { skip, limit: limitNum } = buildPaginationQuery(page, limit);

  const [experts, total] = await Promise.all([
    Expert.find(query)
      .select("-availableSlots -firebaseUid")
      .sort(sort)
      .skip(skip)
      .limit(limitNum),
    Expert.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: experts,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      hasNext: skip + limitNum < total,
      hasPrev: parseInt(page) > 1,
    },
  });
});

// Get expert by ID
exports.getExpertById = asyncHandler(async (req, res) => {
  const expert = await Expert.findById(req.params.id);

  if (!expert) {
    throw new AppError("Expert not found", 404);
  }

  res.status(200).json({
    success: true,
    data: expert,
  });
});

// Get expert's available slots
exports.getExpertSlots = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const slots = await slotService.getAvailableSlots(
    req.params.id,
    startDate,
    endDate,
  );

  res.status(200).json({
    success: true,
    data: slots,
  });
});

// Get expert profile
exports.getMyProfile = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: req.expert,
  });
});

// Update expert profile
exports.updateMyProfile = asyncHandler(async (req, res) => {
  const allowedFields = [
    "name",
    "phone",
    "avatar",
    "bio",
    "title",
    "company",
    "experience",
    "skills",
    "specializations",
    "languages",
    "pricePerSession",
    "sessionDuration",
    "socialLinks",
    "timezone",
  ];

  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  const expert = await Expert.findByIdAndUpdate(req.expert._id, updates, {
    returnDocument: "after",
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: expert,
  });
});

// ===== SLOT CONTROLLER =====

// Get all slots
exports.getMySlots = asyncHandler(async (req, res) => {
  const expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  const slots = expert.availableSlots.sort((a, b) => {
    const dateCompare = new Date(a.date) - new Date(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.startTime.localeCompare(b.startTime);
  });

  const normalizedSlots = slots.map(slot => {
    // ... your normalization code ...
    const slotType = slot.type === 'group' ? 'group' : 'individual';
    let capacity = Number(slot.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      capacity = slotType === 'group' ? 10 : 1;
    }
    if (slotType === 'individual') capacity = 1;
    
    let bookedCount = Number(slot.bookedCount);
    if (!Number.isFinite(bookedCount) || bookedCount < 0) bookedCount = 0;
    if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
      bookedCount = Math.max(bookedCount, slot.bookingIds.length);
    }
    if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
    
    const obj = slot.toObject ? slot.toObject() : slot;
    return {
      ...obj,
      type: slotType,
      capacity,
      bookedCount,
      remainingSeats: Math.max(0, capacity - bookedCount)
    };
  });
  
  res.status(200).json({
    success: true,
    data: normalizedSlots
  });
});

// Get slot stats
exports.getSlotStats = asyncHandler(async (req, res) => {
  const expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  const slots = expert.availableSlots || [];
  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  // Initialize stats
  let stats = {
    totalSlots: slots.length,
    activeSlots: 0,
    bookedSlots: 0,
    inactiveSlots: 0,
    individualSlots: 0,
    groupSlots: 0,
    upcomingSlots: 0,
    pastSlots: 0,
    todaySlots: 0,
    thisMonthSlots: 0,
    totalBookings: 0,
    confirmedBookings: 0,
    completedBookings: 0,
    revenue: expert.totalEarnings || 0,
    revenueThisMonth: 0,
    utilizationRate: 0
  };
  
  // Calculate slot statistics
  let totalCapacity = 0;
  let totalBookedCount = 0;
  
  slots.forEach(slot => {
    const slotDate = new Date(slot.date);
    const slotType = slot.type === 'group' ? 'group' : 'individual';
    
    // Calculate capacity
    let capacity = Number(slot.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      capacity = slotType === 'group' ? 10 : 1;
    }
    if (slotType === 'individual') capacity = 1;
    
    totalCapacity += capacity;
    
    // Calculate booked count
    let bookedCount = Number(slot.bookedCount) || 0;
    if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
      bookedCount = Math.max(bookedCount, slot.bookingIds.length);
    }
    if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
    
    totalBookedCount += bookedCount;
    
    // Count by type
    if (slotType === 'individual') {
      stats.individualSlots++;
    } else {
      stats.groupSlots++;
    }
    
    // Count by status
    if (bookedCount > 0) {
      stats.bookedSlots++;
      stats.totalBookings += bookedCount;
    } else if (slot.status === 'available') {
      stats.activeSlots++;
    } else if (slot.status === 'locked') {
      stats.inactiveSlots++;
    }
    
    // Count by timeframe
    if (slotDate.toDateString() === today.toDateString()) {
      stats.todaySlots++;
    }
    if (slotDate >= today) {
      stats.upcomingSlots++;
    } else {
      stats.pastSlots++;
    }
    if (slotDate >= thisMonthStart && slotDate < nextMonthStart) {
      stats.thisMonthSlots++;
    }
  });
  
  // Calculate utilization rate
  if (totalCapacity > 0) {
    stats.utilizationRate = Math.round((totalBookedCount / totalCapacity) * 100);
  }
  
  // Get revenue this month from bookings
  try {
    const monthBookings = await Booking.find({
      expertId: expert._id,
      createdAt: { $gte: thisMonthStart, $lt: nextMonthStart },
      status: { $in: ['completed', 'paid', 'accepted'] }
    });
    
    stats.revenueThisMonth = monthBookings.reduce((sum, b) => sum + (b.amount || 0), 0);
    stats.confirmedBookings = monthBookings.filter(b => ['paid', 'accepted'].includes(b.status)).length;
    stats.completedBookings = monthBookings.filter(b => b.status === 'completed').length;
  } catch (error) {
    console.log('Error fetching bookings for stats:', error.message);
  }
  // Return in format frontend expects (StatsCards component)
  res.status(200).json({
    success: true,
    data: {
      // Direct stats object
      stats: stats,
      // Flat structure for StatsCards component
      totalSlots: stats.totalSlots,
      activeSlots: stats.activeSlots,
      bookedSlots: stats.bookedSlots,
      inactiveSlots: stats.inactiveSlots,
      individualSlots: stats.individualSlots,
      groupSlots: stats.groupSlots,
      upcomingSlots: stats.upcomingSlots,
      totalBookings: stats.totalBookings,
      revenue: stats.revenue,
      revenueThisMonth: stats.revenueThisMonth,
      utilizationRate: stats.utilizationRate
    }
  });
});

// Create slot
exports.addSlot = asyncHandler(async (req, res) => {
  let expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  const { date, startTime, endTime, type, capacity } = req.body;
  
  const slot = await expert.addSlot({ date, startTime, endTime, type, capacity });
  
  res.status(201).json({
    success: true,
    data: slot
  });
});

// Update slot
exports.updateSlot = asyncHandler(async (req, res) => {
  const { date, startTime, endTime, type, capacity } = req.body;
  const slotId = req.params.slotId;

  let expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  // Refetch expert to get fresh data
  expert = await Expert.findById(expert._id);
  const slot = expert.availableSlots.id(slotId);

  if (!slot) {
    throw new AppError('Slot not found', 404);
  }

  // Check bookings
  let bookedCount = Number(slot.bookedCount) || 0;
  if (Array.isArray(slot.bookingIds)) {
    bookedCount = Math.max(bookedCount, slot.bookingIds.length);
  }
  if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
  
  if (bookedCount > 0) {
    throw new AppError('Cannot edit a booked slot', 400);
  }

  // Check duplicate
  const duplicate = expert.availableSlots.find(
    s =>
      s._id.toString() !== slotId.toString() &&
      new Date(s.date).toDateString() === new Date(date).toDateString() &&
      s.startTime === startTime
  );

  if (duplicate) {
    throw new AppError('Slot already exists for this time', 400);
  }

  slot.date = new Date(date);
  slot.startTime = startTime;
  slot.endTime = endTime;
  slot.type = type === 'group' ? 'group' : 'individual';
  
  let newCapacity = Number(capacity);
  if (!Number.isFinite(newCapacity) || newCapacity <= 0) {
    newCapacity = slot.type === 'group' ? 10 : 1;
  }
  if (slot.type === 'individual') newCapacity = 1;
  else newCapacity = Math.max(2, Math.min(10, newCapacity));
  
  slot.capacity = newCapacity;

  await expert.save();

  res.status(200).json({
    success: true,
    data: slot
  });
});

// Delete a slot
exports.deleteSlot = asyncHandler(async (req, res) => {
  const { slotId } = req.params;
  
  const expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  const freshExpert = await Expert.findById(expert._id);
  
  // Find slot reliably
  let slot = null;
  try {
    slot = freshExpert.availableSlots.id(slotId);
  } catch (e) {
    slot = freshExpert.availableSlots.find(
      s => s._id.toString() === slotId.toString()
    );
  }
  
  if (!slot) {
    throw new AppError('Slot not found', 404);
  }
  
  const slotDate = new Date(slot.date);
  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  const isPastSlot = slotDate < today;
  
  let bookedCount = Number(slot.bookedCount) || 0;
  if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
    bookedCount = Math.max(bookedCount, slot.bookingIds.length);
  }
  if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
  
  const hasBookings = bookedCount > 0;
  
  if (!isPastSlot && hasBookings) {
    throw new AppError('Cannot delete a future slot that has bookings', 400);
  }
  
  // Remove using filter
  freshExpert.availableSlots = freshExpert.availableSlots.filter(
    s => s._id.toString() !== slot._id.toString()
  );
  
  await freshExpert.save();
  
  res.status(200).json({
    success: true,
    message: 'Slot deleted successfully'
  });
});

// Toggle slot status
exports.toggleSlotStatus = asyncHandler(async (req, res) => {
  const expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  const { slotId } = req.params;
  const { status } = req.body;
  
  const freshExpert = await Expert.findById(expert._id);
  const slot = freshExpert.availableSlots.id(slotId);
  
  if (!slot) {
    throw new AppError('Slot not found', 404);
  }
  
  let bookedCount = Number(slot.bookedCount) || 0;
  if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
    bookedCount = Math.max(bookedCount, slot.bookingIds.length);
  }
  if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
  
  if (bookedCount > 0) {
    throw new AppError('Cannot change status of a booked slot', 400);
  }
  
  if (status) {
    if (!['available', 'locked'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }
    slot.status = status;
  } else {
    slot.status = slot.status === 'available' ? 'locked' : 'available';
  }
  
  await freshExpert.save();
  
  res.status(200).json({
    success: true,
    data: slot
  });
});

// Bulk delete slots
exports.bulkDeleteSlots = asyncHandler(async (req, res) => {
  const expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  const { slotIds } = req.body;
  
  console.log('bulkDeleteSlots - Received slotIds:', slotIds);
  
  if (!Array.isArray(slotIds) || slotIds.length === 0) {
    throw new AppError('Please provide an array of slot IDs', 400);
  }
  
  // Refetch expert to get fresh data
  const freshExpert = await Expert.findById(expert._id);
  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  
  console.log('Expert availableSlots count:', freshExpert.availableSlots.length);
  
  const results = {
    deleted: [],
    failed: []
  };
  
  for (const slotId of slotIds) {
    try {
      console.log('Processing slotId:', slotId);
      
      // Find slot by trying multiple methods
      let slot = null;
      let slotIndex = -1;
      
      // Method 1: Try using Mongoose's .id() method
      try {
        slot = freshExpert.availableSlots.id(slotId);
        if (slot) {
          console.log('Found slot via .id() method');
        }
      } catch (e) {
        console.log('.id() method failed:', e.message);
      }
      
      // Method 2: Try finding by string comparison
      if (!slot) {
        for (let i = 0; i < freshExpert.availableSlots.length; i++) {
          const s = freshExpert.availableSlots[i];
          if (s._id.toString() === slotId.toString()) {
            slot = s;
            slotIndex = i;
            console.log('Found slot via string comparison at index:', i);
            break;
          }
        }
      }
      
      if (!slot) {
        console.log('Slot not found for ID:', slotId);
        results.failed.push({ slotId, reason: 'Slot not found' });
        continue;
      }
      
      const slotDate = new Date(slot.date);
      const isPastSlot = slotDate < today;
      
      let bookedCount = Number(slot.bookedCount) || 0;
      if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
        bookedCount = Math.max(bookedCount, slot.bookingIds.length);
      }
      if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
      
      const hasBookings = bookedCount > 0;
      
      console.log('Slot details:', {
        id: slot._id.toString(),
        date: slot.date,
        isPastSlot,
        hasBookings,
        bookedCount
      });
      
      // Only block future slots with bookings
      if (!isPastSlot && hasBookings) {
        results.failed.push({ slotId, reason: 'Future slot has bookings' });
        continue;
      }
      
      // Remove the slot using splice (more reliable than pull)
      if (slotIndex !== -1) {
        freshExpert.availableSlots.splice(slotIndex, 1);
      } else {
        // Fallback to filter
        freshExpert.availableSlots = freshExpert.availableSlots.filter(
          s => s._id.toString() !== slot._id.toString()
        );
      }
      
      results.deleted.push(slotId);
      console.log('Slot deleted successfully');
      
    } catch (error) {
      console.error('Error processing slot:', slotId, error);
      results.failed.push({ slotId, reason: error.message });
    }
  }
  
  console.log('Bulk delete results:', results);
  
  if (results.deleted.length > 0) {
    await freshExpert.save();
  }
  
  res.status(200).json({
    success: true,
    message: `Deleted ${results.deleted.length} slots successfully`,
    data: results
  });
});

// Get calendar slots
exports.getCalendarSlots = asyncHandler(async (req, res) => {
  // Use the helper instead of req.expert directly
  const expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  const { month, year } = req.query;
  
  let slots = expert.availableSlots;
  
  if (month && year) {
    const filterStartDate = new Date(year, month - 1, 1);
    const filterEndDate = new Date(year, month, 0);
    
    slots = slots.filter(slot => {
      const slotDate = new Date(slot.date);
      return slotDate >= filterStartDate && slotDate <= filterEndDate;
    });
  }
  
  const calendarData = {};
  
  slots.forEach(slot => {
    const slotDate = new Date(slot.date);
    const dateKey = slotDate.toISOString().split('T')[0];
    
    if (!calendarData[dateKey]) {
      calendarData[dateKey] = {
        date: dateKey,
        slots: [],
        summary: {
          total: 0,
          available: 0,
          booked: 0
        }
      };
    }
    
    const slotType = slot.type === 'group' ? 'group' : 'individual';
    let capacity = Number(slot.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      capacity = slotType === 'group' ? 10 : 1;
    }
    
    let bookedCount = Number(slot.bookedCount) || 0;
    if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
      bookedCount = Math.max(bookedCount, slot.bookingIds.length);
    }
    if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
    
    const normalizedSlot = {
      ...slot.toObject(),
      type: slotType,
      capacity,
      bookedCount,
      remainingSeats: Math.max(0, capacity - bookedCount)
    };
    
    calendarData[dateKey].slots.push(normalizedSlot);
    calendarData[dateKey].summary.total++;
    
    if (bookedCount > 0) {
      calendarData[dateKey].summary.booked++;
    } else if (slot.status === 'available') {
      calendarData[dateKey].summary.available++;
    }
  });
  
  const calendar = Object.values(calendarData).sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  res.status(200).json({
    success: true,
    data: { calendar }
  });
});

// Bulk add slots
exports.bulkAddSlots = asyncHandler(async (req, res) => {
  const { slots } = req.body;
  
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new AppError('Please provide an array of slots', 400);
  }
  
  const result = await slotService.bulkAddSlots(req.expert._id, slots);
  
  res.status(201).json({
    success: true,
    message: `${result.added} slots added successfully`,
    errors: result.errors
  });
});

// Get single slot
exports.getSlotById = asyncHandler(async (req, res) => {
  const expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  const { slotId } = req.params;
  
  const slot = expert.availableSlots.id(slotId);
  
  if (!slot) {
    throw new AppError('Slot not found', 404);
  }
  
  const slotType = slot.type === 'group' ? 'group' : 'individual';
  let capacity = Number(slot.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    capacity = slotType === 'group' ? 10 : 1;
  }
  
  let bookedCount = Number(slot.bookedCount) || 0;
  if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
    bookedCount = Math.max(bookedCount, slot.bookingIds.length);
  }
  if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
  
  const normalizedSlot = {
    ...slot.toObject(),
    type: slotType,
    capacity,
    bookedCount,
    remainingSeats: Math.max(0, capacity - bookedCount),
    hasBookings: bookedCount > 0
  };
  
  res.status(200).json({
    success: true,
    data: normalizedSlot
  });
});

// Clone slots
exports.cloneSlots = asyncHandler(async (req, res) => {
  const { sourceDate, targetDates, slotIds } = req.body;
  
  if (!targetDates || !Array.isArray(targetDates) || targetDates.length === 0) {
    throw new AppError('Please provide target dates', 400);
  }
  
  const expert = await Expert.findById(req.expert._id);
  
  let slotsToClone;
  
  if (slotIds && Array.isArray(slotIds) && slotIds.length > 0) {
    slotsToClone = expert.availableSlots.filter(slot => 
      slotIds.includes(slot._id.toString())
    );
  } else if (sourceDate) {
    const sourceDateObj = new Date(sourceDate);
    slotsToClone = expert.availableSlots.filter(slot => 
      new Date(slot.date).toDateString() === sourceDateObj.toDateString()
    );
  } else {
    throw new AppError('Please provide either slotIds or sourceDate', 400);
  }
  
  let clonedCount = 0;
  
  for (const targetDate of targetDates) {
    const targetDateObj = new Date(targetDate);
    
    for (const sourceSlot of slotsToClone) {
      const duplicate = expert.availableSlots.find(s => 
        new Date(s.date).toDateString() === targetDateObj.toDateString() &&
        s.startTime === sourceSlot.startTime
      );
      
      if (!duplicate) {
        expert.availableSlots.push({
          date: targetDateObj,
          startTime: sourceSlot.startTime,
          endTime: sourceSlot.endTime,
          status: 'available',
          type: sourceSlot.type,
          capacity: sourceSlot.capacity,
          bookedCount: 0
        });
        clonedCount++;
      }
    }
  }
  
  if (clonedCount > 0) {
    await expert.save();
  }
  
  res.status(201).json({
    success: true,
    message: `Cloned ${clonedCount} slots successfully`
  });
});

// Cleanup past slots
exports.cleanupPastSlots = asyncHandler(async (req, res) => {
  const expert = await getAuthenticatedExpert(req);
  
  if (!expert) {
    throw new AppError('Expert not authenticated', 401);
  }
  
  const { olderThanDays = 30, deleteWithBookings = true } = req.body;
  
  const freshExpert = await Expert.findById(expert._id);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  const slotsToDelete = [];
  const skippedSlots = [];
  
  freshExpert.availableSlots.forEach(slot => {
    const slotDate = new Date(slot.date);
    
    if (slotDate < cutoffDate) {
      let bookedCount = Number(slot.bookedCount) || 0;
      if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
        bookedCount = Math.max(bookedCount, slot.bookingIds.length);
      }
      if (bookedCount === 0 && slot.bookingId) bookedCount = 1;
      
      if (bookedCount > 0 && !deleteWithBookings) {
        skippedSlots.push({
          slotId: slot._id,
          date: slot.date,
          reason: 'Has bookings'
        });
      } else {
        slotsToDelete.push(slot._id);
      }
    }
  });
  
  slotsToDelete.forEach(slotId => {
    freshExpert.availableSlots.pull(slotId);
  });
  
  await freshExpert.save();
  
  res.status(200).json({
    success: true,
    message: `Cleaned up ${slotsToDelete.length} past slots`,
    data: {
      deleted: slotsToDelete.length,
      skipped: skippedSlots
    }
  });
});


// ===== BOOKING CONTROLLER =====

// get booking stats
exports.getBookingStats = asyncHandler(async (req, res) => {
  const expertId = req.expert._id;

  // Get all bookings for this expert
  const bookings = await Booking.find({ expertId });

  // Calculate statistics
  const stats = {
    total: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    paid: bookings.filter(b => b.status === 'paid').length,
    accepted: bookings.filter(b => b.status === 'accepted').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    rejected: bookings.filter(b => b.status === 'rejected').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
    noShow: bookings.filter(b => b.status === 'no-show').length
  };

  // Calculate additional metrics
  const now = new Date();
  const upcomingSessions = bookings.filter(b => 
    b.status === 'accepted' && new Date(b.slot.date) >= now
  );
  
  const pastSessions = bookings.filter(b => 
    ['completed', 'no-show'].includes(b.status)
  );

  const totalEarnings = bookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + (b.amount || 0), 0);

  // Monthly stats for last 6 months
  const monthlyStats = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const monthBookings = bookings.filter(b => {
      const bookingDate = new Date(b.createdAt);
      return bookingDate >= monthStart && bookingDate <= monthEnd;
    });

    monthlyStats.push({
      month: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
      total: monthBookings.length,
      completed: monthBookings.filter(b => b.status === 'completed').length,
      earnings: monthBookings
        .filter(b => b.status === 'completed')
        .reduce((sum, b) => sum + (b.amount || 0), 0)
    });
  }

  res.status(200).json({
    success: true,
    data: {
      ...stats,
      upcomingCount: upcomingSessions.length,
      pastCount: pastSessions.length,
      totalEarnings,
      completionRate: stats.total > 0 
        ? ((stats.completed / stats.total) * 100).toFixed(2) 
        : 0,
      acceptanceRate: stats.total > 0 
        ? (((stats.accepted + stats.completed) / stats.total) * 100).toFixed(2)
        : 0,
      monthlyStats
    }
  });
});

// Get expert bookings
exports.getAllBookings = asyncHandler(async (req, res) => {
  const { 
    status, 
    search, 
    fromDate, 
    toDate, 
    page = 1, 
    limit = 10,
    sortBy = 'slot.date',
    sortOrder = 'desc'
  } = req.query;

  const expertId = req.expert._id;
  const query = { expertId };

  // Status filter
  if (status) {
    if (Array.isArray(status)) {
      query.status = { $in: status };
    } else if (status.includes(',')) {
      query.status = { $in: status.split(',') };
    } else {
      query.status = status;
    }
  }

  // Date range filter
  if (fromDate || toDate) {
    query['slot.date'] = {};
    if (fromDate) query['slot.date'].$gte = new Date(fromDate);
    if (toDate) query['slot.date'].$lte = new Date(toDate);
  }

  // Build pagination
  const { skip, limit: limitNum } = buildPaginationQuery(page, limit);

  // Build sort object
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  // Get bookings with search filter
  let bookingsQuery = Booking.find(query);

  // Search by student name or email (requires population)
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    const matchingUsers = await User.find({
      $or: [
        { displayName: searchRegex },
        { email: searchRegex }
      ]
    }).select('_id');
    
    const userIds = matchingUsers.map(u => u._id);
    bookingsQuery = bookingsQuery.where('userId').in(userIds);
  }

  // Execute query with pagination
  const [bookings, total] = await Promise.all([
    bookingsQuery
      .populate('userId', 'displayName email photoURL phone')
      .populate('payment', 'amount status paymentMethod')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Booking.countDocuments(query)
  ]);

  // Add additional computed fields
  const enrichedBookings = bookings.map(booking => ({
    ...booking,
    isUpcoming: booking.status === 'accepted' && new Date(booking.slot.date) >= new Date(),
    isPast: ['completed', 'no-show'].includes(booking.status) || 
            (booking.status === 'accepted' && new Date(booking.slot.date) < new Date()),
    canAccept: ['pending', 'confirmed', 'paid'].includes(booking.status),
    canReject: ['pending', 'confirmed', 'paid'].includes(booking.status),
    canComplete: ['accepted', 'confirmed', 'paid'].includes(booking.status),
    canMarkNoShow: booking.status === 'accepted' && new Date(booking.slot.date) < new Date()
  }));

  res.status(200).json({
    success: true,
    data: enrichedBookings,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum
    }
  });
});

// Get upcoming sessions
exports.getUpcomingBookings = asyncHandler(async (req, res) => {
  const expertId = req.expert._id;
  const now = new Date();

  const bookings = await Booking.find({
    expertId,
    status: 'accepted',
    'slot.date': { $gte: now }
  })
    .populate('userId', 'displayName email photoURL phone company position')
    .populate('payment', 'amount status')
    .sort({ 'slot.date': 1, 'slot.startTime': 1 })
    .lean();

  // Group by date for better frontend display
  const groupedByDate = bookings.reduce((acc, booking) => {
    const dateKey = new Date(booking.slot.date).toISOString().split('T')[0];
    if (!acc[dateKey]) {
      acc[dateKey] = {
        date: dateKey,
        displayDate: new Date(booking.slot.date).toLocaleDateString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        bookings: []
      };
    }
    acc[dateKey].bookings.push({
      ...booking,
      meetingInfo: {
        link: booking.meetingLink,
        password: booking.meetingPassword,
        provider: booking.meetingProvider || 'google-meet'
      }
    });
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    data: {
      list: bookings,
      grouped: Object.values(groupedByDate),
      total: bookings.length
    }
  });
});

// get past booking 
exports.getPastBookings = asyncHandler(async (req, res) => {
  const expertId = req.expert._id;
  const { page = 1, limit = 20 } = req.query;

  const now = new Date();
  const query = {
    expertId,
    $or: [
      { status: { $in: ['completed', 'no-show', 'rejected', 'cancelled'] } },
      { 
        status: 'accepted',
        'slot.date': { $lt: now }
      }
    ]
  };

  const { skip, limit: limitNum } = buildPaginationQuery(page, limit);

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate('userId', 'displayName email photoURL')
      .populate('feedback')
      .sort({ 'slot.date': -1, 'slot.startTime': -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Booking.countDocuments(query)
  ]);

  // Add computed fields
  const enrichedBookings = bookings.map(booking => ({
    ...booking,
    hasFeedback: !!booking.feedback?.rating,
    canAddNotes: true
  }));

  res.status(200).json({
    success: true,
    data: enrichedBookings,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limitNum),
      totalItems: total
    }
  });
});

// get booking by id
exports.getBookingById = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const expertId = req.expert._id;

  const booking = await Booking.findOne({
    _id: bookingId,
    expertId
  })
    .populate('userId', 'displayName email photoURL phone company position bio totalBookings interviewsCompleted')
    .populate('payment', 'amount status paymentMethod razorpayPaymentId createdAt')
    .lean();

  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  // Get student's previous sessions with this expert
  const previousSessions = await Booking.find({
    expertId,
    userId: booking.userId._id,
    _id: { $ne: bookingId },
    status: 'completed'
  })
    .select('slot.date slot.startTime feedback.rating notes.expertNotes')
    .sort({ 'slot.date': -1 })
    .limit(5)
    .lean();

  // Add computed fields
  const enrichedBooking = {
    ...booking,
    stages: booking.stages,
    isUpcoming: booking.status === 'accepted' && new Date(booking.slot.date) >= new Date(),
    isPast: ['completed', 'no-show'].includes(booking.status) || 
            (booking.status === 'accepted' && new Date(booking.slot.date) < new Date()),
    actions: {
      canAccept: ['pending', 'confirmed', 'paid'].includes(booking.status),
      canReject: ['pending', 'confirmed', 'paid'].includes(booking.status),
      canComplete: ['accepted', 'confirmed', 'paid'].includes(booking.status),
      canMarkNoShow: booking.status === 'accepted' && new Date(booking.slot.date) < new Date(),
      canAddNotes: true
    },
    student: {
      ...booking.userId,
      previousSessions: previousSessions.length,
      previousSessionsList: previousSessions
    }
  };

  res.status(200).json({
    success: true,
    data: enrichedBooking
  });
});

// accept booking
exports.acceptBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { meetingLink, meetingPassword } = req.body;
  const expertId = req.expert._id;

  const booking = await Booking.findOne({
    _id: bookingId,
    expertId
  }).populate('userId', 'displayName email phone');

  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  // Check if booking can be accepted
  const isFreeBooking = booking.paymentMode === 'free' || Number(booking.amount) <= 0;
  const canAcceptPaid = booking.status === 'paid';
  const canAcceptFree = isFreeBooking && ['pending', 'confirmed'].includes(booking.status);
  
  if (!canAcceptPaid && !canAcceptFree) {
    throw new AppError('Only paid or free bookings can be accepted', 400);
  }

  // Generate meeting link if not provided
  const finalMeetingLink = meetingLink || `https://meet.google.com/${Date.now().toString(36)}`;
  const finalMeetingPassword = meetingPassword || Math.random().toString(36).substring(2, 8).toUpperCase();

  // Accept booking
  await booking.acceptBooking(finalMeetingLink, finalMeetingPassword);

  // Send notifications
  const emailService = require('../services/emailService');
  const { sendWhatsAppMessage } = require('../services/whatsappService');

  Promise.allSettled([
    emailService.sendBookingAccepted(booking, booking.userId, req.expert),
    booking.userId.phone
      ? sendWhatsAppMessage(
          booking.userId.phone,
          `Hi ${booking.userId.displayName || 'Student'}! ✅\n\n` +
          `Your session with ${req.expert.name} has been ACCEPTED!\n\n` +
          `📅 Date: ${new Date(booking.slot.date).toLocaleDateString('en-IN')}\n` +
          `⏰ Time: ${booking.slot.startTime}\n` +
          `🔗 Meeting Link: ${finalMeetingLink}\n` +
          `🔑 Password: ${finalMeetingPassword}\n\n` +
          `— Team Sansal`
        )
      : Promise.resolve(),
    createNotification({
      userId: booking.userId?._id || booking.userId,
      type: 'booking_accepted',
      audience: 'student',
      title: 'Booking accepted',
      message: `${req.expert.name} accepted your session on ${new Date(booking.slot.date).toLocaleDateString('en-IN')} at ${booking.slot.startTime}.`,
      data: {
        bookingId: booking._id,
        expertId: req.expert._id,
        expertName: req.expert.name,
        meetingLink: finalMeetingLink,
        meetingPassword: finalMeetingPassword,
        scheduledAt: booking.slot?.date
      }
    })
  ]).catch(err => console.error('Notification error:', err));

  res.status(200).json({
    success: true,
    message: 'Booking accepted successfully',
    data: {
      ...booking.toObject(),
      meetingLink: finalMeetingLink,
      meetingPassword: finalMeetingPassword
    }
  });
});

// reject booking
exports.rejectBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { reason } = req.body;
  const expertId = req.expert._id;

  if (!reason || !reason.trim()) {
    throw new AppError('Rejection reason is required', 400);
  }

  const booking = await Booking.findOne({
    _id: bookingId,
    expertId
  }).populate('userId', 'displayName email phone');

  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  // Reject booking
  await booking.rejectBooking(reason);

  // Release the slot
  await slotService.releaseSlot(expertId, booking.slot.slotId, booking._id);

  // Send notifications
  const emailService = require('../services/emailService');
  const { sendWhatsAppMessage } = require('../services/whatsappService');

  Promise.allSettled([
    emailService.sendBookingRejected(booking, booking.userId, req.expert, reason),
    booking.userId.phone
      ? sendWhatsAppMessage(
          booking.userId.phone,
          `Hi ${booking.userId.displayName || 'Student'},\n\n` +
          `Your session request with ${req.expert.name} could not be accepted.\n` +
          `Reason: ${reason}\n\n` +
          `Please book another slot or choose a different expert.\n\n` +
          `— Team Sansal`
        )
      : Promise.resolve(),
    createNotification({
      userId: booking.userId?._id || booking.userId,
      type: 'booking_rejected',
      audience: 'student',
      title: 'Booking declined',
      message: `${req.expert.name} could not accept your session request. Reason: ${reason}`,
      data: {
        bookingId: booking._id,
        expertId: req.expert._id,
        expertName: req.expert.name,
        reason
      }
    })
  ]).catch(err => console.error('Notification error:', err));

  // Process refund if applicable
  if (booking.paymentId) {
    // TODO: Implement Razorpay refund
    console.log(`Refund pending for booking ${bookingId}`);
  }

  res.status(200).json({
    success: true,
    message: 'Booking rejected successfully',
    data: booking
  });
});

// complete booking
exports.completeBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const expertId = req.expert._id;

  const booking = await Booking.findOne({
    _id: bookingId,
    expertId
  });

  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  // Check if already completed
  if (booking.status === 'completed') {
    return res.status(200).json({
      success: true,
      message: 'Session already completed',
      data: booking
    });
  }

  // Complete the session
  await booking.completeSession();

  // Update expert stats
  await req.expert.updateEarnings(booking.amount);
  req.expert.completedSessions += 1;
  await req.expert.save();

  // Update student stats
  const student = await User.findById(booking.userId);
  if (student) {
    await student.updateBookingStats(booking.amount);
  }

  // Send thank you notification
  const { sendWhatsAppMessage } = require('../services/whatsappService');
  if (student?.phone) {
    sendWhatsAppMessage(
      student.phone,
      `Hi ${student.displayName || 'Student'}! 👋\n\n` +
      `Thank you for completing your session with ${req.expert.name}.\n` +
      `We hope it was valuable!\n\n` +
      `Please leave a review to help others.\n` +
      `👉 https://sansal.in/dashboard/feedback/${bookingId}\n\n` +
      `— Team Sansal`
    ).catch(() => {});
  }

  createNotification({
    userId: booking.userId,
    type: 'booking_completed',
    audience: 'student',
    title: 'Session completed',
    message: `Your session with ${req.expert.name} is marked as completed. Please share your feedback.`,
    data: {
      bookingId: booking._id,
      expertId: req.expert._id,
      expertName: req.expert.name
    }
  }).catch(err => console.error('Notification error:', err));

  res.status(200).json({
    success: true,
    message: 'Session marked as completed',
    data: booking
  });
});

// mark no show
exports.markNoShow = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { notes } = req.body;
  const expertId = req.expert._id;

  const booking = await Booking.findOne({
    _id: bookingId,
    expertId
  });

  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  // Only accepted bookings can be marked as no-show
  if (booking.status !== 'accepted') {
    throw new AppError('Only accepted bookings can be marked as no-show', 400);
  }

  // Can only mark as no-show after scheduled time
  const scheduledTime = new Date(booking.slot.date);
  const [hours, minutes] = booking.slot.startTime.split(':').map(Number);
  scheduledTime.setHours(hours, minutes, 0, 0);

  if (scheduledTime > new Date()) {
    throw new AppError('Cannot mark as no-show before scheduled time', 400);
  }

  // Update booking
  booking.status = 'no-show';
  booking.notes.expertNotes = notes || 'Student did not attend the session';
  booking.cancellation = {
    cancelledBy: 'system',
    reason: 'No-show',
    cancelledAt: new Date(),
    refundStatus: 'not-applicable'
  };
  await booking.save();

  // Release the slot for future bookings
  await slotService.releaseSlot(expertId, booking.slot.slotId, booking._id);

  // Notify student
  const student = await User.findById(booking.userId);
  const { sendWhatsAppMessage } = require('../services/whatsappService');
  
  if (student?.phone) {
    sendWhatsAppMessage(
      student.phone,
      `Hi ${student.displayName || 'Student'},\n\n` +
      `We noticed you missed your scheduled session with ${req.expert.name}.\n` +
      `Please book another slot if you'd like to reschedule.\n\n` +
      `— Team Sansal`
    ).catch(() => {});
  }

  createNotification({
    userId: booking.userId,
    type: 'booking_no_show',
    audience: 'student',
    title: 'Session missed',
    message: `You were marked as no-show for your session with ${req.expert.name}. Please rebook if you'd like another slot.`,
    data: {
      bookingId: booking._id,
      expertId: req.expert._id,
      expertName: req.expert.name
    }
  }).catch(err => console.error('Notification error:', err));

  res.status(200).json({
    success: true,
    message: 'Booking marked as no-show',
    data: booking
  });
});

// add booking note
exports.addNotes = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { notes } = req.body;
  const expertId = req.expert._id;

  if (!notes || !notes.trim()) {
    throw new AppError('Notes are required', 400);
  }

  const booking = await Booking.findOne({
    _id: bookingId,
    expertId
  });

  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  booking.notes.expertNotes = notes.trim();
  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Notes added successfully',
    data: {
      notes: booking.notes.expertNotes,
      updatedAt: new Date()
    }
  });
});

// get all student
exports.getAllStudents = asyncHandler(async (req, res) => {
  const expertId = req.expert._id;
  const { search, page = 1, limit = 20 } = req.query;

  // Get unique student IDs from bookings
  const bookings = await Booking.find({ expertId })
    .select('userId')
    .lean();

  const uniqueStudentIds = [...new Set(bookings.map(b => b.userId.toString()))];

  // Build query
  const query = { _id: { $in: uniqueStudentIds } };
  
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.$or = [
      { displayName: searchRegex },
      { email: searchRegex }
    ];
  }

  const { skip, limit: limitNum } = buildPaginationQuery(page, limit);

  // Get students with their booking stats
  const [students, total] = await Promise.all([
    User.find(query)
      .select('displayName email photoURL phone company position bio totalBookings interviewsCompleted')
      .skip(skip)
      .limit(limitNum)
      .lean(),
    User.countDocuments(query)
  ]);

  // Enrich with expert-specific stats
  const enrichedStudents = await Promise.all(students.map(async (student) => {
    const studentBookings = await Booking.find({
      expertId,
      userId: student._id
    }).select('status slot.date amount createdAt').lean();

    const completedSessions = studentBookings.filter(b => b.status === 'completed');
    const upcomingSessions = studentBookings.filter(b => 
      b.status === 'accepted' && new Date(b.slot.date) >= new Date()
    );
    const lastSession = studentBookings
      .filter(b => b.status === 'completed')
      .sort((a, b) => new Date(b.slot.date) - new Date(a.slot.date))[0];

    return {
      ...student,
      stats: {
        totalSessions: studentBookings.length,
        completedSessions: completedSessions.length,
        upcomingSessions: upcomingSessions.length,
        totalSpent: completedSessions.reduce((sum, b) => sum + (b.amount || 0), 0),
        lastSessionDate: lastSession?.slot.date || null,
        firstSessionDate: studentBookings[studentBookings.length - 1]?.createdAt || null
      }
    };
  }));

  res.status(200).json({
    success: true,
    data: enrichedStudents,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limitNum),
      totalItems: total
    }
  });
});

// get student by id
exports.getStudentById = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const expertId = req.expert._id;

  // Verify this student has bookings with this expert
  const hasBookings = await Booking.exists({
    expertId,
    userId: studentId
  });

  if (!hasBookings) {
    throw new AppError('Student not found or no sessions with this student', 404);
  }

  // Get student details
  const student = await User.findById(studentId)
    .select('displayName email photoURL phone company position bio totalBookings interviewsCompleted averageScore accountCreated')
    .lean();

  if (!student) {
    throw new AppError('Student not found', 404);
  }

  // Get all bookings with this student
  const bookings = await Booking.find({
    expertId,
    userId: studentId
  })
    .select('slot status amount paymentMode notes createdAt feedback')
    .sort({ 'slot.date': -1 })
    .lean();

  // Calculate statistics
  const stats = {
    totalSessions: bookings.length,
    completed: bookings.filter(b => b.status === 'completed').length,
    accepted: bookings.filter(b => b.status === 'accepted').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
    noShow: bookings.filter(b => b.status === 'no-show').length,
    totalSpent: bookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.amount || 0), 0),
    averageRating: bookings
      .filter(b => b.feedback?.rating)
      .reduce((sum, b, _, arr) => sum + (b.feedback.rating / arr.length), 0)
  };

  // Get upcoming sessions
  const upcomingSessions = bookings.filter(b => 
    b.status === 'accepted' && new Date(b.slot.date) >= new Date()
  );

  // Get past sessions
  const pastSessions = bookings.filter(b => 
    ['completed', 'no-show'].includes(b.status) ||
    (b.status === 'accepted' && new Date(b.slot.date) < new Date())
  );

  res.status(200).json({
    success: true,
    data: {
      student,
      stats,
      upcomingSessions,
      pastSessions: pastSessions.slice(0, 10), // Last 10 sessions
      allBookings: bookings,
      notes: bookings
        .filter(b => b.notes?.expertNotes)
        .map(b => ({
          sessionDate: b.slot.date,
          notes: b.notes.expertNotes
        }))
    }
  });
});

// bulk accept booking
exports.bulkAcceptBookings = asyncHandler(async (req, res) => {
  const { bookingIds, meetingLink } = req.body;
  const expertId = req.expert._id;

  if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
    throw new AppError('Booking IDs are required', 400);
  }

  const results = {
    success: [],
    failed: []
  };

  for (const bookingId of bookingIds) {
    try {
      const booking = await Booking.findOne({
        _id: bookingId,
        expertId
      });

      if (!booking) {
        results.failed.push({ bookingId, reason: 'Booking not found' });
        continue;
      }

      const isFreeBooking = booking.paymentMode === 'free' || Number(booking.amount) <= 0;
      const canAcceptPaid = booking.status === 'paid';
      const canAcceptFree = isFreeBooking && ['pending', 'confirmed'].includes(booking.status);
      
      if (!canAcceptPaid && !canAcceptFree) {
        results.failed.push({ bookingId, reason: 'Cannot accept this booking' });
        continue;
      }

      const finalMeetingLink = meetingLink || `https://meet.google.com/${Date.now().toString(36)}`;
      await booking.acceptBooking(finalMeetingLink);
      
      results.success.push(bookingId);
    } catch (error) {
      results.failed.push({ bookingId, reason: error.message });
    }
  }

  res.status(200).json({
    success: true,
    message: `Accepted ${results.success.length} bookings`,
    data: results
  });
});


// Get earnings overview
exports.getEarnings = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;

  // Calculate date range
  const now = new Date();
  let startDate;

  switch (period) {
    case "week":
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case "month":
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case "year":
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    default:
      startDate = new Date(now.setMonth(now.getMonth() - 1));
  }

  const earnings = await Payment.getExpertEarnings(
    req.expert._id,
    startDate,
    new Date(),
  );

  // Get completed sessions count
  const completedSessions = await Booking.countDocuments({
    expertId: req.expert._id,
    status: "completed",
  });

  // Get pending earnings (accepted but not completed)
  const pendingBookings = await Booking.find({
    expertId: req.expert._id,
    status: { $in: ["paid", "accepted"] },
  });
  const pendingEarnings = pendingBookings.reduce((sum, b) => sum + b.amount, 0);

  res.status(200).json({
    success: true,
    data: {
      totalEarnings: earnings.totalEarnings,
      totalTransactions: earnings.totalTransactions,
      completedSessions,
      pendingEarnings,
      period,
    },
  });
});

// Register as expert
exports.registerAsExpert = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    bio,
    title,
    company,
    experience,
    skills,
    pricePerSession,
  } = req.body;

  // Check if already registered
  const existing = await Expert.findOne({
    $or: [
      { firebaseUid: req.firebaseUser.uid },
      { email: req.firebaseUser.email },
    ],
  });

  if (existing) {
    throw new AppError("You are already registered as an expert", 400);
  }

  const expert = await Expert.create({
    firebaseUid: req.firebaseUser.uid,
    email: email || req.firebaseUser.email,
    name: name || req.firebaseUser.name,
    phone,
    bio,
    title,
    company,
    experience,
    skills,
    pricePerSession,
    avatar: req.firebaseUser.picture || "",
    isVerified: false, // Admin needs to verify
  });

  res.status(201).json({
    success: true,
    message: "Expert registration submitted. Pending verification.",
    data: expert,
  });
});
