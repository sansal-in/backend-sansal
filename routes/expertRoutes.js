const express = require("express");
const {
  register,
  login,
  googleLogin,
  becomeExpert,
  healthCheck,
  getExperts,
  bookExpert,
  getExpertBookings,
  getBookingDetails,
  getExpertStudents,
  getStudentDetailsForExpert,
  getExpertById,
  getExpertSlots,
  getMyProfile,
  updateMyProfile,
  getMySlots,
  addSlot,
  getSlotById,
  updateSlot,
  deleteSlot,
  toggleSlotStatus,
  bulkAddSlots,
  bulkDeleteSlots,
  getCalendarSlots,
  getSlotStats,
  cloneSlots,
  cleanupPastSlots,
  getEarnings,
  acceptBooking,
  rejectBooking,
  getBookingStats,
  getAllStudents,
  getStudentById,
  bulkAcceptBookings,
  getUpcomingBookings,
  getPastBookings,
  getAllBookings,
  getBookingById,
  completeBooking,
  markNoShow,
  addNotes,
} = require("../controllers/ExpertController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { verifyExpertToken } = require("../middleware/auth");
const {
  validateSlot,
  validateExpertProfile,
  validateObjectId,
  sanitizeInput,
} = require("../middleware/validate");

const router = express.Router();

// Apply sanitization to all routes
router.use(sanitizeInput);

// ============================================================
// PUBLIC STATIC ROUTES (No auth required)
// ============================================================
router.get("/health-check", healthCheck);
router.get("/", getExperts);
router.post("/register", register);
router.post("/login", login);
router.post("/google-login", googleLogin);
router.post("/become-expert", authMiddleware, becomeExpert);
router.post("/book", authMiddleware, bookExpert);

// ============================================================
// PROTECTED PROFILE ROUTES
// ============================================================
router.get("/me", verifyExpertToken, getMyProfile);
router.put("/me", verifyExpertToken, validateExpertProfile, updateMyProfile);
router.get("/earnings", verifyExpertToken, getEarnings);

// ============================================================
// SLOT MANAGEMENT ROUTES
// ============================================================
router.get("/slots", verifyExpertToken, getMySlots);
router.get("/slots/stats", verifyExpertToken, getSlotStats);
router.get("/slots/calendar", getCalendarSlots);
router.get("/my-slots", verifyExpertToken, getMySlots);
router.post("/slots", verifyExpertToken, validateSlot, addSlot);
router.post("/slots/bulk", verifyExpertToken, bulkAddSlots);
router.post("/slots/clone", verifyExpertToken, cloneSlots);
router.post("/slots/cleanup", verifyExpertToken, cleanupPastSlots);

// Dynamic slot routes - MUST be after static slot routes
router.get("/slots/:slotId", getSlotById);
router.put("/slots/:slotId", verifyExpertToken, validateSlot, updateSlot);
router.patch("/slots/:slotId/toggle", verifyExpertToken, toggleSlotStatus);
router.delete("/slots/:slotId", verifyExpertToken, deleteSlot);
router.delete("/slots/bulk", verifyExpertToken, bulkDeleteSlots);

// ============================================================
// BOOKING MANAGEMENT ROUTES
// IMPORTANT: Static routes MUST come before dynamic :bookingId routes
// ============================================================

// Statistics & List routes (NO dynamic parameters)
router.get("/bookings/stats", verifyExpertToken, getBookingStats);
router.get("/bookings/upcoming", verifyExpertToken, getUpcomingBookings);
router.get("/bookings/past", verifyExpertToken, getPastBookings);
router.get("/bookings/students", verifyExpertToken, getAllStudents);

// Student specific routes
router.get("/bookings/students/:studentId", verifyExpertToken, validateObjectId("studentId"), getStudentById);

// Bulk operations
router.post("/bookings/bulk/accept", verifyExpertToken, bulkAcceptBookings);

// Main bookings list (NO dynamic parameter)
router.get("/bookings", verifyExpertToken, getAllBookings);

// ============================================================
// DYNAMIC BOOKING ROUTES (MUST be AFTER all static /bookings/* routes)
// ============================================================
router.get("/bookings/:bookingId", verifyExpertToken, validateObjectId("bookingId"), getBookingById);
router.put("/bookings/:bookingId/accept", verifyExpertToken, validateObjectId("bookingId"), acceptBooking);
router.put("/bookings/:bookingId/reject", verifyExpertToken, validateObjectId("bookingId"), rejectBooking);
router.put("/bookings/:bookingId/complete", verifyExpertToken, validateObjectId("bookingId"), completeBooking);
router.put("/bookings/:bookingId/no-show", verifyExpertToken, validateObjectId("bookingId"), markNoShow);
router.put("/bookings/:bookingId/notes", verifyExpertToken, validateObjectId("bookingId"), addNotes);

// ============================================================
// LEGACY STUDENT ROUTES (for compatibility)
// ============================================================
router.get("/students", authMiddleware, getExpertStudents);
router.get("/students/:studentId", authMiddleware, validateObjectId("studentId"), getStudentDetailsForExpert);

// ============================================================
// EXPERT PUBLIC ROUTES (by expert ID)
// ============================================================
router.get("/:id", validateObjectId("id"), getExpertById);
router.get("/:id/slots", validateObjectId("id"), getExpertSlots);

// ============================================================
// LEGACY BOOKING ROUTE (for backward compatibility)
// ============================================================
router.get("/bookings/:id", authMiddleware, validateObjectId("id"), getBookingDetails);

module.exports = router;