// lib/db.js
// Thin wrapper around Upstash Redis (free tier, REST-based, serverless-friendly).
const { Redis } = require('@upstash/redis');

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not configured.'
    );
  }
  return new Redis({ url, token });
}

module.exports = { getRedis };
