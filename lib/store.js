// Saves and reads daily snapshots in Supabase through its REST API.
// Uses the service role key, so this file must only ever run on the server.

function supabase() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && key ? { url, key } : null;
}

async function rest(sb, path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: sb.key, 'Content-Type': 'application/json' };
  // Legacy service_role keys are JWTs and also go in Authorization.
  // New secret keys (sb_secret_...) go in the apikey header only.
  if (sb.key.startsWith('eyJ')) headers.Authorization = `Bearer ${sb.key}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${sb.url}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`), { status: 502 });
  return text ? JSON.parse(text) : null;
}

// Today's date in South Africa, so a snapshot belongs to the right day.
function todaySAST() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function saveSnapshot(data) {
  const sb = supabase();
  if (!sb) throw Object.assign(new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set'), { status: 500 });
  const day = todaySAST();

  await rest(sb, 'account_snapshots?on_conflict=day', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ day, followers: data.profile.followers, media_count: data.profile.mediaCount }],
  });

  const rows = data.posts.map((p) => ({
    day,
    media_id: p.id,
    posted_at: p.timestamp,
    kind: p.kind,
    series: p.series,
    first_line: p.firstLine.slice(0, 280),
    reach: p.reach,
    views: p.views,
    shares: p.shares,
    saves: p.saved,
    follows: p.follows,
    comments: p.comments,
    likes: p.likes,
  }));
  if (rows.length) {
    await rest(sb, 'post_snapshots?on_conflict=day,media_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: rows,
    });
  }
  return { day, posts: rows.length, followers: data.profile.followers };
}

// Follower history for the "Road to 10k" chart. Returns [] if Supabase isn't set up.
async function followerHistory() {
  const sb = supabase();
  if (!sb) return [];
  try {
    const rows = await rest(sb, 'account_snapshots?select=day,followers&order=day.asc&limit=1000');
    return (rows || []).map((r) => ({ date: r.day, followers: r.followers }));
  } catch (_) {
    return [];
  }
}

module.exports = { saveSnapshot, followerHistory, todaySAST };
