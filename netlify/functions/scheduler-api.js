const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

const STORE_NAME = 'tf-scheduler-secure-v22';
const STATE_KEY = 'state';
const BACKUP_INDEX_KEY = 'backup-index';
const MAX_BACKUPS = 30;
const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
const TIMES = Array.from({ length: 16 }, (_, i) => `${String(i + 5).padStart(2, '0')}:00`);

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin'
  },
  body: JSON.stringify(body)
});

const now = () => new Date().toISOString();
const id = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const safeString = (value, max = 180) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const safeColor = value => /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? value : '#1F8CFF';
const safeDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
const safeTime = value => /^\d{2}:\d{2}$/.test(String(value || '')) && TIMES.includes(String(value)) ? String(value) : '06:00';
const safeDay = value => DAYS.includes(String(value)) ? String(value) : 'Mon';
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

function defaultAvailability() {
  const output = {};
  for (const day of DAYS) {
    output[day] = {};
    for (const time of TIMES) output[day][time] = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'].includes(time);
  }
  return output;
}

function defaultState() {
  const createdAt = now();
  return {
    schema: 'tf-scheduler-state-v22',
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    coaches: [{ id: 'jordan', name: 'Jordan', role: 'Admin / Coach', active: true }],
    availability: { jordan: defaultAvailability() },
    classTypes: [
      { id: 'forge1', name: 'Forge 1', intensity: 'Strength', desc: 'Strength-focused coaching.', duration: 60, color: '#1F8CFF', visible: true, active: true },
      { id: 'hiit1', name: 'HIIT 1', intensity: 'Conditioning', desc: 'High-output intervals.', duration: 60, color: '#FF6B6B', visible: true, active: true },
      { id: 'ignite', name: 'Ignite', intensity: 'Foundation', desc: 'Mobility, core, and conditioning.', duration: 60, color: '#FFD166', visible: true, active: true },
      { id: 'forge2', name: 'Forge 2', intensity: 'Advanced Strength', desc: 'Advanced strength work.', duration: 60, color: '#64B4FF', visible: true, active: true },
      { id: 'hiit2', name: 'HIIT 2', intensity: 'Advanced Conditioning', desc: 'Advanced athletic conditioning.', duration: 60, color: '#73D99F', visible: true, active: true }
    ],
    sessions: [],
    clients: [],
    bookings: [],
    requests: []
  };
}

function normalizeAvailability(input) {
  const normalized = {};
  if (!input || typeof input !== 'object') return normalized;
  for (const [coachId, weekly] of Object.entries(input)) {
    const idValue = safeString(coachId, 80);
    if (!idValue) continue;
    normalized[idValue] = {};
    for (const day of DAYS) {
      normalized[idValue][day] = {};
      for (const time of TIMES) normalized[idValue][day][time] = Boolean(weekly?.[day]?.[time]);
    }
  }
  return normalized;
}

