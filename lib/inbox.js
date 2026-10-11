// Plan changes delivered through the repo (inbox/plan.json), so new scripts
// and rows can reach Playmaker with a git push alone.
//
// Each change is applied once and never overwrites your own edits:
//   insert: adds the row with notion_id = key; if that key exists, it's skipped.
//   update: changes the row only if it hasn't been edited since `created`.
// Changes older than 21 days are ignored.
const { rest } = require('./store');

const EDITABLE = ['title', 'post_date', 'slot', 'series', 'format', 'lane', 'stage', 'hook', 'script', 'caption', 'notes'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE = 21 * 24 * 60 * 60 * 1000;

let ops = [];
try { ops = require('../inbox/plan.json'); } catch (_) { ops = []; }

function pick(fields) {
  const out = {};
  for (const k of EDITABLE) if (typeof fields[k] === 'string') out[k] = fields[k];
  return out;
}

// Stage only moves forward, so an update can't undo progress you've made.
const ORDER = ['Idea', 'Scripted', 'Filmed', 'Edited', 'Scheduled', 'Posted'];

async function applyInbox(sb, list = ops) {
  const now = Date.now();
  const done = [];
  for (const op of list) {
    const created = Date.parse(op.created);
    if (!op.key || !created || now - created > MAX_AGE) continue;
    try {
      if (op.op === 'insert') {
        const row = Object.assign(pick(op.fields || {}), { notion_id: op.key });
        if (!row.title) continue;
        if (!row.stage) row.stage = 'Idea';
        await rest(sb, 'content?on_conflict=notion_id', {
          method: 'POST',
          prefer: 'resolution=ignore-duplicates,return=minimal',
          body: [row],
        });
        done.push(op.key);
      } else if (op.op === 'update' && UUID.test(op.id || '')) {
        const patch = pick(op.fields || {});
        const stage = patch.stage;
        delete patch.stage;
        const since = new Date(created).toISOString();
        if (!Object.keys(patch).length) continue;
        const changed = await rest(sb, `content?id=eq.${op.id}&updated_at=lt.${since}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
        if (!changed || !changed.length) continue; // already applied, or you've edited it since
        if (stage && ORDER.includes(stage)) {
          const earlier = ORDER.slice(0, ORDER.indexOf(stage));
          if (earlier.length) {
            await rest(sb, `content?id=eq.${op.id}&stage=in.(${earlier.join(',')})`, { method: 'PATCH', body: { stage }, prefer: 'return=minimal' });
          }
        }
        done.push(op.key);
      }
    } catch (err) {
      console.error(`inbox ${op.key}: ${err.message}`);
    }
  }
  return done;
}

module.exports = { applyInbox };
