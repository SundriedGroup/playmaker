// TikTok sends you back here after you approve Playmaker. No password header is
// possible on a redirect, so the signed "state" proves the request started in Playmaker.
const { checkState, finishConnect } = require('../lib/tiktok');

function back(res, query) {
  res.statusCode = 302;
  res.setHeader('Location', `/?${query}`);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

module.exports = async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('error')) return back(res, `tiktok=error&msg=${encodeURIComponent(q.get('error_description') || q.get('error'))}`);
  if (!checkState(q.get('state'))) return back(res, 'tiktok=error&msg=' + encodeURIComponent('That link expired. Tap Connect TikTok again.'));
  if (!q.get('code')) return back(res, 'tiktok=error&msg=' + encodeURIComponent('TikTok did not send a code.'));
  try {
    await finishConnect(req, q.get('code'));
    return back(res, 'tiktok=connected');
  } catch (err) {
    return back(res, 'tiktok=error&msg=' + encodeURIComponent(err.message));
  }
};
