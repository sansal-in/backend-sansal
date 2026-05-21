const Resume = require('../models/Resume');

exports.getResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const resume = await Resume.findOne({ user: userId });
    res.status(200).json({ success: true, resume });
  } catch (error) {
    console.error('Get resume error:', error);
    res.status(500).json({ success: false, message: 'Failed to load resume' });
  }
};

exports.saveResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const payload = req.body || {};

    const update = {
      ...payload,
      user: userId
    };

    const resume = await Resume.findOneAndUpdate(
      { user: userId },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );

    res.status(200).json({ success: true, resume });
  } catch (error) {
    console.error('Save resume error:', error);
    res.status(500).json({ success: false, message: 'Failed to save resume' });
  }
};
