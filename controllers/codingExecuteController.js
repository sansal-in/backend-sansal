// Proxy to a Judge0 CE instance. Defaults to the RapidAPI-hosted version
// (judge0-ce.p.rapidapi.com); set JUDGE0_URL to point at a self-hosted instance.
// The frontend never talks to Judge0 directly so we can:
//   - keep the API key out of the client
//   - enforce per-user rate limits
//   - cap code / stdin size
//   - swap providers later without changing the client.

const JUDGE0_URL = process.env.JUDGE0_URL || 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '';
const JUDGE0_API_HOST = process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com';

// Judge0 CE language IDs (stable on the RapidAPI host). To list available
// languages: GET /languages on your Judge0 instance.
const LANGUAGE_VERSIONS = {
  javascript: { id: 63, label: 'JavaScript (Node.js 12.14.0)' },
  python:     { id: 71, label: 'Python (3.8.1)' },
  cpp:        { id: 54, label: 'C++ (GCC 9.2.0)' },
  java:       { id: 62, label: 'Java (OpenJDK 13.0.1)' }
};

const MAX_CODE_LENGTH = 20000;
const MAX_STDIN_LENGTH = 5000;
const MAX_CASES_PER_REQUEST = 12;
const CPU_TIME_LIMIT_SEC = 4;
const WALL_TIME_LIMIT_SEC = 8;
const MEMORY_LIMIT_KB = 128000;

// Simple in-memory rate limit: 60 case-executions per user per minute.
const userBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

const consumeRate = (userId, units = 1) => {
  const now = Date.now();
  const bucket = userBuckets.get(userId) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += units;
  userBuckets.set(userId, bucket);
  return bucket.count <= RATE_LIMIT_MAX;
};

const isRapidApi = () => /rapidapi\.com/i.test(JUDGE0_URL);

const judge0Headers = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (isRapidApi()) {
    headers['X-RapidAPI-Key'] = JUDGE0_API_KEY;
    headers['X-RapidAPI-Host'] = JUDGE0_API_HOST;
  } else if (JUDGE0_API_KEY) {
    // Self-hosted Judge0 with auth token enabled.
    headers['X-Auth-Token'] = JUDGE0_API_KEY;
  }
  return headers;
};

// Judge0 status IDs we care about:
//   1  In Queue
//   2  Processing
//   3  Accepted (success)
//   4  Wrong Answer (only set when expected_output is provided — we don't)
//   5  Time Limit Exceeded
//   6  Compilation Error
//   7-12 Various Runtime Errors
//   13 Internal Error
//   14 Exec Format Error
const interpretStatus = (submission) => {
  const statusId = submission?.status?.id;
  const stderr = submission?.stderr || '';
  const compile = submission?.compile_output || '';
  const stdout = submission?.stdout || '';

  if (statusId === 3) {
    return { stage: 'run', stdout, stderr, exitCode: 0 };
  }
  if (statusId === 5) {
    return { stage: 'run', stdout, stderr: stderr || 'Time Limit Exceeded', exitCode: 124 };
  }
  if (statusId === 6) {
    return { stage: 'compile', stdout: '', stderr: compile || 'Compilation Error', exitCode: 1 };
  }
  if (statusId >= 7 && statusId <= 12) {
    return { stage: 'run', stdout, stderr: stderr || submission?.message || 'Runtime Error', exitCode: submission?.exit_code ?? 1 };
  }
  return {
    stage: 'run',
    stdout,
    stderr: stderr || compile || submission?.message || 'Execution failed',
    exitCode: submission?.exit_code ?? 1
  };
};

