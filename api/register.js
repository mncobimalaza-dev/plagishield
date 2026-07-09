// api/register.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getRedis } = require('../lib/db');
const { createSessionToken, setSessionCookie, checkRateLimit } = require('../lib/auth');
const { sendEmail } = require('../lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TTL_SECONDS = 60 * 60 * 24; // 24 hours

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const redis = getRedis();

    // Basic abuse protection: cap registrations per IP.
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const ok = await checkRateLimit(redis, `rl:register:${ip}`, 10, 60 * 60);
    if (!ok) {
      res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
      return;
    }

    const { name, email, password } = req.body || {};
    const cleanName = String(name || '').trim().slice(0, 100);
    const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 200);

    if (!cleanName) {
      res.status(400).json({ error: 'Please enter your full name.' });
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const userKey = `user:${cleanEmail}`;
    const existing = await redis.get(userKey);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passHash = await bcrypt.hash(password, 10);
    const user = { name: cleanName, email: cleanEmail, passHash, verified: false, createdAt: Date.now() };
    await redis.set(userKey, JSON.stringify(user));

    const token = createSessionToken(user);
    setSessionCookie(res, token);
    res.status(201).json({ name: user.name, email: user.email, verified: false });

    // Best-effort: send a verification email. Failures here don't block
    // registration - the response above has already been sent.
    try {
      const verifyToken = crypto.randomBytes(32).toString('hex');
      await redis.set(`verify:${verifyToken}`, cleanEmail, { ex: VERIFY_TTL_SECONDS });
      const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;
      const verifyUrl = `${baseUrl}/api/verify-email?token=${verifyToken}`;
      await sendEmail({
        to: cleanEmail,
        subject: 'Verify your PlagiShield email',
        html: `
          <p>Hi ${cleanName},</p>
          <p>Welcome to PlagiShield! Please confirm your email address by clicking the link below (expires in 24 hours):</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>If you didn't create this account, you can ignore this email.</p>
        `,
      });
    } catch (emailErr) {
      console.error('register verification email error:', emailErr);
    }
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
