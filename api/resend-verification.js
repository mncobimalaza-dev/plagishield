// api/resend-verification.js
const crypto = require('crypto');
const { getRedis } = require('../lib/db');
const { requireSession, checkRateLimit } = require('../lib/auth');
const { sendEmail } = require('../lib/email');

const VERIFY_TTL_SECONDS = 60 * 60 * 24; // 24 hours

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = requireSession(req, res);
  if (!user) return;

  try {
    const redis = getRedis();

    const ok = await checkRateLimit(redis, `rl:resend-verify:${user.email}`, 3, 60 * 60);
    if (!ok) {
      res.status(429).json({ error: 'Please wait a while before requesting another verification email.' });
      return;
    }

    const raw = await redis.get(`user:${user.email}`);
    if (!raw) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    const fullUser = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (fullUser.verified) {
      res.status(200).json({ ok: true, alreadyVerified: true });
      return;
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    await redis.set(`verify:${verifyToken}`, user.email, { ex: VERIFY_TTL_SECONDS });
    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;
    const verifyUrl = `${baseUrl}/api/verify-email?token=${verifyToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Verify your PlagiShield email',
      html: `
        <p>Hi ${fullUser.name || ''},</p>
        <p>Please confirm your email address by clicking the link below (expires in 24 hours):</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      `,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('resend-verification error:', err);
    res.status(500).json({ error: 'Could not send verification email. Please try again.' });
  }
};
