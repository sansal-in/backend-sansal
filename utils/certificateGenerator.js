const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const generateCertificatePDF = async (certificate) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        layout: "landscape",
        size: "A4",
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Certificate design
      const width = doc.page.width;
      const height = doc.page.height;

      // Border
      doc.rect(20, 20, width - 40, height - 40).stroke();

      // Title
      doc
        .fontSize(40)
        .font("Helvetica-Bold")
        .text("CERTIFICATE OF COMPLETION", 0, 100, {
          align: "center",
        });

      // Subtitle
      doc
        .fontSize(20)
        .font("Helvetica")
        .text("This is to certify that", 0, 180, {
          align: "center",
        });

      // Student name
      doc
        .fontSize(35)
        .font("Helvetica-Bold")
        .fillColor("#2c3e50")
        .text(certificate.studentName, 0, 230, {
          align: "center",
        });

      // Course details
      doc
        .fontSize(18)
        .font("Helvetica")
        .fillColor("#000000")
        .text("has successfully completed the course", 0, 300, {
          align: "center",
        });

      doc
        .fontSize(25)
        .font("Helvetica-Bold")
        .text(certificate.courseName, 0, 340, {
          align: "center",
        });

      // Date and certificate number
      doc
        .fontSize(14)
        .font("Helvetica")
        .text(`Certificate Number: ${certificate.certificateNumber}`, 50, 450);

      const issueDate = new Date(certificate.issueDate).toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        },
      );
      doc.text(`Issue Date: ${issueDate}`, 50, 480);

      // Expert signature
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .text(certificate.expertName, width - 250, 450, {
          width: 200,
          align: "center",
        });

      doc
        .fontSize(12)
        .font("Helvetica")
        .text("Course Instructor", width - 250, 480, {
          width: 200,
          align: "center",
        });

      // Footer
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#7f8c8d")
        .text("Sansal Ai - Empowering Careers Through AI", 0, height - 50, {
          align: "center",
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateCertificatePDF };
