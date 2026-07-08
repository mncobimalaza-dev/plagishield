// api/analyze.js
// Proxies document analysis to the Claude API. The Anthropic API key lives
// ONLY in this server-side environment variable — it is never sent to,
// or readable by, the browser.
const { getRedis } = require('../lib/db');
const { requireSession, checkRateLimit } = require('../lib/auth');

const MAX_TEXT_CHARS = 3500;
const MAX_SOURCES = 8;

function sanitizeText(str) {
  return String(str || '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Require a signed-in user before spending API budget.
  const user = requireSession(req, res);
  if (!user) return; // requireSession already sent the 401

  try {
    const redis = getRedis();

    // Per-user daily quota so one account can't run up the whole team's bill.
    const dayKey = `rl:analyze:${user.email}:${new Date().toISOString().slice(0, 10)}`;
    const dailyLimit = Number(process.env.ANALYZE_DAILY_LIMIT || 30);
    const withinQuota = await checkRateLimit(redis, dayKey, dailyLimit, 60 * 60 * 24);
    if (!withinQuota) {
      res.status(429).json({ error: `Daily analysis limit (${dailyLimit}) reached. Please try again tomorrow.` });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is not configured with an API key.' });
      return;
    }

    const { text, sources } = req.body || {};
    if (typeof text !== 'string' || text.trim().length < 80) {
      res.status(400).json({ error: 'Document text is required (min 80 characters).' });
      return;
    }
    const safeSources = Array.isArray(sources) ? sources.slice(0, MAX_SOURCES) : [];

    const cleanText = sanitizeText(text).slice(0, MAX_TEXT_CHARS);
    const sourcesSummary = safeSources
      .map((s) => `- "${sanitizeText(s.title)}" [${sanitizeText(s.db)}] match:${Number(s.pct) || 0}% url:${sanitizeText(s.url)}`)
      .join('\n');

    const prompt = [
      'You are PlagiShield, an AI-enhanced plagiarism and AI-content detection engine.',
      '',
      'A live web search has already been run. Numbered sources found:',
      sourcesSummary || 'No matches found in databases.',
      '',
      'Your tasks:',
      '1. Identify specific spans of text in the document that are plagiarised, paraphrased from a source, or AI-generated.',
      '2. For each flagged span, quote the EXACT substring from the document text (must match character-for-character, max 120 chars).',
      '3. Assign each span a source_index (1-based number matching the sources list above), or 0 if AI-generated with no specific source.',
      '4. Assign severity: high (direct copy), medium (paraphrase/restructured), low (similar idea), or ai (AI-generated).',
      '5. Provide overall scores and AI-detection metrics.',
      '',
      'Document text:',
      '"""',
      cleanText,
      '"""',
      '',
      'Respond ONLY with valid JSON (no markdown fences). flagged_spans must use EXACT substrings from the document:',
      '{',
      '  "overall_score": 0,',
      '  "summary_title": "string",',
      '  "summary_text": "string",',
      '  "similarity": { "score": 0, "lexical_score": 0, "semantic_score": 0, "paraphrase_risk": "low", "finding": "string" },',
      '  "ai_detection": { "probability": 0, "perplexity": "low", "burstiness": "low", "uniformity": "low", "finding": "string" },',
      '  "flagged_spans": [',
      '    { "text": "exact substring from document", "source_index": 1, "severity": "high", "reason": "brief reason" },',
      '    { "text": "another exact substring", "source_index": 0, "severity": "ai", "reason": "AI-generated pattern" }',
      '  ],',
      '  "highlights": [',
      '    {"severity":"low","label":"string","text":"string"},',
      '    {"severity":"low","label":"string","text":"string"},',
      '    {"severity":"low","label":"string","text":"string"}',
      '  ]',
      '}',
    ].join('\n');

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      let msg = `Analysis service error (${upstream.status}).`;
      let errBody = null;
      try {
        errBody = await upstream.json();
        if (upstream.status === 429) msg = 'The analysis service is busy. Please try again shortly.';
        else if (errBody?.error?.message) msg = 'Analysis service error. Please try again.';
      } catch (e) {
        /* ignore parse errors */
      }
      // Log the real reason server-side so it's visible in Vercel logs
      // (never sent to the browser - keeps upstream details out of client responses).
      console.error('analyze upstream error:', upstream.status, JSON.stringify(errBody));
      res.status(502).json({ error: msg });
      return;
    }

    const data = await upstream.json();
    const raw = (data.content || []).map((b) => b.text || '').join('');
    const match = raw.match(/\{[\s\S]*\}/);
    let analysis;
    try {
      analysis = JSON.parse(match ? match[0] : raw);
    } catch (e) {
      res.status(502).json({ error: 'Could not parse analysis result. Please try again.' });
      return;
    }

    res.status(200).json({ analysis, sources: safeSources });

    // Save a lightweight history record (metadata only - never the document
    // text or flagged excerpts, to avoid persisting user content beyond
    // the single request). Best-effort: failures here don't affect the
    // response already sent above.
    try {
      const crypto = require('crypto');
      const record = {
        id: crypto.randomBytes(8).toString('hex'),
        date: new Date().toISOString(),
        summary_title: analysis.summary_title || 'Untitled scan',
        overall_score: analysis.overall_score ?? null,
        ai_probability: analysis.ai_detection?.probability ?? null,
        matches: safeSources.length,
      };
      const historyKey = `history:${user.email}`;
      await redis.lpush(historyKey, JSON.stringify(record));
      await redis.ltrim(historyKey, 0, 19); // keep last 20 scans
    } catch (histErr) {
      console.error('history save error:', histErr);
    }
  } catch (err) {
    console.error('analyze error:', err);
    res.status(500).json({ error: 'Something went wrong during analysis. Please try again.' });
  }
};
