const mongoose = require('mongoose');
const { generateToken } = require('../utils/token');
const User = require('../models/User');
const Interview = require('../models/Interview');
const Expert = require('../models/Expert');
const Booking = require('../models/Booking');
const Note = require('../models/Note');
const AptitudeAttempt = require('../models/AptitudeAttempt');
const Course = require('../models/Course');
const CourseEnrollment = require('../models/CourseEnrollment');
const Payment = require('../models/Payment');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Resume = require('../models/Resume');
const Notification = require('../models/Notification');
const CourseLessonSubmission = require('../models/CourseLessonSubmission');
const CourseQuestion = require('../models/CourseQuestion');
const CourseSupportTicket = require('../models/CourseSupportTicket');
const CourseAnnouncement = require('../models/CourseAnnouncement');
const CourseReview = require('../models/CourseReview');
const EarningTransaction = require('../models/EarningTransaction');
const Payout = require('../models/Payout');
const Certificate = require('../models/Certificate');
const Blog = require('../models/Blog');


// Static Admin Credentials
const ADMIN_CREDENTIALS = {
  email: 'sandeep854101@gmail.com',
  password: 'Sansal@123'
};

const adminController = {
  // Admin Login
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Please provide email and password'
        });
      }

      if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
        // Static admin user object
        const adminUser = {
          _id: 'static_admin_id',
          email: email,
          role: 'admin',
          displayName: 'Admin'
        };

        const token = generateToken(adminUser._id);

        return res.status(200).json({
          success: true,
          token,
          user: adminUser
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get Dashboard Statistics
  async getDashboardStats(req, res) {
    try {
      const totalUsers = await User.countDocuments();
      const totalInterviews = await Interview.countDocuments();
      
      // Get recent 5 interviews
      const recentInterviews = await Interview.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'displayName email photoURL');

      res.status(200).json({
        success: true,
        stats: {
          totalUsers,
          totalInterviews,
          recentInterviews
        }
      });
    } catch (error) {
      console.error('Get admin stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Users
  async getAllUsers(req, res) {
    try {
      const users = await User.find()
        .select('-settings') // Exclude large fields if necessary
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        users
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get Single User with Interviews
  async getUserById(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findById(id).select('-settings');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Fetch all interviews for this user
      const interviews = await Interview.find({ userId: id }).sort({ createdAt: -1 });

      // Construct the response object with embedded interviews
      const userData = user.toObject();
      userData.interviews = interviews;
      userData.interviewsCompleted = interviews.length;

      res.status(200).json({
        success: true,
        user: userData
      });
    } catch (error) {
      console.error('Get user details error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Bookings for a User
  async getUserBookings(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user id'
        });
      }

      const userExists = await User.exists({ _id: id });
      if (!userExists) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const bookings = await Booking.find({ userId: id })
        .populate('userId', 'displayName email photoURL')
        .populate('expertId', 'name email title company')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        bookings
      });
    } catch (error) {
      console.error('Get user bookings error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Notes for a User
  async getUserNotes(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user id'
        });
      }

      const userExists = await User.exists({ _id: id });
      if (!userExists) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const notes = await Note.find({ 'uploader.id': id })
        .populate('uploader.id', 'displayName email role')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        notes
      });
    } catch (error) {
      console.error('Get user notes error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Aptitude Attempts for a User
  async getUserAptitudeAttempts(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user id'
        });
      }

      const userExists = await User.exists({ _id: id });
      if (!userExists) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const attempts = await AptitudeAttempt.find({ userId: id })
        .populate('userId', 'displayName email photoURL')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        attempts
      });
    } catch (error) {
      console.error('Get user aptitude attempts error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get User Data Summary (all related data counts)
  async getUserDataSummary(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
      }

      const user = await User.findById(id).select('displayName email photoURL');
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const [
        interviews,
        bookings,
        payments,
        notes,
        aptitudeAttempts,
        courseEnrollments,
        courseLessonSubmissions,
        courseQuestions,
        courseSupportTickets,
        messages,
        chats,
        resume,
        notifications,
        expert,
      ] = await Promise.all([
        Interview.countDocuments({ userId: id }),
        Booking.countDocuments({ userId: id }),
        Payment.countDocuments({ userId: id }),
        Note.countDocuments({ 'uploader.id': id }),
        AptitudeAttempt.countDocuments({ userId: id }),
        CourseEnrollment.countDocuments({ userId: id }),
        CourseLessonSubmission.countDocuments({ userId: id }),
        CourseQuestion.countDocuments({ userId: id }),
        CourseSupportTicket.countDocuments({ userId: id }),
        Message.countDocuments({ $or: [{ sender: id }, { recipient: id }] }),
        Chat.countDocuments({ $or: [{ student: id }, { expert: id }, { participants: id }] }),
        Resume.countDocuments({ user: id }),
        Notification.countDocuments({ user: id }),
        Expert.countDocuments({ user: id }),
      ]);

      const dataSummary = {
        interviews,
        bookings,
        payments,
        notes,
        aptitudeAttempts,
        courseEnrollments,
        courseLessonSubmissions,
        courseQuestions,
        courseSupportTickets,
        messages,
        chats,
        resume,
        notifications,
        expert,
      };

      const totalRecords = Object.values(dataSummary).reduce((sum, count) => sum + count, 0);

      res.status(200).json({
        success: true,
        user: {
          _id: user._id,
          displayName: user.displayName,
          email: user.email,
        },
        dataSummary,
        totalRecords,
      });
    } catch (error) {
      console.error('Get user data summary error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Delete User and ALL associated data
  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Delete all associated data in parallel
      const deleteResults = await Promise.allSettled([
        Interview.deleteMany({ userId: id }),
        Booking.deleteMany({ userId: id }),
        Payment.deleteMany({ userId: id }),
        Note.deleteMany({ 'uploader.id': id }),
        AptitudeAttempt.deleteMany({ userId: id }),
        CourseEnrollment.deleteMany({ userId: id }),
        CourseLessonSubmission.deleteMany({ userId: id }),
        CourseQuestion.deleteMany({ userId: id }),
        CourseSupportTicket.deleteMany({ userId: id }),
        Message.deleteMany({ $or: [{ sender: id }, { recipient: id }] }),
        Chat.deleteMany({ $or: [{ student: id }, { expert: id }, { participants: id }] }),
        Resume.deleteMany({ user: id }),
        Notification.deleteMany({ user: id }),
        Expert.deleteMany({ user: id }),
      ]);

      // Count total deleted
      let totalDeleted = 0;
      const deletedCounts = {};
      const labels = [
        'interviews', 'bookings', 'payments', 'notes', 'aptitudeAttempts',
        'courseEnrollments', 'courseLessonSubmissions', 'courseQuestions',
        'courseSupportTickets', 'messages', 'chats', 'resume', 'notifications', 'expert',
      ];

      deleteResults.forEach((result, index) => {
        const count = result.status === 'fulfilled' ? (result.value?.deletedCount || 0) : 0;
        deletedCounts[labels[index]] = count;
        totalDeleted += count;
      });

      // Finally delete the user
      await User.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: 'User and all associated data deleted successfully',
        deletedCounts,
        totalDeleted,
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Interviews
  async getAllInterviews(req, res) {
    try {
      const interviews = await Interview.find()
        .populate('userId', 'displayName email')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        interviews
      });
    } catch (error) {
      console.error('Get all interviews error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Delete Interview
  async deleteInterview(req, res) {
    try {
      const { id } = req.params;
      const interview = await Interview.findByIdAndDelete(id);

      if (!interview) {
        return res.status(404).json({
          success: false,
          error: 'Interview not found'
        });
      }

      // Optionally decrement user's interview count here
      if (interview.userId) {
        await User.findByIdAndUpdate(interview.userId, {
          $inc: { interviewsCompleted: -1 }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Interview deleted successfully'
      });
    } catch (error) {
      console.error('Delete interview error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Experts
  async getAllExperts(req, res) {
    try {
      const experts = await Expert.find()
        .populate('user', 'displayName email photoURL role')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        experts
      });
    } catch (error) {
      console.error('Get all experts error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get Expert by ID (Full Details)
  async getExpertById(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid expert id'
        });
      }

      const expert = await Expert.findById(id)
        .populate('user', 'displayName email photoURL phone role');

      if (!expert) {
        return res.status(404).json({
          success: false,
          error: 'Expert not found'
        });
      }

      res.status(200).json({
        success: true,
        expert
      });
    } catch (error) {
      console.error('Get expert by id error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Delete Expert by ID and ALL associated expert data (cascade)
  async deleteExpert(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid expert id'
        });
      }

      const expert = await Expert.findById(id);

      if (!expert) {
        return res.status(404).json({
          success: false,
          error: 'Expert not found'
        });
      }

      const expertId = expert._id;
      const linkedUserId = expert.user;

      // Collect courseIds owned by this expert so we can cascade their children
      const expertCourses = await Course.find({ expertId }).select('_id');
      const courseIds = expertCourses.map(c => c._id);

      // Delete all associated data in parallel
      const deleteResults = await Promise.allSettled([
        Booking.deleteMany({ expertId }),
        Interview.deleteMany({ expertId }),
        Chat.deleteMany({ expertProfile: expertId }),
        EarningTransaction.deleteMany({ expertId }),
        Payout.deleteMany({ expertId }),
        Payment.deleteMany({ expertId }),
        Certificate.deleteMany({ expertId }),
        Blog.deleteMany({ expertId }),
        CourseAnnouncement.deleteMany({ expertId }),
        CourseReview.deleteMany({ expertId }),
        CourseEnrollment.deleteMany({ expertId }),
        // Cascade through expert's courses
        courseIds.length
          ? CourseLessonSubmission.deleteMany({ courseId: { $in: courseIds } })
          : Promise.resolve({ deletedCount: 0 }),
        courseIds.length
          ? CourseQuestion.deleteMany({ courseId: { $in: courseIds } })
          : Promise.resolve({ deletedCount: 0 }),
        courseIds.length
          ? CourseSupportTicket.deleteMany({ courseId: { $in: courseIds } })
          : Promise.resolve({ deletedCount: 0 }),
        Course.deleteMany({ expertId }),
      ]);

      const labels = [
        'bookings', 'interviews', 'chats', 'earningTransactions',
        'payouts', 'payments', 'certificates', 'blogs',
        'courseAnnouncements', 'courseReviews', 'courseEnrollments',
        'courseLessonSubmissions', 'courseQuestions', 'courseSupportTickets',
        'courses',
      ];

      let totalDeleted = 0;
      const deletedCounts = {};
      deleteResults.forEach((result, index) => {
        const count = result.status === 'fulfilled' ? (result.value?.deletedCount || 0) : 0;
        deletedCounts[labels[index]] = count;
        totalDeleted += count;
        if (result.status === 'rejected') {
          console.error(`Delete expert cascade [${labels[index]}] failed:`, result.reason);
        }
      });

      // Revert linked user's role from 'expert' to 'student'
      if (linkedUserId) {
        try {
          await User.findByIdAndUpdate(linkedUserId, {
            $pull: { role: 'expert' },
          });
        } catch (roleErr) {
          console.error('Failed to revert user role after expert delete:', roleErr);
        }
      }

      // Finally delete the expert document itself
      await Expert.findByIdAndDelete(expertId);

      res.status(200).json({
        success: true,
        message: 'Expert and all associated data deleted successfully',
        deletedCounts,
        totalDeleted,
      });
    } catch (error) {
      console.error('Delete expert error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Bookings
  async getAllBookings(req, res) {
    try {
      const bookings = await Booking.find()
        .populate('userId', 'displayName email photoURL')
        .populate('expertId', 'name email title company')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        bookings
      });
    } catch (error) {
      console.error('Get all bookings error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get Booking by ID (Full Details)
  async getBookingById(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid booking id'
        });
      }

      const booking = await Booking.findById(id)
        .populate('userId', 'displayName email photoURL phone role')
        .populate({
          path: 'expertId',
          select: 'name email title company user',
          populate: {
            path: 'user',
            select: 'displayName email photoURL phone role'
          }
        })
        .populate('paymentId');

      if (!booking) {
        return res.status(404).json({
          success: false,
          error: 'Booking not found'
        });
      }

      res.status(200).json({
        success: true,
        booking
      });
    } catch (error) {
      console.error('Get booking by id error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Delete Booking by ID
  async deleteBooking(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid booking id'
        });
      }

      const booking = await Booking.findByIdAndDelete(id);

      if (!booking) {
        return res.status(404).json({
          success: false,
          error: 'Booking not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Booking deleted successfully'
      });
    } catch (error) {
      console.error('Delete booking error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Notes
  async getAllNotes(req, res) {
    try {
      const notes = await Note.find()
        .populate('uploader.id', 'displayName email role')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        notes
      });
    } catch (error) {
      console.error('Get all notes error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get Note by ID (Full Details)
  async getNoteById(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid note id'
        });
      }

      const note = await Note.findById(id)
        .populate('uploader.id', 'displayName email photoURL role');

      if (!note) {
        return res.status(404).json({
          success: false,
          error: 'Note not found'
        });
      }

      res.status(200).json({
        success: true,
        note
      });
    } catch (error) {
      console.error('Get note by id error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Delete Note by ID
  async deleteNote(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid note id'
        });
      }

      const note = await Note.findByIdAndDelete(id);

      if (!note) {
        return res.status(404).json({
          success: false,
          error: 'Note not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Note deleted successfully'
      });
    } catch (error) {
      console.error('Delete note error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get All Aptitude Attempts
  async getAllAptitudeAttempts(req, res) {
    try {
      const attempts = await AptitudeAttempt.find()
        .populate('userId', 'displayName email photoURL')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        attempts
      });
    } catch (error) {
      console.error('Get all aptitude attempts error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get Aptitude Attempt by ID (Full Details)
  async getAptitudeAttemptById(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid aptitude attempt id'
        });
      }

      const attempt = await AptitudeAttempt.findById(id)
        .populate('userId', 'displayName email photoURL role');

      if (!attempt) {
        return res.status(404).json({
          success: false,
          error: 'Aptitude attempt not found'
        });
      }

      res.status(200).json({
        success: true,
        attempt
      });
    } catch (error) {
      console.error('Get aptitude attempt by id error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Delete Aptitude Attempt by ID
  async deleteAptitudeAttempt(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid aptitude attempt id'
        });
      }

      const attempt = await AptitudeAttempt.findByIdAndDelete(id);

      if (!attempt) {
        return res.status(404).json({
          success: false,
          error: 'Aptitude attempt not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Aptitude attempt deleted successfully'
      });
    } catch (error) {
      console.error('Delete aptitude attempt error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
  ,
  // Get all courses
  async getAllCourses(req, res) {
    try {
      const courses = await Course.find()
        .populate('expertId', 'name email title company')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        courses
      });
    } catch (error) {
      console.error('Get all courses error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get course by ID
  async getCourseById(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid course id'
        });
      }

      const course = await Course.findById(id)
        .populate('expertId', 'name email title company')
        .lean();

      if (!course) {
        return res.status(404).json({
          success: false,
          error: 'Course not found'
        });
      }

      const enrollments = await CourseEnrollment.countDocuments({ courseId: id });
      course.enrolledCount = course.enrolledCount || enrollments;

      res.status(200).json({
        success: true,
        course
      });
    } catch (error) {
      console.error('Get course by id error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Update course (admin)
  async updateCourse(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid course id'
        });
      }

      const updates = { ...req.body };
      const allowed = ['title', 'subtitle', 'description', 'price', 'currency', 'category', 'level', 'tags', 'thumbnail', 'roadmap', 'sessions', 'maxSeats', 'isPublished', 'isActive'];
      const sanitized = {};
      allowed.forEach((key) => {
        if (updates[key] !== undefined) sanitized[key] = updates[key];
      });

      const course = await Course.findByIdAndUpdate(
        id,
        sanitized,
        { returnDocument: 'after', runValidators: true }
      );

      if (!course) {
        return res.status(404).json({
          success: false,
          error: 'Course not found'
        });
      }

      res.status(200).json({
        success: true,
        course
      });
    } catch (error) {
      console.error('Update course error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Delete course (admin)
  async deleteCourse(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid course id'
        });
      }

      const course = await Course.findByIdAndDelete(id);

      if (!course) {
        return res.status(404).json({
          success: false,
          error: 'Course not found'
        });
      }

      await CourseEnrollment.deleteMany({ courseId: id });

      res.status(200).json({
        success: true,
        message: 'Course deleted successfully'
      });
    } catch (error) {
      console.error('Delete course error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
};

module.exports = adminController;
