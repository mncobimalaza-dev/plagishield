// api/forgot-password.js
const crypto = require('crypto');
const { getRedis } = require('../lib/db');
const { checkRateLimit } = require('../lib/auth');
const { sendEmail } = require('../lib/email');

const RESET_TTL_SECONDS = 30 * 60; // 30 minutes

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const redis = getRedis();
    const { email } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 200);

    // Always respond the same way whether or not the account exists -
    // this prevents attackers from using this endpoint to discover which
    // emails have accounts.
    const genericResponse = () =>
      res.status(200).json({ ok: true, message: 'If that email has an account, a reset link has been sent.' });

    if (!cleanEmail) {
      genericResponse();
      return;
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const ok = await checkRateLimit(redis, `rl:forgot:${ip}`, 5, 60 * 15);
    if (!ok) {
      // Still respond generically to avoid leaking rate-limit state.
      genericResponse();
      return;
    }

    const raw = await redis.get(`user:${cleanEmail}`);
    if (!raw) {
      genericResponse();
      return;
    }
    const user = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const token = crypto.randomBytes(32).toString('hex');
    await redis.set(`pwreset:${token}`, cleanEmail, { ex: RESET_TTL_SECONDS });

    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;
    const resetUrl = `${baseUrl}/reset-password.html?token=${token}`;

    let emailDebugInfo = null;
    try {
      await sendEmail({
        to: cleanEmail,
        subject: 'Reset your PlagiShield password',
        html: `
          <p>Hi ${user.name || ''},</p>
          <p>Someone requested a password reset for your PlagiShield account. If this was you, click the link below to choose a new password. This link expires in 30 minutes.</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `,
      });
    } catch (emailErr) {
      console.error('forgot-password email error:', emailErr);
      emailDebugInfo = String(emailErr && emailErr.message ? emailErr.message : emailErr);
    }

    if (process.env.DEBUG_EMAIL === 'true' && emailDebugInfo) {
      res.status(200).json({ ok: true, message: 'If that email has an account, a reset link has been sent.', debug: emailDebugInfo });
      return;
    }

    genericResponse();
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
