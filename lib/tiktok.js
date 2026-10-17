// TikTok, through TikTok's own Display API (Login Kit + user.info.stats + video.list).
// Runs on the server only. Tokens live in Supabase (table tiktok_auth), never in the browser.
//
// Env: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, optional TIKTOK_REDIRECT_URI.
const crypto = require('crypto');
const { supabase, rest, todaySAST } = require('./store');

const DAY = 24 * 60 * 60 * 1000;
const SCOPES = 'user.info.basic,user.info.stats,video.list';
const API = 'https://open.tiktokapis.com/v2';
const USER_FIELDS = 'open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count';
const VIDEO_FIELDS = 'id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count';

function config() {
  return {
    key: process.env.TIKTOK_CLIENT_KEY || '',
    secret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirect: process.env.TIKTOK_REDIRECT_URI || '',
  };
}

function redirectUri(req) {
  const cfg = config();
  if (cfg.redirect) return cfg.redirect;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}/api/tiktok-callback`;
}

// The OAuth "state" is signed with the dashboard password, so only someone who
// is signed in to Playmaker can start (and finish) connecting an account.
function sign(ts) {
  return crypto.createHmac('sha256', process.env.DASHBOARD_PASSWORD || 'playmaker').update(`tiktok:${ts}`).digest('hex').slice(0, 32);
}
function makeState() {
  const ts = Date.now().toString(36);
  return `${ts}.${sign(ts)}`;
}
function checkState(state) {
  const [ts, sig] = String(state || '').split('.');
  if (!ts || !sig) return false;
  const a = Buffer.from(sign(ts)), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Date.now() - parseInt(ts, 36) < 15 * 60 * 1000;
}

function authorizeUrl(req) {
  const cfg = config();
  const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
  u.searchParams.set('client_key', cfg.key);
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', redirectUri(req));
  u.searchParams.set('state', makeState());
  return u.toString();
}

async function tokenRequest(params) {
  const cfg = config();
  const body = new URLSearchParams(Object.assign({ client_key: cfg.key, client_secret: cfg.secret }, params));
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    throw Object.assign(new Error(`TikTok login failed: ${data.error_description || data.error || res.status}`), { status: 502 });
  }
  return data;
}

async function saveTokens(sb, t) {
  const now = Date.now();
  await rest(sb, 'tiktok_auth?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{
      id: 1,
      open_id: t.open_id || null,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      scope: t.scope || null,
      access_expires_at: new Date(now + (t.expires_in || 86400) * 1000).toISOString(),
      refresh_expires_at: new Date(now + (t.refresh_expires_in || 31536000) * 1000).toISOString(),
    }],
  });
}

async function finishConnect(req, code) {
  const sb = supabase();
  if (!sb) throw Object.assign(new Error('Supabase is not connected.'), { status: 500 });
  const t = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(req) });
  await saveTokens(sb, t);
}

// Returns a valid access token, refreshing it when it's close to expiring.
async function accessToken(sb) {
  const rows = await rest(sb, 'tiktok_auth?id=eq.1&select=*');
  const row = rows && rows[0];
  if (!row) return null;
  if (Date.parse(row.access_expires_at) - Date.now() > 10 * 60 * 1000) return row.access_token;
  if (Date.parse(row.refresh_expires_at) < Date.now()) {
    throw Object.assign(new Error('Your TikTok connection has expired. Connect TikTok again from the Scorecard.'), { status: 401, reconnect: true });
  }
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  await saveTokens(sb, Object.assign({ open_id: row.open_id }, t));
  return t.access_token;
}

async function call(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: Object.assign({ Authorization: `Bearer ${token}` }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  const err = data.error || {};
  if (!res.ok || (err.code && err.code !== 'ok')) {
    const e = new Error(`TikTok: ${err.message || err.code || res.status}`);
    e.status = 502;
    if (err.code === 'access_token_invalid' || err.code === 'scope_not_authorized') e.reconnect = true;
    throw e;
  }
  return data.data || {};
}

function weekSummary(videos, fromMs, toMs) {
  const v = videos.filter((x) => x.timestamp >= fromMs && x.timestamp < toMs);
  const sum = (k) => v.reduce((s, x) => s + (x[k] || 0), 0);
  const best = v.slice().sort((a, b) => b.views - a.views)[0] || null;
  return { videos: v.length, views: sum('views'), likes: sum('likes'), shares: sum('shares'), comments: sum('comments'), best: best ? { title: best.title, views: best.views } : null };
}

function shape(user, list) {
  const videos = (list || []).map((x) => {
    const text = (x.title || x.video_description || '').trim();
    return {
      id: x.id,
      timestamp: (x.create_time || 0) * 1000,
      title: text.split('\n').find((l) => l.trim()) || '(no caption)',
      url: x.share_url || null,
      cover: x.cover_image_url || null,
      duration: x.duration || null,
      views: x.view_count || 0,
      likes: x.like_count || 0,
      comments: x.comment_count || 0,
      shares: x.share_count || 0,
    };
  });
  const now = Date.now();
  return {
    connected: true,
    profile: {
      name: user.display_name || 'TikTok',
      avatar: user.avatar_url || null,
      followers: user.follower_count ?? null,
      following: user.following_count ?? null,
      likes: user.likes_count ?? null,
      videos: user.video_count ?? null,
    },
    thisWeek: weekSummary(videos, now - 7 * DAY, now + DAY),
    lastWeek: weekSummary(videos, now - 14 * DAY, now - 7 * DAY),
    videos,
  };
}

async function getTikTok() {
  const cfg = config();
  if (!cfg.key || !cfg.secret) return { connected: false, configured: false };
  const sb = supabase();
  if (!sb) return { connected: false, configured: true, error: 'Supabase is not connected.' };
  const token = await accessToken(sb);
  if (!token) return { connected: false, configured: true };
  const [u, v] = await Promise.all([
    call(token, `/user/info/?fields=${USER_FIELDS}`),
    call(token, `/video/list/?fields=${VIDEO_FIELDS}`, { method: 'POST', body: { max_count: 20 } }),
  ]);
  return shape(u.user || {}, v.videos || []);
}

async function tiktokHistory(sb) {
  try {
    const rows = await rest(sb, 'tiktok_snapshots?select=day,followers&order=day.asc&limit=1000');
    return (rows || []).map((r) => ({ date: r.day, followers: r.followers }));
  } catch (_) { return []; }
}

async function saveTikTokSnapshot(data) {
  const sb = supabase();
  if (!sb || !data || !data.connected) return null;
  const day = todaySAST();
  await rest(sb, 'tiktok_snapshots?on_conflict=day', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ day, followers: data.profile.followers, likes: data.profile.likes, videos: data.profile.videos }],
  });
  return { day, followers: data.profile.followers };
}

function mockTikTok() {
  const now = Date.now();
  const v = [
    { d: 1, t: 'What\'s your mission?', views: 2140, likes: 96, comments: 14, shares: 6 },
    { d: 3, t: 'Behind the lens at the Move Club opening', views: 880, likes: 41, comments: 3, shares: 2 },
    { d: 9, t: 'Robot coffee? 🤖☕', views: 5320, likes: 210, comments: 31, shares: 18 },
    { d: 12, t: 'Know where you\'re starting', views: 1210, likes: 55, comments: 9, shares: 1 },
  ].map((x, i) => ({ id: `tt-${i}`, create_time: Math.floor((now - x.d * DAY) / 1000), title: x.t, view_count: x.views, like_count: x.likes, comment_count: x.comments, share_count: x.shares }));
  const out = shape({ display_name: 'garethmarshallza', follower_count: 214, likes_count: 1630, video_count: 12, following_count: 180 }, v);
  out.history = [{ date: '2026-10-17', followers: 190 }, { date: '2026-10-24', followers: 214 }];
  return out;
}

module.exports = { getTikTok, authorizeUrl, finishConnect, checkState, saveTikTokSnapshot, tiktokHistory, mockTikTok, config };
