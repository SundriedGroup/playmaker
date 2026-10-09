// The content calendar, stored in Supabase (table: public.content).
const { supabase, rest } = require('./store');

const STAGES = ['Idea', 'Scripted', 'Filmed', 'Edited', 'Scheduled', 'Posted', 'Parked'];
const EDITABLE = ['title', 'post_date', 'slot', 'series', 'format', 'lane', 'stage', 'hook', 'script', 'caption', 'notes', 'media_id'];
const LIMITS = { title: 200, slot: 40, series: 60, format: 40, lane: 40, hook: 500, media_id: 60, script: 20000, caption: 5000, notes: 5000 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function need() {
  const sb = supabase();
  if (!sb) throw Object.assign(new Error('Supabase is not connected (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'), { status: 500 });
  return sb;
}

function bad(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

// Keep only known fields, with sane types and lengths.
function clean(input, { requireTitle = false } = {}) {
  if (!input || typeof input !== 'object') throw bad('Send a JSON object.');
  const out = {};
  for (const key of EDITABLE) {
    if (!(key in input)) continue;
    let v = input[key];
    if (v === '' || v === undefined) v = null;
    if (v !== null && typeof v !== 'string') throw bad(`${key} must be text.`);
    if (key === 'post_date' && v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad('post_date must be YYYY-MM-DD.');
    if (key === 'stage' && !STAGES.includes(v)) throw bad(`stage must be one of: ${STAGES.join(', ')}.`);
    if (key === 'title' && !v) throw bad('title can\'t be empty.');
    if (v !== null && LIMITS[key] && v.length > LIMITS[key]) throw bad(`${key} is too long.`);
    out[key] = v;
  }
  if (requireTitle && !out.title) throw bad('title is required.');
  if (!Object.keys(out).length) throw bad('Nothing to update.');
  return out;
}

async function listContent() {
  const sb = need();
  return rest(sb, 'content?select=*&order=post_date.asc.nullslast,slot.asc.nullslast,created_at.asc&limit=1000');
}

async function updateContent(id, patch) {
  if (!UUID.test(id || '')) throw bad('Invalid id.');
  const sb = need();
  const rows = await rest(sb, `content?id=eq.${id}`, { method: 'PATCH', body: clean(patch), prefer: 'return=representation' });
  if (!rows || !rows.length) throw Object.assign(new Error('Not found.'), { status: 404 });
  return rows[0];
}

async function createContent(input) {
  const sb = need();
  const row = clean(input, { requireTitle: true });
  if (!row.stage) row.stage = 'Idea';
  const rows = await rest(sb, 'content', { method: 'POST', body: [row], prefer: 'return=representation' });
  return rows[0];
}

module.exports = { listContent, updateContent, createContent, STAGES };