function normalizeState(raw, previous = defaultState()) {
  const source = raw && typeof raw === 'object' ? raw : previous;
  const coaches = Array.isArray(source.coaches) ? source.coaches.slice(0, 100).map((c, index) => ({
    id: safeString(c.id, 80) || `coach_${index + 1}`,
    name: safeString(c.name, 100) || `Coach ${index + 1}`,
    role: ['Admin / Coach','Coach','Manager'].includes(c.role) ? c.role : 'Coach',
    active: c.active !== false
  })) : previous.coaches;
  if (!coaches.some(c => c.id === 'jordan')) coaches.unshift({ id: 'jordan', name: 'Jordan', role: 'Admin / Coach', active: true });

  const coachIds = new Set(coaches.map(c => c.id));
  const availability = normalizeAvailability(source.availability);
  for (const c of coaches) if (!availability[c.id]) availability[c.id] = defaultAvailability();

  const classTypes = (Array.isArray(source.classTypes) ? source.classTypes : previous.classTypes).slice(0, 120).map((t, index) => ({
    id: safeString(t.id, 80) || `type_${index + 1}`,
    name: safeString(t.name, 100) || `Type ${index + 1}`,
    intensity: safeString(t.intensity, 80) || 'Training',
    desc: safeString(t.desc, 600),
    duration: clamp(t.duration, 30, 240, 60),
    color: safeColor(t.color),
    visible: t.visible !== false,
    active: t.active !== false
  }));
  const typeIds = new Set(classTypes.map(t => t.id));

  const sessions = (Array.isArray(source.sessions) ? source.sessions : []).slice(0, 10000).map((s, index) => ({
    id: safeString(s.id, 100) || `session_${index + 1}`,
    classTypeId: typeIds.has(s.classTypeId) ? s.classTypeId : classTypes[0]?.id || 'forge1',
    kind: ['Group','Semi-Private','1-on-1'].includes(s.kind) ? s.kind : 'Group',
    date: safeDate(s.date),
    time: safeTime(s.time),
    coachId: coachIds.has(s.coachId) ? s.coachId : 'jordan',
    capacity: clamp(s.capacity, 1, 10, 10),
    durationMinutes: clamp(s.durationMinutes, 30, 240, 60),
    status: ['active','pending','canceled'].includes(s.status) ? s.status : 'active',
    notes: safeString(s.notes, 1200),
    repeatWeeks: clamp(s.repeatWeeks, 0, 52, 0),
    repeatDays: Array.isArray(s.repeatDays) ? s.repeatDays.filter(day => DAYS.includes(day)).slice(0, 5) : [],
    createdAt: safeString(s.createdAt, 40) || now(),
    updatedAt: safeString(s.updatedAt, 40) || now()
  })).filter(s => s.date);

  const clients = (Array.isArray(source.clients) ? source.clients : []).slice(0, 20000).map((c, index) => ({
    id: safeString(c.id, 100) || `client_${index + 1}`,
    name: safeString(c.name, 120),
    email: safeString(c.email, 180).toLowerCase(),
    phone: safeString(c.phone, 50),
    package: safeString(c.package, 140) || 'Unassigned',
    chargeDate: safeDate(c.chargeDate),
    createdAt: safeString(c.createdAt, 40) || now(),
    updatedAt: safeString(c.updatedAt, 40) || now()
  }));
  const clientIds = new Set(clients.map(c => c.id));
  const sessionIds = new Set(sessions.map(s => s.id));
  const bookings = (Array.isArray(source.bookings) ? source.bookings : []).slice(0, 40000).map((b, index) => ({
    id: safeString(b.id, 100) || `booking_${index + 1}`,
    sessionId: safeString(b.sessionId, 100),
    clientId: safeString(b.clientId, 100),
    status: ['approved','confirmed','cancelled'].includes(b.status) ? b.status : 'approved',
    createdAt: safeString(b.createdAt, 40) || now()
  })).filter(b => sessionIds.has(b.sessionId) && clientIds.has(b.clientId));

  const requests = (Array.isArray(source.requests) ? source.requests : []).slice(0, 3000).map((r, index) => ({
    id: safeString(r.id, 100) || `request_${index + 1}`,
    status: ['requested','approved','declined'].includes(r.status) ? r.status : 'requested',
    sessionId: safeString(r.sessionId, 100),
    date: safeDate(r.date),
    time: safeTime(r.time),
    coachId: coachIds.has(r.coachId) ? r.coachId : 'jordan',
    kind: ['Group','Semi-Private','1-on-1'].includes(r.kind) ? r.kind : 'Group',
    notes: safeString(r.notes, 1000),
    client: {
      name: safeString(r.client?.name || r.name, 120),
      email: safeString(r.client?.email || r.email, 180).toLowerCase(),
      phone: safeString(r.client?.phone || r.phone, 50)
    },
    createdAt: safeString(r.createdAt, 40) || now(),
    reviewedAt: safeString(r.reviewedAt, 40)
  })).filter(r => r.date && r.client.name && r.client.email);

  return {
    schema: 'tf-scheduler-state-v22',
    revision: clamp(source.revision, 1, Number.MAX_SAFE_INTEGER, previous.revision || 1),
    createdAt: safeString(source.createdAt, 40) || previous.createdAt || now(),
    updatedAt: safeString(source.updatedAt, 40) || now(),
    coaches,
    availability,
    classTypes,
    sessions,
    clients,
    bookings,
    requests
  };
}

