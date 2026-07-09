// api/verify-email.js
// Reached via the link in the verification email (a plain GET, since it's
// clicked from an email client, not called via fetch).
const { getRedis } = require('../lib/db');

module.exports = async function handler(req, res) {
  const redis = getRedis();
  const token = String(req.query.token || '').trim();

  const redirectWith = (status) => {
    res.writeHead(302, { Location: `/?verify=${status}` });
    res.end();
  };

  if (!token) {
    redirectWith('invalid');
    return;
  }

  try {
    const email = await redis.get(`verify:${token}`);
    if (!email) {
      redirectWith('expired');
      return;
    }

    const userKey = `user:${email}`;
    const raw = await redis.get(userKey);
    if (!raw) {
      redirectWith('invalid');
      return;
    }
    const user = typeof raw === 'string' ? JSON.parse(raw) : raw;
    user.verified = true;
    await redis.set(userKey, JSON.stringify(user));
    await redis.del(`verify:${token}`); // one-time use

    redirectWith('success');
  } catch (err) {
    console.error('verify-email error:', err);
    redirectWith('error');
  }
};
