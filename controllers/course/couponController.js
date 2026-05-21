const Course = require("../../models/Course");
const { asyncHandler, AppError } = require("../../middleware/errorMiddleware");

// Expert: get all coupons for a course
const getCourseCoupons = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to view coupons", 403);
  }

  const coupons = course.coupons || [];

  res.status(200).json({
    success: true,
    coupons,
  });
});

// Expert: add coupon to course
const addCoupon = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to add coupon", 403);
  }

  const {
    code,
    type,
    value,
    active,
    expiresAt,
    usageLimit,
    minPurchaseAmount,
  } = req.body;

  if (!code || !String(code).trim()) {
    throw new AppError("Coupon code is required", 400);
  }

  // Accept both 'percent' and 'percentage'
  if (!type || !["percent", "flat", "percentage"].includes(type)) {
    throw new AppError(
      'Coupon type must be "percent", "percentage" or "flat"',
      400,
    );
  }

  // Normalize type
  const normalizedType = type === "percentage" ? "percent" : type;

  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    throw new AppError("Coupon value must be a positive number", 400);
  }

  if (normalizedType === "percent" && Number(value) > 100) {
    throw new AppError("Percentage discount cannot exceed 100%", 400);
  }

  // Check for duplicate code
  const existingCoupon = course.coupons?.find(
    (c) => c.code === String(code).toUpperCase(),
  );
  if (existingCoupon) {
    throw new AppError("Coupon code already exists for this course", 400);
  }

  const newCoupon = {
    code: String(code).trim().toUpperCase(),
    type: normalizedType,
    value: Number(value),
    active: active !== false,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    usageLimit: Number.isFinite(Number(usageLimit)) ? Number(usageLimit) : null,
    usedCount: 0,
    minPurchaseAmount: Number.isFinite(Number(minPurchaseAmount))
      ? Number(minPurchaseAmount)
      : 0,
  };

  course.coupons = course.coupons || [];
  course.coupons.push(newCoupon);

  await course.save();

  res.status(201).json({
    success: true,
    coupon: newCoupon,
    message: "Coupon added successfully",
  });
});

// Expert: update coupon
const updateCoupon = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to update coupon", 403);
  }

  const couponIndex = course.coupons?.findIndex(
    (c) => c.code === req.params.couponCode,
  );

  if (couponIndex === undefined || couponIndex === -1) {
    throw new AppError("Coupon not found", 404);
  }

  const { type, value, active, expiresAt, usageLimit, minPurchaseAmount } =
    req.body;
  const coupon = course.coupons[couponIndex];

  if (type !== undefined) {
    if (!["percent", "flat"].includes(type)) {
      throw new AppError('Coupon type must be "percent" or "flat"', 400);
    }
    coupon.type = type;
  }

  if (value !== undefined) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
      throw new AppError("Coupon value must be a positive number", 400);
    }
    if (coupon.type === "percent" && Number(value) > 100) {
      throw new AppError("Percentage discount cannot exceed 100%", 400);
    }
    coupon.value = Number(value);
  }

  if (active !== undefined) coupon.active = Boolean(active);
  if (expiresAt !== undefined)
    coupon.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (usageLimit !== undefined) {
    coupon.usageLimit = Number.isFinite(Number(usageLimit))
      ? Number(usageLimit)
      : null;
  }
  if (minPurchaseAmount !== undefined) {
    coupon.minPurchaseAmount = Number.isFinite(Number(minPurchaseAmount))
      ? Number(minPurchaseAmount)
      : 0;
  }

  await course.save();

  res.status(200).json({
    success: true,
    coupon,
    message: "Coupon updated successfully",
  });
});

// Expert: delete coupon
const deleteCoupon = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to delete coupon", 403);
  }

  const couponIndex = course.coupons?.findIndex(
    (c) => c.code === req.params.couponCode,
  );

  if (couponIndex === undefined || couponIndex === -1) {
    throw new AppError("Coupon not found", 404);
  }

  course.coupons.splice(couponIndex, 1);
  await course.save();

  res.status(200).json({
    success: true,
    message: "Coupon deleted successfully",
  });
});

// Expert: toggle coupon active status
const toggleCouponStatus = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to update coupon", 403);
  }

  const coupon = course.coupons?.find((c) => c.code === req.params.couponCode);

  if (!coupon) {
    throw new AppError("Coupon not found", 404);
  }

  coupon.active = !coupon.active;
  await course.save();

  res.status(200).json({
    success: true,
    active: coupon.active,
    message: `Coupon ${coupon.active ? "activated" : "deactivated"} successfully`,
  });
});

// Public: validate coupon (for purchase flow)
const validateCoupon = asyncHandler(async (req, res) => {
  const { courseId, couponCode } = req.body;

  if (!courseId || !couponCode) {
    throw new AppError("Course ID and coupon code are required", 400);
  }

  const course = await Course.findById(courseId);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  const coupon = course.coupons?.find(
    (c) => c.code === String(couponCode).toUpperCase() && c.active === true,
  );

  if (!coupon) {
    throw new AppError("Invalid or inactive coupon code", 400);
  }

  // Check expiry
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    throw new AppError("Coupon has expired", 400);
  }

  // Check usage limit
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError("Coupon usage limit reached", 400);
  }

  // Check minimum purchase amount
  if (coupon.minPurchaseAmount > 0 && course.price < coupon.minPurchaseAmount) {
    throw new AppError(
      `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required`,
      400,
    );
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.type === "percent") {
    discountAmount = (course.price * coupon.value) / 100;
  } else {
    discountAmount = Math.min(coupon.value, course.price);
  }

  const finalPrice = Math.max(0, course.price - discountAmount);

  res.status(200).json({
    success: true,
    valid: true,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
    },
    originalPrice: course.price,
    discountAmount: Math.round(discountAmount),
    finalPrice: Math.round(finalPrice),
    currency: course.currency,
  });
});

module.exports = {
  getCourseCoupons,
  addCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  validateCoupon,
};
