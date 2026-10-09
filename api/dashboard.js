// Vercel serverless function: GET /api/dashboard
// Requires the header "x-dashboard-key" to match DASHBOARD_PASSWORD.
const crypto = require('crypto');
const { getDashboard } = require('../lib/instagram');
const { getMockDashboard } = require('../lib/mock');
const { followerHistory } = require('../lib/store');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const mock = process.env.MOCK === '1';
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password && !mock) {
    res.statusCode = 500;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ error: 'DASHBOARD_PASSWORD is not set. Add it in Vercel → Settings → Environment Variables.' }));
  }
  if (password && !safeEqual(req.headers['x-dashboard-key'] || '', password)) {
    res.statusCode = 401;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ error: 'Wrong password.' }));
  }

  try {
    const [data, history] = await Promise.all([
      mock ? getMockDashboard() : getDashboard(),
      mock ? Promise.resolve(null) : followerHistory(),
    ]);
    if (history) data.followerHistory = history;
    data.followerGoal = parseInt(process.env.FOLLOWER_GOAL || '10000', 10) || 10000;
    // Behind a password, so never cache it on the CDN; always fetch fresh on Refresh.
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    return res.end(JSON.stringify(data));
  } catch (err) {
    res.statusCode = err.status && err.status >= 400 ? 502 : 500;
    res.setHeader('Cache-Control', 'no-store');
    const hint = err.code === 190
      ? 'Your Meta access token has expired or been revoked. Create a new one and update META_ACCESS_TOKEN in Vercel.'
      : undefined;
    return res.end(JSON.stringify({ error: err.message, hint }));
  }
};
