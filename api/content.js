// /api/content
//   GET                → all calendar rows
//   POST  {title, …}   → add a row (stage defaults to Idea)
//   PATCH ?id=<uuid>   → update fields on one row
// Requires the header "x-dashboard-key" to match DASHBOARD_PASSWORD.
const { checkPassword } = require('../lib/auth');
const { listContent, updateContent, createContent, STAGES } = require('../lib/content');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel parses JSON for us
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  const denied = checkPassword(req);
  if (denied) return send(res, denied === 'Wrong password.' ? 401 : 500, { error: denied });

  try {
    if (req.method === 'GET') return send(res, 200, { stages: STAGES, items: await listContent() });

    if (req.method === 'POST') {
      const body = await readBody(req);
      return send(res, 201, { item: await createContent(body) });
    }

    if (req.method === 'PATCH') {
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      const body = await readBody(req);
      return send(res, 200, { item: await updateContent(id, body) });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    const status = err instanceof SyntaxError ? 400 : err.status || 500;
    return send(res, status, { error: err instanceof SyntaxError ? 'Invalid JSON.' : err.message });
  }
};
