// api/login.js
const bcrypt = require('bcryptjs');
const { getRedis } = require('../lib/db');
const { createSessionToken, setSessionCookie, checkRateLimit } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const redis = getRedis();

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 200);

    // Rate limit by IP AND by email to blunt brute-force / credential-stuffing attempts.
    const ipOk = await checkRateLimit(redis, `rl:login:ip:${ip}`, 20, 60 * 15);
    const emailOk = cleanEmail
      ? await checkRateLimit(redis, `rl:login:email:${cleanEmail}`, 8, 60 * 15)
      : true;
    if (!ipOk || !emailOk) {
      res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.' });
      return;
    }

    if (!cleanEmail || typeof password !== 'string') {
      res.status(400).json({ error: 'Please enter your email and password.' });
      return;
    }

    const raw = await redis.get(`user:${cleanEmail}`);
    // Always run bcrypt.compare (even on a dummy hash) so response timing
    // doesn't reveal whether the email exists.
    const user = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    const hashToCheck = user ? user.passHash : '$2a$10$C6UzMDM.H6dfI/f/IKcEeO0njGxLxLYbLNyRJhr0K7X8SqxAFPqxa';
    const match = await bcrypt.compare(password, hashToCheck);

    if (!user || !match) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }

    const token = createSessionToken(user);
    setSessionCookie(res, token);
    res.status(200).json({ name: user.name, email: user.email, verified: Boolean(user.verified) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
