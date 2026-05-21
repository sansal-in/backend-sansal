const crypto = require('crypto');

// Generate a random string
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Format date to readable string
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Format time to 12-hour format
const formatTime = (time) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const formattedHour = hour % 12 || 12;
  return `${formattedHour}:${minutes} ${ampm}`;
};

// Calculate slot end time based on duration
const calculateEndTime = (startTime, durationMinutes) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
};

// Check if a date is in the past
const isDatePast = (date) => {
  return new Date(date) < new Date();
};

// Check if slot time has passed
const isSlotPast = (date, startTime) => {
  const slotDateTime = new Date(date);
  const [hours, minutes] = startTime.split(':').map(Number);
  slotDateTime.setHours(hours, minutes, 0, 0);
  return slotDateTime < new Date();
};

// Generate meeting link
const generateMeetingLink = () => {
  const meetingId = generateRandomString(8);
  return `https://meet.interview-booking.com/${meetingId}`;
};

// Generate meeting password
const generateMeetingPassword = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Convert amount to paise (for Razorpay)
const toPaise = (amount) => {
  return Math.round(amount * 100);
};

// Convert paise to rupees
const toRupees = (paise) => {
  return paise / 100;
};

// Paginate array
const paginate = (array, page = 1, limit = 10) => {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  return {
    data: array.slice(startIndex, endIndex),
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(array.length / limit),
      totalItems: array.length,
      hasNext: endIndex < array.length,
      hasPrev: startIndex > 0
    }
  };
};

// Build pagination query for Mongoose
const buildPaginationQuery = (page = 1, limit = 10) => {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  return {
    skip,
    limit: parseInt(limit)
  };
};

// Sanitize user object
const sanitizeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.__v;
  return obj;
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate time format (HH:mm)
const isValidTimeFormat = (time) => {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};

// Get date range for queries
const getDateRange = (range) => {
  const now = new Date();
  const startOfDay = new Date(now.setHours(0, 0, 0, 0));
  
  switch (range) {
    case 'today':
      return {
        start: startOfDay,
        end: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
      };
    case 'week':
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      return {
        start: startOfWeek,
        end: new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000)
      };
    case 'month':
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        start: startOfMonth,
        end: endOfMonth
      };
    default:
      return null;
  }
};

module.exports = {
  generateRandomString,
  formatDate,
  formatTime,
  calculateEndTime,
  isDatePast,
  isSlotPast,
  generateMeetingLink,
  generateMeetingPassword,
  toPaise,
  toRupees,
  paginate,
  buildPaginationQuery,
  sanitizeUser,
  isValidEmail,
  isValidTimeFormat,
  getDateRange
};