const Course = require('../../models/Course');
const CourseEnrollment = require('../../models/CourseEnrollment');
const Certificate = require('../../models/Certificate');
const { asyncHandler, AppError } = require('../../middleware/errorMiddleware');
const { generateCertificatePDF } = require('../../utils/certificateGenerator');

// Expert: generate certificate for student
const generateCertificate = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  
  const enrollment = await CourseEnrollment.findById(enrollmentId)
    .populate('userId', 'displayName email')
    .populate('courseId', 'title expertId');
  
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  const course = enrollment.courseId;
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to generate certificate', 403);
  }

  // Check if student completed the course
  if (enrollment.progressPercent < 100 && enrollment.status !== 'completed') {
    throw new AppError('Student has not completed the course yet', 400);
  }

  // Check if certificate already exists
  const existingCertificate = await Certificate.findOne({
    enrollmentId: enrollment._id,
    userId: enrollment.userId._id,
    courseId: course._id
  });

  if (existingCertificate) {
    return res.status(200).json({
      success: true,
      certificate: existingCertificate,
      message: 'Certificate already exists'
    });
  }

  // Generate certificate number
  const certificateNumber = `SANSAL-${course._id.toString().slice(-6)}-${enrollment.userId._id.toString().slice(-4)}-${Date.now().toString().slice(-6)}`;

  // Create certificate record
  const certificate = await Certificate.create({
    certificateNumber,
    enrollmentId: enrollment._id,
    userId: enrollment.userId._id,
    courseId: course._id,
    expertId: req.expert._id,
    studentName: enrollment.userId.displayName,
    courseName: course.title,
    issueDate: new Date(),
    expertName: req.expert.name || req.expert.displayName || 'Sansal Expert'
  });

  // Update enrollment with certificate ID
  enrollment.certificateId = certificate._id;
  await enrollment.save();

  res.status(201).json({
    success: true,
    certificate,
    message: 'Certificate generated successfully'
  });
});

// Expert: get all certificates for a course
const getCourseCertificates = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  
  const course = await Course.findById(req.params.courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to view certificates', 403);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [certificates, total] = await Promise.all([
    Certificate.find({ courseId: course._id })
      .populate('userId', 'displayName email')
      .sort({ issueDate: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Certificate.countDocuments({ courseId: course._id })
  ]);

  res.status(200).json({
    success: true,
    data: {
      certificates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

// Expert: download certificate PDF
const downloadCertificate = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findById(req.params.certificateId)
    .populate('userId', 'displayName email')
    .populate('courseId', 'title');
  
  if (!certificate) {
    throw new AppError('Certificate not found', 404);
  }

  const course = certificate.courseId;
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to download certificate', 403);
  }

  // Generate PDF if not already generated
  if (!certificate.pdfUrl) {
    const pdfBuffer = await generateCertificatePDF(certificate);
    // TODO: Upload to Cloudinary/S3 and save URL
    // certificate.pdfUrl = uploadedUrl;
    // await certificate.save();
    
    // For now, send as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificate.certificateNumber}.pdf"`);
    return res.send(pdfBuffer);
  }

  // Redirect to PDF URL if exists
  res.redirect(certificate.pdfUrl);
});

// Expert: revoke certificate
const revokeCertificate = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const certificate = await Certificate.findById(req.params.certificateId);
  
  if (!certificate) {
    throw new AppError('Certificate not found', 404);
  }

  const course = await Course.findById(certificate.courseId);
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to revoke certificate', 403);
  }

  certificate.status = 'revoked';
  certificate.revokedAt = new Date();
  certificate.revocationReason = String(reason || '').trim();
  
  await certificate.save();

  // Update enrollment to remove certificate ID
  await CourseEnrollment.updateOne(
    { _id: certificate.enrollmentId },
    { certificateId: null }
  );

  res.status(200).json({
    success: true,
    certificate,
    message: 'Certificate revoked successfully'
  });
});

// Expert: bulk generate certificates for completed students
const bulkGenerateCertificates = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to generate certificates', 403);
  }

  // Find all completed enrollments without certificates
  const enrollments = await CourseEnrollment.find({
    courseId: course._id,
    status: 'completed',
    progressPercent: { $gte: 100 },
    certificateId: null
  }).populate('userId', 'displayName');

  const certificates = [];
  
  for (const enrollment of enrollments) {
    const certificateNumber = `SANSAL-${course._id.toString().slice(-6)}-${enrollment.userId._id.toString().slice(-4)}-${Date.now().toString().slice(-6)}`;
    
    const certificate = await Certificate.create({
      certificateNumber,
      enrollmentId: enrollment._id,
      userId: enrollment.userId._id,
      courseId: course._id,
      expertId: req.expert._id,
      studentName: enrollment.userId.displayName,
      courseName: course.title,
      issueDate: new Date(),
      expertName: req.expert.name || req.expert.displayName || 'Sansal Expert'
    });

    enrollment.certificateId = certificate._id;
    await enrollment.save();
    
    certificates.push(certificate);
  }

  res.status(201).json({
    success: true,
    generatedCount: certificates.length,
    message: `${certificates.length} certificates generated successfully`
  });
});

module.exports = {
  generateCertificate,
  getCourseCertificates,
  downloadCertificate,
  revokeCertificate,
  bulkGenerateCertificates
};