const { AppError } = require('./errorMiddleware');
const { isValidEmail, isValidTimeFormat } = require('../utils/helpers');

// Validate slot data
const validateSlot = (req, res, next) => {
  const { date, startTime, endTime, type, capacity } = req.body;
  
  if (!date) {
    return next(new AppError('Date is required', 400));
  }
  
  if (!startTime || !isValidTimeFormat(startTime)) {
    return next(new AppError('Valid start time is required (HH:mm format)', 400));
  }
  
  if (!endTime || !isValidTimeFormat(endTime)) {
    return next(new AppError('Valid end time is required (HH:mm format)', 400));
  }
  
  // Check if date is in the future
  const slotDate = new Date(date);
  if (slotDate < new Date().setHours(0, 0, 0, 0)) {
    return next(new AppError('Cannot create slots for past dates', 400));
  }
  
  // Check if end time is after start time
  if (startTime >= endTime) {
    return next(new AppError('End time must be after start time', 400));
  }

  if (type !== undefined && !['individual', 'group'].includes(type)) {
    return next(new AppError('Slot type must be individual or group', 400));
  }

  const normalizedType = type === 'group' ? 'group' : 'individual';
  if (normalizedType === 'group') {
    if (capacity !== undefined) {
      const cap = Number(capacity);
      if (!Number.isFinite(cap) || cap < 2 || cap > 10) {
        return next(new AppError('Group capacity must be between 2 and 10', 400));
      }
    }
  } else if (capacity !== undefined) {
    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap !== 1) {
      return next(new AppError('Individual slots must have capacity 1', 400));
    }
  }
  
  next();
};

// Validate booking data
const validateBooking = (req, res, next) => {
  const { expertId, slotId } = req.body;
  
  if (!expertId) {
    return next(new AppError('Expert ID is required', 400));
  }
  
  if (!slotId) {
    return next(new AppError('Slot ID is required', 400));
  }
  
  next();
};

// Validate payment verification data
const validatePaymentVerification = (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
  if (!razorpay_order_id) {
    return next(new AppError('Razorpay order ID is required', 400));
  }
  
  if (!razorpay_payment_id) {
    return next(new AppError('Razorpay payment ID is required', 400));
  }
  
  if (!razorpay_signature) {
    return next(new AppError('Razorpay signature is required', 400));
  }
  
  next();
};

// Validate expert profile data
const validateExpertProfile = (req, res, next) => {
  const { name, email, pricePerSession } = req.body;
  
  if (email && !isValidEmail(email)) {
    return next(new AppError('Invalid email format', 400));
  }
  
  if (pricePerSession !== undefined && (isNaN(pricePerSession) || pricePerSession < 0)) {
    return next(new AppError('Price per session must be a positive number', 400));
  }
  
  next();
};

// Validate pagination params
const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;
  
  if (page && (isNaN(page) || parseInt(page) < 1)) {
    return next(new AppError('Page must be a positive number', 400));
  }
  
  if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
    return next(new AppError('Limit must be between 1 and 100', 400));
  }
  
  next();
};

// Validate MongoDB ObjectId
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError(`Invalid ${paramName}`, 400));
    }
    
    next();
  };
};

// Sanitize input - remove dangerous characters
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(/<[^>]*>/g, '').trim();
    }
    if (typeof obj === 'object' && obj !== null) {
      for (let key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };
  
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
};

module.exports = {
  validateSlot,
  validateBooking,
  validatePaymentVerification,
  validateExpertProfile,
  validatePagination,
  validateObjectId,
  sanitizeInput
};
