// Vercel Cron calls this once a day (see vercel.json) to save a snapshot to Supabase.
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
const crypto = require('crypto');
const { getDashboard } = require('../lib/instagram');
const { saveSnapshot } = require('../lib/store');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.authorization || '', `Bearer ${secret}`)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }
  try {
    const data = await getDashboard();
    const saved = await saveSnapshot(data);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, ...saved }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: err.message }));
  }
};
