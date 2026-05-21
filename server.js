const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

// Load environment variables
dotenv.config();

// Import database connection
const connectDB = require('./config/database');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const adminRoutes = require('./routes/AdminRoutes');
const expertRoutes = require('./routes/expertRoutes');
const googleMeetRoutes = require('./routes/googleMeetRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const noteRoutes = require('./routes/noteRoutes');
const aptitudeRoutes = require('./routes/aptitudeRoutes');
const codingRoutes = require('./routes/codingRoutes');
const chatRoutes = require('./routes/chatRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const courseRoutes = require('./routes/courseRoutes');

// Import middleware
const setupSwagger = require('./swagger_setup');

const { validateRazorpayConfig } = require('./config/razorpay');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');
const { initChatSocket } = require('./socket/chatSocket');

// Import routes
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');

const expertCourseRoutes = require('./routes/expertCourseRoute')
const earningRoutes = require('./routes/expertEarningRoutes');
const seoRoutes = require('./routes/seoRoutes');
const blogRoutes = require('./routes/blogRoutes');
const ssrRoutes = require('./routes/ssrRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const aiSupportRoutes = require('./routes/aiSupportRoutes');

// Initialize Express app
const app = express();
setupSwagger(app);

// Connect to MongoDB
connectDB();

// Validate Razorpay configuration
validateRazorpayConfig();

// Middleware
app.use(helmet());
app.use(cors({
  origin: [process.env.CLIENT_URL, 'https://sansal.in', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:3001',"https://sansal-admin.vercel.app", "https://admin.sansal.in", "http://localhost:5000","http://127.0.0.1:5500","https://sub-admin.sansal.in","https://expert.sansal.in", "https://www.prepmitra.in", "https://prepmitra.in", "https://www.sansal.in", "https://admin.prepmitra.in", "https://expert.prepmitra.in","https://sansal-pgj7.vercel.app"],
  credentials: true
}));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Razorpay webhook requires raw request body for signature verification.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));


const isProduction = process.env.NODE_ENV === 'production';

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => !isProduction || ['127.0.0.1', '::1'].includes(req.ip)
});
if (isProduction) {
  app.use('/api/', limiter);
}

// Higher limit for Google Meet routes (already auth-protected)
const meetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many meeting requests, please try again later.' },
  skip: (req) => !isProduction || ['127.0.0.1', '::1'].includes(req.ip)
});
if (isProduction) {
  app.use('/api/google-meet', meetLimiter);
}

// SEO routes (before rate limiting - search bots need unrestricted access)
app.use('/api/seo', seoRoutes);

// Server-side rendering for crawlers on detail pages (also pre-rate-limit so
// Googlebot, Bingbot, social link previews never get throttled).
app.use('/ssr', ssrRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root route (useful for Render health checks)
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Sansal API',
    health: '/api/health'
  });
});

// robots.txt — disallow crawling of API host (avoids 404 noise from crawlers/self-pings)
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').status(200).send('User-agent: *\nDisallow: /\n');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/expert', expertRoutes);
app.use('/api/google-meet', googleMeetRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/aptitude', aptitudeRoutes);
app.use('/api/coding', codingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/expert/courses', expertCourseRoutes);
app.use('/api/expert/earnings', earningRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/ai-support', aiSupportRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

initChatSocket(server, [
  process.env.CLIENT_URL,
  'https://sansal.in',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3001',
  'https://sansal-admin.vercel.app',
  'https://admin.sansal.in',
  'http://localhost:5000',
  'http://127.0.0.1:5500',
  'https://sub-admin.sansal.in',
  'https://expert.sansal.in',
  'https://www.prepmitra.in',
  'https://prepmitra.in',
  'https://www.sansal.in',
  'https://admin.prepmitra.in',
  'https://expert.prepmitra.in'

]);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Self-ping every 14 minutes to keep Render instance alive
  setInterval(() => {
    axios.get('https://sansal-backend-xyzsandeepsansal-moma.onrender.com/api/health')
      .then(() => console.log('Self-ping successful'))
      .catch(err => console.error('Self-ping failed', err));
  }, 14 * 60 * 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  //console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    //console.log('Process terminated');
  });
});
