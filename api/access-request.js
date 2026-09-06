import { sql } from '@vercel/postgres';
import { ensureSchema } from './_shared.js';

const ACCESS_EMAIL = 'info.nextedgeaccesssolutions@gmail.com';
const ACCESS_WHATSAPP = '639159029406';

function driveLink(value) {
  if (/^https:\/\/drive\.google\.com\//i.test(value)) return value;
  if (/^[A-Za-z0-9_-]+$/.test(value)) return `https://drive.google.com/drive/u/0/folders/${value}`;
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    const id = Number(req.query.employee);
    const channel = req.query.channel;
    if (!Number.isInteger(id) || !['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ error: 'A valid employee and request channel are required.' });
    }

    await ensureSchema();
    const { rows } = await sql`SELECT name, drive_folder_id AS "driveFolderId" FROM neas_employees WHERE id = ${id} AND published = TRUE LIMIT 1`;
    const employee = rows[0];
    const folderUrl = employee && driveLink(employee.driveFolderId || '');
    if (!folderUrl) return res.status(404).json({ error: 'A Drive folder is not available for this employee.' });

    const message = `Hello NextEdge Access Solutions, I would like to request approval to view the Drive folder for ${employee.name}. Please contact me with the access requirements.\n\n${folderUrl}`;
    const destination = channel === 'email'
      ? `mailto:${ACCESS_EMAIL}?subject=${encodeURIComponent(`Drive folder access request — ${employee.name}`)}&body=${encodeURIComponent(message)}`
      : `https://wa.me/${ACCESS_WHATSAPP}?text=${encodeURIComponent(message)}`;

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, destination);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to prepare the access request.' });
  }
}
