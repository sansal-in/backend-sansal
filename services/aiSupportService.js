// Server-side Gemini caller for the AI Support Assistant.
// Uses a pool of API keys with sticky-cursor failover on quota / rate-limit / 5xx
// (same pattern as Frontend/src/services/geminiService.js).

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY1,
  process.env.GEMINI_API_KEY2,
  process.env.GEMINI_API_KEY3,
  process.env.GEMINI_API_KEY4,
  process.env.GEMINI_API_KEY5,
].filter((k) => typeof k === 'string' && k.trim().length > 0);

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const FAILOVER_STATUSES = new Set([401, 403, 408, 429, 500, 502, 503, 504]);
let keyCursor = 0;

function shouldFailover(status) {
  return FAILOVER_STATUSES.has(status) || (status >= 500 && status <= 599);
}

async function callGemini({ contents, systemPrompt, temperature = 0.6 }) {
  if (API_KEYS.length === 0) {
    throw new Error('AI service is not configured (no Gemini API keys).');
  }

  const errors = [];
  const total = API_KEYS.length;

  for (let attempt = 0; attempt < total; attempt++) {
    const idx = (keyCursor + attempt) % total;
    const key = API_KEYS[idx];
    const label = `key #${idx + 1}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature },
        }),
      });
    } catch (networkErr) {
      errors.push(`${label}: network error (${networkErr.message})`);
      continue;
    }

    if (res.ok) {
      let data;
      try {
        data = await res.json();
      } catch {
        errors.push(`${label}: invalid JSON response`);
        continue;
      }
      const reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
      if (!reply) {
        errors.push(`${label}: empty reply`);
        continue;
      }
      keyCursor = idx;
      return reply;
    }

    const bodyText = await res.text().catch(() => '');
    const summary = `${label}: HTTP ${res.status} ${bodyText.slice(0, 160)}`;

    if (shouldFailover(res.status)) {
      errors.push(summary);
      continue;
    }

    console.error('[ai-support] Gemini non-retriable error:', summary);
    const err = new Error('The AI assistant had a problem with that question. Please try rephrasing.');
    err.status = res.status;
    throw err;
  }

  console.error(`[ai-support] All ${total} Gemini keys failed:`, errors.join(' | '));
  throw new Error('The AI assistant is busy right now. Please try again in a moment.');
}

module.exports = {
  callGemini,
  GEMINI_MODEL: MODEL,
  HAS_KEYS: API_KEYS.length > 0,
};