const runOne = async ({ runtime, code, stdin }) => {
  if (isRapidApi() && !JUDGE0_API_KEY) {
    return { ok: false, error: 'Code execution is not configured on this server. Missing JUDGE0_API_KEY.' };
  }

  const body = {
    source_code: code,
    language_id: runtime.id,
    stdin: stdin || '',
    cpu_time_limit: CPU_TIME_LIMIT_SEC,
    wall_time_limit: WALL_TIME_LIMIT_SEC,
    memory_limit: MEMORY_LIMIT_KB
  };

  // wait=true: synchronous mode. Judge0 holds the connection until the run
  // finishes (~1-3s), so we get the result in a single round trip without
  // having to poll for tokens.
  const url = `${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: judge0Headers(),
      body: JSON.stringify(body)
    });
  } catch (err) {
    return { ok: false, error: `Executor unreachable: ${err.message}` };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'Code executor rejected the API key. Check JUDGE0_API_KEY on the server.' };
  }
  if (response.status === 402) {
    return { ok: false, error: 'Code executor quota exceeded. The free RapidAPI plan limit has been hit; try again tomorrow or upgrade.' };
  }
  if (response.status === 429) {
    return { ok: false, error: 'Code executor rate-limited. Please wait a few seconds and try again.' };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { ok: false, error: `Executor HTTP ${response.status}: ${text.slice(0, 200)}` };
  }

  const data = await response.json().catch(() => null);
  if (!data) return { ok: false, error: 'Executor returned invalid JSON' };

  return { ok: true, ...interpretStatus(data) };
};

const codingExecuteController = {
  async execute(req, res) {
    try {
      const { language, code, cases } = req.body || {};

      if (!language || !LANGUAGE_VERSIONS[language]) {
        return res.status(400).json({ success: false, error: 'Unsupported language' });
      }
      if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ success: false, error: 'code is required' });
      }
      if (code.length > MAX_CODE_LENGTH) {
        return res.status(400).json({ success: false, error: 'Code is too large' });
      }
      if (!Array.isArray(cases) || cases.length === 0) {
        return res.status(400).json({ success: false, error: 'cases must be a non-empty array' });
      }
      if (cases.length > MAX_CASES_PER_REQUEST) {
        return res.status(400).json({ success: false, error: `Too many cases (max ${MAX_CASES_PER_REQUEST})` });
      }
      for (const tc of cases) {
        if (typeof tc?.stdin !== 'string' || tc.stdin.length > MAX_STDIN_LENGTH) {
          return res.status(400).json({ success: false, error: 'Each case needs a stdin string under 5KB' });
        }
      }

      const userId = req.user?._id?.toString() || 'anon';
      if (!consumeRate(userId, cases.length)) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please wait a minute before submitting again.'
        });
      }

      const runtime = LANGUAGE_VERSIONS[language];

      // Sequential to stay well under any rate-limit. On RapidAPI's free tier
      // that's ~50 executions/day total — we don't want to burn the budget.
      const results = [];
      for (let i = 0; i < cases.length; i += 1) {
        const tc = cases[i];
        const t0 = Date.now();
        const r = await runOne({ runtime, code, stdin: tc.stdin });
        results.push({
          index: i,
          ok: r.ok,
          error: r.ok ? '' : r.error,
          stdout: r.stdout || '',
          stderr: r.stderr || '',
          exitCode: r.exitCode ?? -1,
          stage: r.stage || 'run',
          durationMs: Date.now() - t0
        });
        // Bail early on a hard configuration failure so we don't burn quota
        // running all 6 cases against an invalid key.
        if (!r.ok && /API key|not configured/i.test(r.error)) {
          // Mark the remaining cases as not-run so the UI doesn't claim wrong-answer.
          for (let j = i + 1; j < cases.length; j += 1) {
            results.push({
              index: j, ok: false, error: 'Skipped (executor unavailable)',
              stdout: '', stderr: '', exitCode: -1, stage: 'run', durationMs: 0
            });
          }
          break;
        }
      }

      res.status(200).json({ success: true, results });
    } catch (error) {
      console.error('Coding execute error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  async listLanguages(_req, res) {
    res.status(200).json({
      success: true,
      provider: isRapidApi() ? 'judge0-rapidapi' : 'judge0-self-hosted',
      configured: isRapidApi() ? Boolean(JUDGE0_API_KEY) : true,
      languages: Object.entries(LANGUAGE_VERSIONS).map(([id, info]) => ({
        id,
        languageId: info.id,
        label: info.label
      }))
    });
  }
};

module.exports = codingExecuteController;