function publicState(state) {
  const counts = new Map();
  for (const b of state.bookings) if (['approved','confirmed'].includes(b.status)) counts.set(b.sessionId, (counts.get(b.sessionId) || 0) + 1);
  return {
    schema: state.schema,
    revision: state.revision,
    updatedAt: state.updatedAt,
    coaches: state.coaches.filter(c => c.active !== false).map(c => ({ id: c.id, name: c.name, role: c.role, active: true })),
    availability: state.availability,
    classTypes: state.classTypes.filter(t => t.visible !== false && t.active !== false).map(t => ({ id: t.id, name: t.name, intensity: t.intensity, duration: t.duration, color: t.color, visible: true, active: true })),
    sessions: state.sessions.filter(s => s.status === 'active').map(s => ({
      id: s.id,
      classTypeId: s.classTypeId,
      kind: s.kind,
      date: s.date,
      time: s.time,
      coachId: s.coachId,
      capacity: s.capacity,
      durationMinutes: s.durationMinutes,
      status: s.status,
      bookedCount: counts.get(s.id) || 0
    }))
  };
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}
function tokenSecret() {
  return process.env.SCHEDULER_AUTH_SECRET || process.env.COACH_PIN || '1307!';
}
function signToken(payload) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', tokenSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}
function verifyToken(value) {
  if (!value || typeof value !== 'string') return null;
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', tokenSecret()).update(encoded).digest('base64url');
  const left = Buffer.from(signature), right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
function suppliedToken(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
function requireAdmin(event) {
  const payload = verifyToken(suppliedToken(event));
  return payload?.role === 'coach' ? payload : null;
}
function constantTimePinMatch(value) {
  const expected = Buffer.from(process.env.COACH_PIN || '1307!');
  const actual = Buffer.from(String(value || ''));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function ipHash(event) {
  const raw = event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for'] || 'unknown';
  return sha(raw.split(',')[0].trim()).slice(0, 32);
}

async function getState(store) {
  const saved = await store.get(STATE_KEY, { type: 'json', consistency: 'strong' });
  if (saved) return normalizeState(saved, defaultState());
  const initial = defaultState();
  await store.setJSON(STATE_KEY, initial);
  return initial;
}
async function loadBackupIndex(store) {
  const index = await store.get(BACKUP_INDEX_KEY, { type: 'json', consistency: 'strong' });
  return Array.isArray(index) ? index.slice(0, MAX_BACKUPS) : [];
}
async function createBackup(store, state, reason) {
  const entry = { id: id('backup'), revision: state.revision, createdAt: now(), reason: safeString(reason, 120) || 'server save' };
  await store.setJSON(`backup:${entry.id}`, { ...state, backup: entry });
  const index = [entry, ...(await loadBackupIndex(store))].slice(0, MAX_BACKUPS);
  await store.setJSON(BACKUP_INDEX_KEY, index);
  return entry;
}
async function writeState(store, next, reason, previous) {
  if (previous) await createBackup(store, previous, reason);
  const normalized = normalizeState(next, previous || defaultState());
  normalized.revision = (previous?.revision || 0) + 1;
  normalized.updatedAt = now();
  if (!normalized.createdAt) normalized.createdAt = now();
  await store.setJSON(STATE_KEY, normalized);
  return normalized;
}

async function checkRateLimit(store, event, bucket = 'login') {
  const key = `${bucket}-rate:${ipHash(event)}`;
  const rate = await store.get(key, { type: 'json' });
  if (rate && rate.blockedUntil && Date.parse(rate.blockedUntil) > Date.now()) return { blocked: true, key, rate };
  return { blocked: false, key, rate: rate || { attempts: 0, windowStartedAt: now() } };
}

exports.handler = async (event) => {
  // This function uses Netlify's Lambda-compatible handler signature. In this mode,
  // Blobs must be connected to the request event before a store is opened.
  // Without this initialization the function has no Blobs context and all calls fail.
  let store;
  try {
    if (typeof connectLambda === 'function') connectLambda(event);
    store = getStore({ name: STORE_NAME, consistency: 'strong' });
  } catch (error) {
    console.error('scheduler-api storage initialization failed', error);
    return json(503, {
      ok: false,
      error: 'Scheduler storage is starting. Please retry in a few seconds.'
    });
  }

  const method = event.httpMethod;
  const query = event.queryStringParameters || {};
  try {
    if (method === 'GET' && query.scope === 'health') {
      const state = await getState(store);
      return json(200, {
        ok: true,
        storage: 'connected',
        revision: state.revision,
        serverTime: now()
      });
    }
    if (method === 'GET') {
      const scope = query.scope || 'public';
      if (scope === 'public') {
        const state = await getState(store);
        return json(200, { ok: true, state: publicState(state) });
      }
      const admin = requireAdmin(event);
      if (!admin) return json(401, { ok: false, error: 'Coach authorization required.' });
      if (scope === 'admin') {
        const state = await getState(store);
        return json(200, { ok: true, state });
      }
      if (scope === 'backups') {
        return json(200, { ok: true, backups: await loadBackupIndex(store) });
      }
      return json(400, { ok: false, error: 'Unknown scope.' });
    }

    if (method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request body.' }); }

    if (body.action === 'login') {
      const limiter = await checkRateLimit(store, event, 'login');
      if (limiter.blocked) return json(429, { ok: false, error: 'Too many attempts. Try again in a few minutes.' });
      if (!constantTimePinMatch(body.pin)) {
        const attempts = (limiter.rate.attempts || 0) + 1;
        const blockedUntil = attempts >= 6 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : '';
        await store.setJSON(limiter.key, { attempts, windowStartedAt: limiter.rate.windowStartedAt, blockedUntil });
        return json(401, { ok: false, error: attempts >= 6 ? 'Too many attempts. Try again in 15 minutes.' : 'Incorrect Coach/Admin PIN.' });
      }
      await store.setJSON(limiter.key, { attempts: 0, windowStartedAt: now(), blockedUntil: '' });
      const state = await getState(store);
      const issued = Math.floor(Date.now() / 1000);
      const token = signToken({ sub: 'coach-admin', role: 'coach', iat: issued, exp: issued + (12 * 60 * 60) });
      return json(200, { ok: true, token, state });
    }

    if (body.action === 'request') {
      const limiter = await checkRateLimit(store, event, 'request');
      if (limiter.blocked) return json(429, { ok: false, error: 'Too many booking requests. Please try again later.' });
      const previous = await getState(store);
      const raw = body.request || {};
      const linkedSession = previous.sessions.find(s => s.id === safeString(raw.sessionId, 100) && s.status === 'active');
      const requestedCoach = previous.coaches.find(c => c.id === raw.coachId && c.active !== false);
      const requestedDate = linkedSession ? linkedSession.date : safeDate(raw.date);
      const requestedTime = linkedSession ? linkedSession.time : safeTime(raw.time);
      const requestedCoachId = linkedSession ? linkedSession.coachId : (requestedCoach?.id || 'jordan');
      const weekdayIndex = (new Date(`${requestedDate}T12:00:00`).getDay() + 6) % 7;
      const weekday = DAYS[weekdayIndex];
      const available = Boolean(previous.availability?.[requestedCoachId]?.[weekday]?.[requestedTime]);
      const request = {
        id: id('request'),
        status: 'requested',
        sessionId: linkedSession?.id || '',
        date: requestedDate,
        time: requestedTime,
        coachId: requestedCoachId,
        kind: linkedSession?.kind || (['Group','Semi-Private','1-on-1'].includes(raw.kind) ? raw.kind : 'Group'),
        notes: safeString(raw.notes, 1000),
        client: {
          name: safeString(raw.name, 120),
          email: safeString(raw.email, 180).toLowerCase(),
          phone: safeString(raw.phone, 50)
        },
        createdAt: now(),
        reviewedAt: ''
      };
      if (!request.client.name || !request.client.email || !request.date) return json(400, { ok: false, error: 'Name, email, and requested time are required.' });
      if (!linkedSession && !available) return json(400, { ok: false, error: 'That requested time is no longer available.' });
      const duplicate = previous.requests.some(r => r.status === 'requested' && r.date === request.date && r.time === request.time && r.client.email === request.client.email);
      if (duplicate) return json(409, { ok: false, error: 'You already have a pending request for that time.' });
      const attempts = (limiter.rate.attempts || 0) + 1;
      const blockedUntil = attempts >= 12 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : '';
      await store.setJSON(limiter.key, { attempts, windowStartedAt: limiter.rate.windowStartedAt, blockedUntil });
      const next = { ...previous, requests: [request, ...previous.requests].slice(0, 3000) };
      await writeState(store, next, 'client booking request', previous);
      return json(200, { ok: true, request: { id: request.id, status: request.status } });
    }

    const admin = requireAdmin(event);
    if (!admin) return json(401, { ok: false, error: 'Coach authorization required.' });

    if (body.action === 'save') {
      const previous = await getState(store);
      const baseRevision = Number(body.baseRevision || 0);
      if (baseRevision !== previous.revision) return json(409, { ok: false, error: 'A newer server version exists.', state: previous });
      const next = normalizeState(body.state, previous);
      const saved = await writeState(store, next, body.reason || 'coach update', previous);
      return json(200, { ok: true, state: saved });
    }

    if (body.action === 'restore') {
      const previous = await getState(store);
      const next = normalizeState(body.state, previous);
      const saved = await writeState(store, next, 'full backup restore', previous);
      return json(200, { ok: true, state: saved });
    }

    if (body.action === 'restore-backup') {
      const backupId = safeString(body.backupId, 120);
      if (!backupId) return json(400, { ok: false, error: 'Backup identifier is required.' });
      const snapshot = await store.get(`backup:${backupId}`, { type: 'json', consistency: 'strong' });
      if (!snapshot) return json(404, { ok: false, error: 'Backup snapshot not found.' });
      const previous = await getState(store);
      const saved = await writeState(store, normalizeState(snapshot, previous), `restore ${backupId}`, previous);
      return json(200, { ok: true, state: saved });
    }

    return json(400, { ok: false, error: 'Unknown action.' });
  } catch (error) {
    console.error('scheduler-api error', error);
    return json(500, { ok: false, error: 'The scheduler server could not complete that request.' });
  }
};
