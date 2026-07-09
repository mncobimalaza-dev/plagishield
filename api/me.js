// api/me.js
const { getRedis } = require('../lib/db');
const { getSessionUser } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  try {
    const redis = getRedis();
    const raw = await redis.get(`user:${sessionUser.email}`);
    const verified = raw ? Boolean((typeof raw === 'string' ? JSON.parse(raw) : raw).verified) : false;
    res.status(200).json({ name: sessionUser.name, email: sessionUser.email, verified });
  } catch (err) {
    console.error('me error:', err);
    // Fall back to JWT-only info if Redis is briefly unavailable.
    res.status(200).json({ name: sessionUser.name, email: sessionUser.email, verified: false });
  }
};
