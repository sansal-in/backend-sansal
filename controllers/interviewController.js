const Interview = require('../models/Interview');
const User = require('../models/User');
const { sendInterviewStartedEmail, sendInterviewResultEmail } = require('../services/emailService');

// LLM API base URL
const LLM_API_BASE = 'https://sansal-model.vercel.app';

exports.getInterviews = async (req, res) => {
  try {
    const interviews = await Interview
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      interviews
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Generate next question using LLM API
exports.generateQuestion = async (req, res) => {
  try {
    const { role, difficulty_level, experience, score, prev_question, prev_answer } = req.body;

    const response = await fetch(`${LLM_API_BASE}/generate_next_question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role,
        difficulty_level,
        experience,
        score: score / 100, // Convert percentage to 0-1 scale
        prev_question,
        prev_answer
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Score answer using LLM API
exports.scoreAnswer = async (req, res) => {
  try {
    const { question, ideal_answer, user_answer } = req.body;

    const response = await fetch(`${LLM_API_BASE}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        question,
        ideal_answer,
        user_answer
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error scoring answer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get analytics using LLM API
exports.getAnalytics = async (req, res) => {
  try {
    const { scores } = req.body;

    const response = await fetch(`${LLM_API_BASE}/analytics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scores
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.createInterview = async (req, res) => {
  try {
    const {
      config,
      status = 'pending',
      startedAt,
      questions = [],
      answers = []
    } = req.body;

    // Create interview record
    const interview = await Interview.create({
      userId: req.user._id,
      config,
      status,
      startedAt: startedAt || new Date(),
      questions,
      answers,
      totalScore: 0,
      timeSpent: 0,
      completed: false
    });

    // Fire-and-forget: notify user that the interview has started
    sendInterviewStartedEmail({ user: req.user, interview }).catch((err) => {
      console.error('Interview started email failed:', err?.message || err);
    });

    res.status(201).json({
      success: true,
      data: interview
    });

  } catch (error) {
    console.error('Error creating interview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.updateInterview = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      questions,
      answers,
      totalScore = 0,
      timeSpent = 0,
      completed = false,
      status // optional from frontend
    } = req.body;

    // 🔹 Default status logic
    let finalStatus = status || 'cancelled';
    if (completed) finalStatus = 'completed';

    // 🔹 Update interview (progress OR final)
    const interview = await Interview.findByIdAndUpdate(
      id,
      {
        questions,
        answers,
        totalScore,
        timeSpent,
        completed,
        status: finalStatus,
        completedAt: completed || finalStatus === 'cancelled' ? new Date() : null
      },
      { returnDocument: 'after' }
    );

    if (!interview) {
      return res.status(404).json({
        success: false,
        error: 'Interview not found'
      });
    }

    // 🔹 Update user
    const user = await User.findById(req.user._id);
    // Update stats only if completed (no interview snapshot stored on user)
    if (completed) {
      const newTotalScore = (user.totalScore || 0) + totalScore;
      const newInterviewCount = (user.interviewsCompleted || 0) + 1;

      user.totalScore = newTotalScore;
      user.interviewsCompleted = newInterviewCount;
      user.averageScore = newTotalScore / newInterviewCount;
      user.lastLogin = new Date();
    }
    await user.save();

    // Fire-and-forget: send result email (user + admin) when the interview completes
    if (completed) {
      sendInterviewResultEmail({ user, interview }).catch((err) => {
        console.error('Interview result email failed:', err?.message || err);
      });
    }

    res.status(200).json({
      success: true,
      data: interview
    });

  } catch (error) {
    console.error('Error updating interview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
