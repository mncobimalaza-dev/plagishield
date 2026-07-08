// api/history.js
const { getRedis } = require('../lib/db');
const { requireSession } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = requireSession(req, res);
  if (!user) return;

  try {
    const redis = getRedis();
    const raw = await redis.lrange(`history:${user.email}`, 0, 19);
    const records = (raw || []).map((r) => {
      try { return typeof r === 'string' ? JSON.parse(r) : r; }
      catch (e) { return null; }
    }).filter(Boolean);
    res.status(200).json({ records });
  } catch (err) {
    console.error('history fetch error:', err);
    res.status(500).json({ error: 'Could not load history.' });
  }
};
