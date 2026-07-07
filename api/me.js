// api/me.js
const { getSessionUser } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.status(200).json(user);
};
