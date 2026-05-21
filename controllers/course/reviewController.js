const Course = require('../../models/Course');
const CourseReview = require('../../models/CourseReview');
const CourseEnrollment = require('../../models/CourseEnrollment');
const { asyncHandler, AppError } = require('../../middleware/errorMiddleware');

// Expert: get all reviews for a course
const getCourseReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, rating, sort = 'newest' } = req.query;
  
  const course = await Course.findById(req.params.courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to view reviews', 403);
  }

  const query = { courseId: course._id };
  if (rating) query.rating = parseInt(rating);

  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    highest: { rating: -1 },
    lowest: { rating: 1 }
  };

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [reviews, total, ratingStats] = await Promise.all([
    CourseReview.find(query)
      .populate('userId', 'displayName photoURL')
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip(skip)
      .limit(parseInt(limit)),
    CourseReview.countDocuments(query),
    CourseReview.aggregate([
      { $match: { courseId: course._id } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
        }
      }
    ])
  ]);

  res.status(200).json({
    success: true,
    data: {
      reviews,
      stats: ratingStats[0] || {
        averageRating: 0,
        totalReviews: 0,
        rating5: 0,
        rating4: 0,
        rating3: 0,
        rating2: 0,
        rating1: 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

// Expert: get single review
const getReviewById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to view review', 403);
  }

  const review = await CourseReview.findOne({
    _id: req.params.reviewId,
    courseId: course._id
  }).populate('userId', 'displayName photoURL');
  
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  res.status(200).json({
    success: true,
    review
  });
});

// Expert: respond to review
const respondToReview = asyncHandler(async (req, res) => {
  const { response } = req.body;
  
  if (!response || !String(response).trim()) {
    throw new AppError('Response is required', 400);
  }

  const course = await Course.findById(req.params.courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to respond to review', 403);
  }

  const review = await CourseReview.findOne({
    _id: req.params.reviewId,
    courseId: course._id
  });
  
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  review.expertResponse = String(response).trim();
  review.respondedAt = new Date();
  review.isResponded = true;
  
  await review.save();

  res.status(200).json({
    success: true,
    review,
    message: 'Response added successfully'
  });
});

// Expert: edit response to review
const editReviewResponse = asyncHandler(async (req, res) => {
  const { response } = req.body;
  
  if (!response || !String(response).trim()) {
    throw new AppError('Response is required', 400);
  }

  const course = await Course.findById(req.params.courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to edit response', 403);
  }

  const review = await CourseReview.findOne({
    _id: req.params.reviewId,
    courseId: course._id
  });
  
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  review.expertResponse = String(response).trim();
  review.respondedAt = new Date();
  
  await review.save();

  res.status(200).json({
    success: true,
    review,
    message: 'Response updated successfully'
  });
});

// Expert: delete response
const deleteReviewResponse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to delete response', 403);
  }

  const review = await CourseReview.findOne({
    _id: req.params.reviewId,
    courseId: course._id
  });
  
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  review.expertResponse = '';
  review.respondedAt = null;
  review.isResponded = false;
  
  await review.save();

  res.status(200).json({
    success: true,
    message: 'Response deleted successfully'
  });
});

// Expert: report inappropriate review
const reportReview = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const course = await Course.findById(req.params.courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to report review', 403);
  }

  const review = await CourseReview.findOne({
    _id: req.params.reviewId,
    courseId: course._id
  });
  
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  review.isReported = true;
  review.reportReason = String(reason || '').trim();
  review.reportedAt = new Date();
  review.reportedBy = req.expert._id;
  
  await review.save();

  res.status(200).json({
    success: true,
    message: 'Review reported successfully. Our team will review it.'
  });
});

module.exports = {
  getCourseReviews,
  getReviewById,
  respondToReview,
  editReviewResponse,
  deleteReviewResponse,
  reportReview
};