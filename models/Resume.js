const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    personal: {
      fullName: { type: String, default: '' },
      title: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      location: { type: String, default: '' }
    },
    links: {
      linkedin: { type: String, default: '' },
      github: { type: String, default: '' },
      leetcode: { type: String, default: '' },
      portfolio: { type: String, default: '' }
    },
    summary: { type: String, default: '' },
    education: [
      {
        institution: { type: String, default: '' },
        degree: { type: String, default: '' },
        field: { type: String, default: '' },
        startYear: { type: String, default: '' },
        endYear: { type: String, default: '' },
        grade: { type: String, default: '' },
        location: { type: String, default: '' }
      }
    ],
    experience: [
      {
        company: { type: String, default: '' },
        role: { type: String, default: '' },
        startDate: { type: String, default: '' },
        endDate: { type: String, default: '' },
        current: { type: Boolean, default: false },
        location: { type: String, default: '' },
        responsibilities: [{ type: String }]
      }
    ],
    projects: [
      {
        name: { type: String, default: '' },
        role: { type: String, default: '' },
        link: { type: String, default: '' },
        techStack: { type: String, default: '' },
        startDate: { type: String, default: '' },
        endDate: { type: String, default: '' },
        responsibilities: [{ type: String }]
      }
    ],
    skills: {
      programming: { type: String, default: '' },
      frontend: { type: String, default: '' },
      backend: { type: String, default: '' },
      databases: { type: String, default: '' },
      tools: { type: String, default: '' },
      platforms: { type: String, default: '' },
      softSkills: { type: String, default: '' }
    },
    certifications: [
      {
        name: { type: String, default: '' },
        issuer: { type: String, default: '' },
        year: { type: String, default: '' },
        link: { type: String, default: '' }
      }
    ],
    achievements: [{ type: String }],
    languages: [{ type: String }],
    interests: [{ type: String }]
  },
  { timestamps: true }
);

resumeSchema.index({ unique: true });

module.exports = mongoose.model('Resume', resumeSchema);
