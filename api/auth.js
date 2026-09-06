import crypto from 'node:crypto';
import { clearSession, createSession, readBody, roles, setSession } from './_shared.js';

function matches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ role: null });
  if (req.method === 'DELETE') { clearSession(res); return res.status(204).end(); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { role, password } = readBody(req);
  const expected = { admin: process.env.ADMIN_PASSWORD, hr: process.env.HR_PASSWORD, manager: process.env.MANAGER_PASSWORD }[role];
  if (!roles.has(role) || !matches(password, expected) || !process.env.STAFF_SESSION_SECRET) return res.status(401).json({ error: 'Incorrect role or password.' });
  setSession(res, createSession(role));
  return res.status(200).json({ role });
}
