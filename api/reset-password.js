// api/reset-password.js
const bcrypt = require('bcryptjs');
const { getRedis } = require('../lib/db');
const { checkRateLimit } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const redis = getRedis();
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const ok = await checkRateLimit(redis, `rl:reset:${ip}`, 10, 60 * 15);
    if (!ok) {
      res.status(429).json({ error: 'Too many attempts. Please wait a while and try again.' });
      return;
    }

    const { token, password } = req.body || {};
    const cleanToken = String(token || '').trim();
    if (!cleanToken) {
      res.status(400).json({ error: 'Missing or invalid reset link.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const email = await redis.get(`pwreset:${cleanToken}`);
    if (!email) {
      res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      return;
    }

    const userKey = `user:${email}`;
    const raw = await redis.get(userKey);
    if (!raw) {
      res.status(400).json({ error: 'Account not found.' });
      return;
    }
    const user = typeof raw === 'string' ? JSON.parse(raw) : raw;

    user.passHash = await bcrypt.hash(password, 10);
    await redis.set(userKey, JSON.stringify(user));
    await redis.del(`pwreset:${cleanToken}`); // one-time use

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
