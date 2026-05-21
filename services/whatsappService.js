const https = require('https');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const API_VERSION = 'v22.0';

/**
 * Send a WhatsApp text message
 * @param {string} to - Phone number with country code (e.g., "919876543210")
 * @param {string} message - Text message to send
 */
const sendWhatsAppMessage = (to, message) => {
  return new Promise((resolve, reject) => {
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      console.warn('WhatsApp not sent: missing credentials');
      return resolve({ skipped: true, reason: 'missing-credentials' });
    }

    // Clean phone number — remove +, spaces, dashes
    const cleanPhone = to.replace(/[^0-9]/g, '');

    const data = JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: message }
    });

    const options = {
      hostname: 'graph.facebook.com',
      path: `/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, messageId: parsed.messages?.[0]?.id });
          } else {
            console.error('WhatsApp API error:', parsed);
            resolve({ error: parsed.error?.message || 'send-failed' });
          }
        } catch (e) {
          resolve({ error: 'parse-failed' });
        }
      });
    });

    req.on('error', (err) => {
      console.error('WhatsApp request failed:', err);
      resolve({ error: err.message || 'request-failed' });
    });

    req.write(data);
    req.end();
  });
};

/**
 * Send a WhatsApp template message (for first-time / marketing messages)
 * Templates must be pre-approved by Meta
 * @param {string} to - Phone number with country code
 * @param {string} templateName - Approved template name
 * @param {string} languageCode - e.g., "en_US" or "hi"
 * @param {Array} parameters - Template variable values
 */
const sendWhatsAppTemplate = (to, templateName, languageCode = 'en_US', parameters = []) => {
  return new Promise((resolve, reject) => {
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return resolve({ skipped: true, reason: 'missing-credentials' });
    }

    const cleanPhone = to.replace(/[^0-9]/g, '');

    const components = parameters.length > 0
      ? [{
          type: 'body',
          parameters: parameters.map(val => ({ type: 'text', text: String(val) }))
        }]
      : [];

    const data = JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 && { components })
      }
    });

    const options = {
      hostname: 'graph.facebook.com',
      path: `/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, messageId: parsed.messages?.[0]?.id });
          } else {
            console.error('WhatsApp template error:', parsed);
            resolve({ error: parsed.error?.message || 'send-failed' });
          }
        } catch (e) {
          resolve({ error: 'parse-failed' });
        }
      });
    });

    req.on('error', (err) => {
      console.error('WhatsApp template request failed:', err);
      resolve({ error: err.message || 'request-failed' });
    });

    req.write(data);
    req.end();
  });
};

// ============================================
// Pre-built message templates for SANSAL
// ============================================

/**
 * Send daily task reminder
 */
const sendDailyTaskReminder = async (phone, studentName, task, streak) => {
  const message = `Hey ${studentName}! 🎯

Your today's task:
📌 ${task}

🔥 Current Streak: ${streak} days
⏱ This will take only 15 minutes

👉 Start now: https://sansal.in/dashboard

Keep going! Every day counts towards your placement.

— Team Sansal`;

  return sendWhatsAppMessage(phone, message);
};

/**
 * Send weekly progress report
 */
const sendWeeklyProgress = async (phone, studentName, stats) => {
  const message = `Hi ${studentName}! 📊

Your Weekly Placement Report:

🎤 Interviews this week: ${stats.interviews || 0}
📈 Average Score: ${stats.avgScore || 0}%
📝 Aptitude Tests: ${stats.aptitudeTests || 0}
📚 Courses Progress: ${stats.courseProgress || 0}%
🎯 Placement Readiness: ${stats.readiness || 0}%

${stats.readiness < 50 ? '⚠️ You need more practice! Try 2 mock interviews this week.' : '💪 Great progress! Keep it up!'}

👉 https://sansal.in/dashboard

— Team Sansal`;

  return sendWhatsAppMessage(phone, message);
};

/**
 * Send booking confirmation via WhatsApp
 */
const sendBookingWhatsApp = async (phone, studentName, expertName, date, time) => {
  const message = `Hi ${studentName}! ✅

Your session is confirmed:
👨‍💼 Expert: ${expertName}
📅 Date: ${date}
🕐 Time: ${time}

👉 View details: https://sansal.in/dashboard/sessions

— Team Sansal`;

  return sendWhatsAppMessage(phone, message);
};

/**
 * Send placement drive alert
 */
const sendPlacementAlert = async (phone, studentName, companyName, deadline) => {
  const message = `🚨 ${studentName}, Placement Alert!

${companyName} is hiring!
📅 Last date to apply: ${deadline}

Are you prepared? Take a quick mock interview:
👉 https://sansal.in

Don't miss this opportunity!

— Team Sansal`;

  return sendWhatsAppMessage(phone, message);
};

/**
 * Send interview score notification
 */
const sendInterviewScore = async (phone, studentName, role, score) => {
  const emoji = score >= 80 ? '🌟' : score >= 60 ? '👍' : '💪';
  const message = `${emoji} ${studentName}, your mock interview result:

🎤 Role: ${role}
📊 Score: ${score}%
${score >= 80 ? '🔥 Excellent! You are interview-ready!' : score >= 60 ? '📈 Good! A few more practice sessions will help.' : '📌 Keep practicing! Book an expert session for guidance.'}

👉 View full report: https://sansal.in/dashboard/interviews

— Team Sansal`;

  return sendWhatsAppMessage(phone, message);
};

/**
 * Send aptitude test result notification
 */
const sendAptitudeResult = async (phone, studentName, stats) => {
  const { datasetLabel, scorePercent, correctCount, totalQuestions, incorrectCount, unansweredCount } = stats;
  const emoji = scorePercent >= 80 ? '🌟' : scorePercent >= 60 ? '👍' : '💪';
  const feedback = scorePercent >= 80
    ? '🔥 Excellent work! Keep it up!'
    : scorePercent >= 60
      ? '📈 Good job! A little more practice and you will ace it.'
      : '📌 Keep practicing! Try more aptitude tests to improve.';

  const message = `${emoji} ${studentName}, your aptitude test result:

📝 Test: ${datasetLabel || 'Aptitude Test'}
📊 Score: ${scorePercent}%
✅ Correct: ${correctCount}/${totalQuestions}
❌ Incorrect: ${incorrectCount}
⏭ Unanswered: ${unansweredCount}

${feedback}

👉 View full report: https://sansal.in/dashboard/aptitude

— Team Sansal`;

  return sendWhatsAppMessage(phone, message);
};

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendDailyTaskReminder,
  sendWeeklyProgress,
  sendBookingWhatsApp,
  sendPlacementAlert,
  sendInterviewScore,
  sendAptitudeResult
};
