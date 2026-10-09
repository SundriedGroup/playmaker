// Reads Instagram data through the Meta Graph API. Runs on the server only:
// the access token never reaches the browser.

const DAY = 24 * 60 * 60 * 1000;

// Media metrics we would like. Meta rejects the whole request if one metric is
// not valid for a post type, so we fall back to asking one at a time.
const MEDIA_METRICS = [
  'reach',
  'views',
  'saved',
  'shares',
  'total_interactions',
  'follows',
  'profile_visits',
  'ig_reels_avg_watch_time',
];

function config() {
  const token = process.env.META_ACCESS_TOKEN || '';
  // Tokens from "Instagram API with Instagram Login" start with IG and use
  // graph.instagram.com; Facebook-login tokens use graph.facebook.com.
  const igLogin = token.startsWith('IG');
  return {
    token,
    version: process.env.META_GRAPH_VERSION || 'v23.0',
    host: process.env.META_GRAPH_HOST || (igLogin ? 'graph.instagram.com' : 'graph.facebook.com'),
    userId: process.env.IG_USER_ID || (igLogin ? 'me' : ''),
    postLimit: Math.min(parseInt(process.env.POST_LIMIT || '15', 10) || 15, 50),
  };
}

async function graph(cfg, path, params = {}) {
  const url = new URL(`https://${cfg.host}/${cfg.version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', cfg.token);
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    const err = new Error(e.message || `Meta API error ${res.status}`);
    err.code = e.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

function readMetric(item) {
  if (item.total_value && typeof item.total_value.value === 'number') return item.total_value.value;
  if (Array.isArray(item.values) && item.values.length) {
    const v = item.values[item.values.length - 1].value;
    return typeof v === 'number' ? v : null;
  }
  return null;
}

// Best first guess per post type, so most posts need one request.
const REEL_METRICS = ['reach', 'views', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time'];
const FEED_METRICS = ['reach', 'views', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits'];

async function mediaInsights(cfg, mediaId, productType) {
  const out = {};
  const first = productType === 'REELS' ? REEL_METRICS : FEED_METRICS;
  try {
    const body = await graph(cfg, `${mediaId}/insights`, { metric: first.join(',') });
    for (const item of body.data || []) out[item.name] = readMetric(item);
    return out;
  } catch (_) {
    // Fall back to one metric per request and keep whatever works.
    const results = await Promise.allSettled(
      MEDIA_METRICS.map((m) => graph(cfg, `${mediaId}/insights`, { metric: m }))
    );
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const item = (r.value.data || [])[0];
        if (item) out[MEDIA_METRICS[i]] = readMetric(item);
      }
    });
    return out;
  }
}

// Series rules. Edit these to match how you write captions.
// "More life. Less excuses." is in every caption, so it is not used as a rule.
const SERIES_RULES = [
  { name: 'Road to 21km', test: /road to 21|21\s?km|days to go/i },
  { name: 'More Life', test: /\bep\.?\s?\d|more life,? ep/i },
  { name: 'Business Athlete', test: /business\s?athlete|pros vs|athlete habits|leaders?\b/i },
  { name: 'Coastal', test: /@ccroastersza|coastal coffee|first cup/i },
];

function seriesFor(caption) {
  const c = caption || '';
  const hit = SERIES_RULES.find((r) => r.test.test(c));
  return hit ? hit.name : 'Other';
}

function sum(posts, key) {
  return posts.reduce((t, p) => t + (typeof p[key] === 'number' ? p[key] : 0), 0);
}

function weekSummary(posts, fromMs, toMs) {
  const inRange = posts.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    return t >= fromMs && t < toMs;
  });
  const best = inRange.slice().sort((a, b) => (b.reach || 0) - (a.reach || 0))[0] || null;
  return {
    posts: inRange.length,
    reach: sum(inRange, 'reach'),
    shares: sum(inRange, 'shares'),
    saves: sum(inRange, 'saved'),
    follows: sum(inRange, 'follows'),
    over1000: inRange.filter((p) => (p.reach || 0) >= 1000).length,
    best: best ? { id: best.id, caption: best.firstLine, reach: best.reach } : null,
  };
}

function seriesSummary(posts) {
  const groups = {};
  for (const p of posts) {
    const g = (groups[p.series] = groups[p.series] || { series: p.series, posts: 0, reach: 0, shares: 0, saves: 0 });
    g.posts += 1;
    g.reach += p.reach || 0;
    g.shares += p.shares || 0;
    g.saves += p.saved || 0;
  }
  return Object.values(groups)
    .map((g) => ({ ...g, avgReach: Math.round(g.reach / g.posts) }))
    .sort((a, b) => b.avgReach - a.avgReach);
}

async function followerTrend(cfg) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - 29 * 24 * 60 * 60;
  try {
    const body = await graph(cfg, `${cfg.userId}/insights`, { metric: 'follower_count', period: 'day', since, until });
    const item = (body.data || [])[0];
    return ((item && item.values) || []).map((v) => ({ date: v.end_time, value: v.value }));
  } catch (_) {
    return [];
  }
}

async function getDashboard() {
  const cfg = config();
  if (!cfg.token) throw Object.assign(new Error('META_ACCESS_TOKEN is not set'), { status: 500 });
  if (!cfg.userId) throw Object.assign(new Error('IG_USER_ID is not set'), { status: 500 });
  if (cfg.userId !== 'me' && !/^\d+$/.test(cfg.userId)) {
    throw Object.assign(new Error(`IG_USER_ID must be your numeric Instagram account ID, not your handle ("${cfg.userId}"). See the README for how to find it.`), { status: 500 });
  }

  const [profile, media, trend] = await Promise.all([
    graph(cfg, cfg.userId, { fields: 'username,followers_count,media_count' }),
    graph(cfg, `${cfg.userId}/media`, {
      fields: 'id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count',
      limit: cfg.postLimit,
    }),
    followerTrend(cfg),
  ]);

  const items = media.data || [];
  const insights = await Promise.all(items.map((m) => mediaInsights(cfg, m.id, m.media_product_type)));

  const posts = items.map((m, i) => {
    const caption = m.caption || '';
    const kind = m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : m.media_type === 'VIDEO' ? 'Video' : 'Photo';
    return {
      id: m.id,
      timestamp: m.timestamp,
      permalink: m.permalink,
      thumbnail: m.thumbnail_url || (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM' ? m.media_url : null),
      kind,
      firstLine: caption.split('\n').find((l) => l.trim()) || '(no caption)',
      series: seriesFor(caption),
      likes: m.like_count ?? null,
      comments: m.comments_count ?? null,
      reach: insights[i].reach ?? null,
      views: insights[i].views ?? null,
      saved: insights[i].saved ?? null,
      shares: insights[i].shares ?? null,
      follows: insights[i].follows ?? null,
      profileVisits: insights[i].profile_visits ?? null,
      avgWatchMs: insights[i].ig_reels_avg_watch_time ?? null,
    };
  });

  const now = Date.now();
  return {
    generatedAt: new Date().toISOString(),
    mock: false,
    profile: {
      username: profile.username,
      followers: profile.followers_count,
      mediaCount: profile.media_count,
    },
    thisWeek: weekSummary(posts, now - 7 * DAY, now + DAY),
    lastWeek: weekSummary(posts, now - 14 * DAY, now - 7 * DAY),
    followerTrend: trend,
    series: seriesSummary(posts),
    posts,
  };
}

module.exports = { getDashboard, seriesFor, weekSummary, seriesSummary };
