// /api/tiktok
//   GET                  → TikTok profile, this week vs last, latest videos
//   GET ?action=connect  → { url } to start connecting your TikTok account
// Requires the header "x-dashboard-key" to match DASHBOARD_PASSWORD.
const { checkPassword } = require('../lib/auth');
const { getTikTok, authorizeUrl, tiktokHistory, mockTikTok, config, redirectUri } = require('../lib/tiktok');
const { supabase } = require('../lib/store');

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  const denied = checkPassword(req);
  if (denied) return send(res, denied === 'Wrong password.' ? 401 : 500, { error: denied });
  if (process.env.MOCK === '1') return send(res, 200, mockTikTok());

  const action = new URL(req.url, 'http://x').searchParams.get('action');
  if (action === 'connect') {
    const cfg = config();
    if (!cfg.key || !cfg.secret) return send(res, 400, { error: 'Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Vercel first.' });
    return send(res, 200, { url: authorizeUrl(req) });
  }

  try {
    const data = await getTikTok();
    if (data.connected) {
      const sb = supabase();
      data.history = sb ? await tiktokHistory(sb) : [];
    } else {
      data.redirect = redirectUri(req);
    }
    return send(res, 200, data);
  } catch (err) {
    return send(res, 200, { connected: false, configured: true, reconnect: !!err.reconnect, error: err.message, redirect: redirectUri(req) });
  }
};
