// Shared password check for the API routes.
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Returns an error message if the request isn't allowed, or null if it is.
function checkPassword(req) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return process.env.MOCK === '1' ? null : 'DASHBOARD_PASSWORD is not set.';
  return safeEqual(req.headers['x-dashboard-key'] || '', password) ? null : 'Wrong password.';
}

module.exports = { safeEqual, checkPassword };
