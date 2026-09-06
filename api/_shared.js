import crypto from 'node:crypto';
import { sql } from '@vercel/postgres';

export const roles = new Set(['admin', 'hr', 'manager']);
const cookieName = 'neas_staff_session';

export async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS neas_employees (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    joined_date DATE,
    address TEXT,
    drive_folder_id TEXT,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

export function readBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

function sign(value) {
  return crypto.createHmac('sha256', process.env.STAFF_SESSION_SECRET || '').update(value).digest('base64url');
}

export function createSession(role) {
  const payload = Buffer.from(JSON.stringify({ role, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function sessionRole(req) {
  const raw = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw || !process.env.STAFF_SESSION_SECRET) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return roles.has(session.role) && session.exp > Date.now() ? session.role : null;
  } catch { return null; }
}

export function setSession(res, token) {
  res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

export function staffOnly(req, res) {
  const role = sessionRole(req);
  if (!role) { res.status(401).json({ error: 'Staff sign-in required.' }); return null; }
  return role;
}
