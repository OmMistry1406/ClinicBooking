// Minimal in-memory stand-in for the Supabase endpoints this app uses (PostgREST `appointments`,
// `rpc/hit_rate_limit`, and GoTrue password auth). For local/offline runs and the acceptance suite ONLY.
// Usage: node scripts/mock-supabase.mjs [port]   (default 54321)
import { randomUUID } from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.argv[2] || process.env.MOCK_SUPABASE_PORT || 54321);
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';
const STAFF = { id: randomUUID(), email: 'staff@clinic.test', password: 'ValidPassword123' };

/** @type {Array<Record<string, any>>} */
const appointments = [];
const limits = new Map();
const sessions = new Map(); // access token -> user
const refreshTokens = new Map(); // refresh token -> user

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function issue(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, exp })}.${randomUUID()}`;
  const refresh = randomUUID();
  sessions.set(access, user);
  refreshTokens.set(refresh, user);
  return { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer' };
}

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const isService = (req) => bearer(req) === SERVICE_KEY;

function matches(row, col, expr) {
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const val = expr.slice(dot + 1);
  const cell = row[col];
  const cmp = col === 'slot_start' ? [Date.parse(cell), Date.parse(val)] : [String(cell), val];
  switch (op) {
    case 'eq':
      return col === 'slot_start' ? cmp[0] === cmp[1] : String(cell) === val;
    case 'neq':
      return String(cell) !== val;
    case 'gte':
      return cmp[0] >= cmp[1];
    case 'lt':
      return cmp[0] < cmp[1];
    case 'in':
      return val.replace(/^\(|\)$/g, '').split(',').includes(String(cell));
    default:
      return true;
  }
}

function filter(params) {
  const reserved = new Set(['select', 'order', 'limit']);
  const conds = [];
  for (const [k, v] of params) if (!reserved.has(k)) conds.push([k, v]);
  return appointments.filter((r) => conds.every(([k, v]) => matches(r, k, v)));
}

const project = (rows, select) => {
  if (!select || select === '*') return rows;
  const cols = select.split(',');
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
};

const activeSlotTaken = (slot, exceptId) =>
  appointments.some(
    (a) =>
      a.id !== exceptId &&
      Date.parse(a.slot_start) === Date.parse(slot) &&
      (a.status === 'pending' || a.status === 'confirmed'),
  );

async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  try {
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;
  const q = url.searchParams;
  try {
    // ---------- PostgREST: appointments ----------
    if (p === '/rest/v1/appointments') {
      const user = sessions.get(bearer(req));
      if (!isService(req) && !user) return send(res, 401, { message: 'JWT invalid' });

      if (req.method === 'GET') {
        let rows = filter(q);
        if (q.get('order') === 'slot_start.asc') rows = [...rows].sort((a, b) => Date.parse(a.slot_start) - Date.parse(b.slot_start));
        if (q.get('limit')) rows = rows.slice(0, Number(q.get('limit')));
        return send(res, 200, project(rows, q.get('select')));
      }
      if (req.method === 'POST') {
        if (!isService(req)) return send(res, 403, { message: 'forbidden' });
        const body = await readBody(req);
        if (activeSlotTaken(body.slot_start) || appointments.some((a) => a.cancel_token === body.cancel_token)) {
          return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
        }
        const now = new Date().toISOString();
        appointments.push({
          id: randomUUID(),
          email: null,
          notes: null,
          cancelled_by: null,
          created_at: now,
          updated_at: now,
          ...body,
          status: body.status || 'pending',
        });
        return send(res, 201);
      }
      if (req.method === 'PATCH') {
        const patch = await readBody(req);
        const rows = filter(q);
        for (const r of rows) {
          if (patch.status === 'pending' || patch.status === 'confirmed') {
            if (activeSlotTaken(r.slot_start, r.id)) return send(res, 409, { code: '23505' });
          }
          Object.assign(r, patch, { updated_at: new Date().toISOString() });
        }
        return send(res, 200, project(rows, q.get('select')));
      }
    }

    // ---------- rate limit RPC ----------
    if (p === '/rest/v1/rpc/hit_rate_limit' && req.method === 'POST') {
      if (!isService(req)) return send(res, 403, { message: 'forbidden' });
      const { p_key, p_max, p_window_seconds } = await readBody(req);
      const now = Date.now();
      const cur = limits.get(p_key);
      const entry = !cur || cur.start <= now - p_window_seconds * 1000 ? { start: now, count: 1 } : { start: cur.start, count: cur.count + 1 };
      limits.set(p_key, entry);
      return send(res, 200, [{ allowed: entry.count <= p_max, current_count: entry.count }]);
    }

    // ---------- GoTrue ----------
    if (p === '/auth/v1/token' && req.method === 'POST') {
      const body = await readBody(req);
      if (q.get('grant_type') === 'password') {
        if (String(body.email).toLowerCase() === STAFF.email && body.password === STAFF.password) {
          return send(res, 200, issue(STAFF));
        }
        return send(res, 400, { error: 'invalid_grant' });
      }
      if (q.get('grant_type') === 'refresh_token') {
        const user = refreshTokens.get(body.refresh_token);
        return user ? send(res, 200, issue(user)) : send(res, 400, { error: 'invalid_grant' });
      }
    }
    if (p === '/auth/v1/user' && req.method === 'GET') {
      const user = sessions.get(bearer(req));
      if (!user) return send(res, 401, { message: 'invalid token' });
      return send(res, 200, { id: user.id, email: user.email, app_metadata: { must_change_password: false } });
    }
    if (p === '/auth/v1/logout' && req.method === 'POST') {
      sessions.delete(bearer(req));
      return send(res, 204);
    }
    if (p.startsWith('/auth/v1/admin/users/') && req.method === 'PUT') {
      if (!isService(req)) return send(res, 403, { message: 'forbidden' });
      const body = await readBody(req);
      if (typeof body.password === 'string') STAFF.password = body.password;
      return send(res, 200, { id: STAFF.id });
    }

    send(res, 404, { message: 'not found' });
  } catch (e) {
    send(res, 500, { message: String(e) });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`mock-supabase listening on ${PORT}`));
