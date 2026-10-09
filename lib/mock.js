// Sample data for testing the page without a token (set MOCK=1).
// Numbers are taken from real @garethmarshall posts; dates are shifted so the
// weekly tiles have something to show.
const { seriesFor, weekSummary, seriesSummary } = require('./instagram');

const DAY = 24 * 60 * 60 * 1000;

const SAMPLE = [
  { d: 1, kind: 'Carousel', cap: 'What the Deadly Dozen taught me.', reach: 1236, views: 1587, likes: 29, comments: 8, saved: 0, shares: 2, follows: 0 },
  { d: 2, kind: 'Reel', cap: 'So proud 🙌🙌', reach: 429, views: 487, likes: 19, comments: 0, saved: 0, shares: 1, follows: 0, watch: 4358 },
  { d: 4, kind: 'Photo', cap: 'Three months left.', reach: 233, views: 394, likes: 33, comments: 3, saved: 0, shares: 0, follows: 0 },
  { d: 9, kind: 'Reel', cap: 'We’re serious about movement. Welcome to the Rexona Move Club.', reach: 5339, views: 7001, likes: 125, comments: 50, saved: 5, shares: 15, follows: 10, watch: 3469 },
  { d: 10, kind: 'Carousel', cap: 'September was a good one 👌', reach: 185, views: 374, likes: 23, comments: 0, saved: 0, shares: 0, follows: 0 },
  { d: 13, kind: 'Reel', cap: 'Robot coffee? 🤖☕ Would you choose robot coffee or your favourite barista?', reach: 1368, views: 1774, likes: 12, comments: 2, saved: 1, shares: 2, follows: 1, watch: 10863 },
  { d: 31, kind: 'Reel', cap: 'Three days in Cape Town.', reach: 261, views: 377, likes: 27, comments: 6, saved: 0, shares: 0, follows: 0, watch: 8317 },
  { d: 35, kind: 'Reel', cap: 'Trying to understand the rules here… coffee before the run?', reach: 444, views: 840, likes: 22, comments: 18, saved: 0, shares: 0, follows: 0, watch: 7619 },
  { d: 46, kind: 'Reel', cap: '// Ep. 01 | On a Mission', reach: 230, views: 361, likes: 20, comments: 0, saved: 1, shares: 0, follows: 0, watch: 8928 },
  { d: 48, kind: 'Reel', cap: 'Reigniting my love for running. 13 weeks out. 21km on 15 November.', reach: 959, views: 1331, likes: 22, comments: 7, saved: 0, shares: 1, follows: 0, watch: 2308 },
  { d: 53, kind: 'Reel', cap: 'Sometimes what we create isn’t a thing. RunBoss x Rexona run.', reach: 1472, views: 2069, likes: 31, comments: 8, saved: 1, shares: 9, follows: 2, watch: 4365 },
  { d: 54, kind: 'Reel', cap: 'Set goals. Then smash them. #BusinessAthlete', reach: 248, views: 349, likes: 19, comments: 2, saved: 0, shares: 0, follows: 0, watch: 4085 },
];

const FOLLOWER_GAINS = [0, 1, 2, 0, 1, 10, 5, 2, 0, 0, 1, 0, 2, 4, 6, 2, 0, 1, 0, 1, 3, 0, 2, 1, 0, 0, 1, 2, 0, 1];

function getMockDashboard() {
  const now = Date.now();
  const posts = SAMPLE.map((s, i) => ({
    id: `mock-${i}`,
    timestamp: new Date(now - s.d * DAY).toISOString(),
    permalink: 'https://www.instagram.com/garethmarshall/',
    thumbnail: null,
    kind: s.kind,
    firstLine: s.cap,
    series: seriesFor(s.cap),
    likes: s.likes,
    comments: s.comments,
    reach: s.reach,
    views: s.views,
    saved: s.saved,
    shares: s.shares,
    follows: s.follows,
    profileVisits: null,
    avgWatchMs: s.watch ?? null,
  }));
  return {
    generatedAt: new Date().toISOString(),
    mock: true,
    profile: { username: 'garethmarshall', followers: 1628, mediaCount: 64 },
    thisWeek: weekSummary(posts, now - 7 * DAY, now + DAY),
    lastWeek: weekSummary(posts, now - 14 * DAY, now - 7 * DAY),
    followerTrend: FOLLOWER_GAINS.map((v, i) => ({ date: new Date(now - (29 - i) * DAY).toISOString(), value: v })),
    series: seriesSummary(posts),
    posts,
  };
}

module.exports = { getMockDashboard };
