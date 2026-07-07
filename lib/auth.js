// lib/auth.js
// Shared helpers for cookie-based sessions using signed JWTs.
// No plaintext credentials or tokens are ever exposed to the browser except
// the opaque, signed, httpOnly session cookie itself.

const jwt = require('jsonwebtoken');

const SESSION_COOKIE = 'ps_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET is not configured. Set it as an environment variable.');
  }
  return secret;
}

/** Parse the Cookie header into a plain object. */
function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) acc[key] = val;
    return acc;
  }, {});
}

/** Create a signed session JWT for a user (only non-sensitive fields). */
function createSessionToken(user) {
  return jwt.sign(
    { email: user.email, name: user.name },
    getJwtSecret(),
    { expiresIn: SESSION_TTL_SECONDS }
  );
}

/** Attach a Set-Cookie header with the session token (httpOnly, Secure, SameSite=Lax). */
function setSessionCookie(res, token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

/** Overwrite the cookie with an expired one to log the user out. */
function clearSessionCookie(res) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

/** Read + verify the session cookie from a request. Returns {email,name} or null. */
function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getJwtSecret());
    return { email: payload.email, name: payload.name };
  } catch (e) {
    return null;
  }
}

/** Require a valid session or send 401 and return null. */
function requireSession(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' });
    return null;
  }
  return user;
}

/** Basic per-caller rate limiting backed by Redis (fails open if Redis unavailable). */
async function checkRateLimit(redis, key, limit, windowSeconds) {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return count <= limit;
  } catch (e) {
    // If Redis is briefly unavailable, don't block legitimate users.
    return true;
  }
}

module.exports = {
  parseCookies,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
  requireSession,
  checkRateLimit,
};
