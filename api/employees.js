import { sql } from '@vercel/postgres';
import { ensureSchema, readBody, sessionRole, staffOnly } from './_shared.js';

const seed = [
  ['Alice Johnson', 'Software Engineer', 'alice.j@neas.com', '2022-03-15', '123 Tech Park, San Francisco, CA', '1A2B3C4D5E'],
  ['Brian Smith', 'HR Specialist', 'brian.s@neas.com', '2021-07-01', '456 Corporate Ave, New York, NY', '2F3G4H5I6J'],
  ['Carla Mendes', 'Marketing Manager', 'carla.m@neas.com', '2020-11-20', '789 Business Blvd, Seattle, WA', '3K4L5M6N7O'],
  ['David Chen', 'Finance Analyst', 'david.c@neas.com', '2023-01-10', '321 Finance District, Chicago, IL', '4P5Q6R7S8T'],
  ['Elena Petrova', 'Product Designer', 'elena.p@neas.com', '2022-09-05', '654 Design Ave, Austin, TX', '5U6V7W8X9Y']
];

async function seedIfEmpty() {
  const { rows } = await sql`SELECT COUNT(*)::int AS count FROM neas_employees`;
  if (rows[0].count) return;
  for (const [name, role, email, joinedDate, address, driveFolderId] of seed) {
    await sql`INSERT INTO neas_employees (name, role, email, joined_date, address, drive_folder_id) VALUES (${name}, ${role}, ${email}, ${joinedDate}, ${address}, ${driveFolderId})`;
  }
}

function clean(input) {
  const value = key => typeof input[key] === 'string' ? input[key].trim() : '';
  const employee = { name: value('name'), employeeNumber: value('employeeNumber') || null, role: value('role'), email: value('email'), joinedDate: value('joinedDate') || null, address: value('address') || null, driveFolderId: value('driveFolderId') || null };
  if (!employee.name || !employee.role || !/^\S+@\S+\.\S+$/.test(employee.email)) throw new Error('Name, role, and a valid work email are required.');
  return employee;
}

export default async function handler(req, res) {
  try {
    await ensureSchema(); await seedIfEmpty();
    if (req.method === 'GET') {
      const staff = sessionRole(req);
      const { rows } = staff
        ? await sql`SELECT id, name, employee_number AS "employeeNumber", role, email, joined_date AS "joinedDate", address, drive_folder_id AS "driveFolderId", published FROM neas_employees ORDER BY name`
        : await sql`SELECT id, name, role, email FROM neas_employees WHERE published = TRUE ORDER BY name`;
      return res.status(200).json({ employees: rows, staffRole: staff });
    }
    const staff = staffOnly(req, res); if (!staff) return;
    if (req.method === 'POST') {
      const employee = clean(readBody(req));
      const { rows } = await sql`INSERT INTO neas_employees (name, employee_number, role, email, joined_date, address, drive_folder_id, published) VALUES (${employee.name}, ${employee.employeeNumber}, ${employee.role}, ${employee.email}, ${employee.joinedDate}, ${employee.address}, ${employee.driveFolderId}, TRUE) RETURNING id`;
      return res.status(201).json({ id: rows[0].id });
    }
    if (req.method === 'PUT') {
      const body = readBody(req); const id = Number(body.id); if (!Number.isInteger(id)) return res.status(400).json({ error: 'Employee ID is required.' });
      const employee = clean(body);
      await sql`UPDATE neas_employees SET name=${employee.name}, employee_number=${employee.employeeNumber}, role=${employee.role}, email=${employee.email}, joined_date=${employee.joinedDate}, address=${employee.address}, drive_folder_id=${employee.driveFolderId}, published=TRUE, updated_at=NOW() WHERE id=${id}`;
      return res.status(200).json({ id });
    }
    if (req.method === 'DELETE') {
      const id = Number(req.query.id); if (!Number.isInteger(id)) return res.status(400).json({ error: 'Employee ID is required.' });
      await sql`DELETE FROM neas_employees WHERE id=${id}`;
      return res.status(204).end();
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Unable to save employee data.' });
  }
}
