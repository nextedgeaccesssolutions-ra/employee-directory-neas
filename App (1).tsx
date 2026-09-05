import { useState } from "react";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Download, Edit3, FolderOpen, LogOut, Plus, Search, Trash2, Users, X } from "lucide-react";
import "./index.css";

type Employee = { id: number; name: string; role: string; email: string; driveFolderId: string };
const ROOT_FOLDER_ID = "18LExKPiPAU4zvAEV5cg8v1ELeC1ncCHU";
const DRIVE_BASE_URL = "https://drive.google.com/drive/u/0/folders/";
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export default function App() {
  const { user, loading, logout } = useAuth();
  const utils = trpc.useUtils();
  const isDirectoryRole = Boolean(user && ["admin", "hr", "manager"].includes(user.role));
  const canWrite = Boolean(user && ["admin", "hr"].includes(user.role));
  const employees = trpc.employeeDirectory.list.useQuery(undefined, { enabled: isDirectoryRole });
  const create = trpc.employeeDirectory.create.useMutation({ onSuccess: () => utils.employeeDirectory.list.invalidate() });
  const update = trpc.employeeDirectory.update.useMutation({ onSuccess: () => utils.employeeDirectory.list.invalidate() });
  const remove = trpc.employeeDirectory.remove.useMutation({ onSuccess: () => utils.employeeDirectory.list.invalidate() });
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const filtered = (employees.data ?? []).filter((employee) => { const value = query.toLowerCase(); return [employee.name, employee.role, employee.email].some((field) => field.toLowerCase().includes(value)); });

  if (loading) return <main className="page-shell"><section className="app-card"><p>Checking secure session…</p></section></main>;
  if (!user) return <main className="page-shell"><section className="app-card auth-gate"><div className="brand-mark">NE</div><h1>NEAS Employee Database</h1><p>Sign in with your organization account to access the secure employee directory.</p><button className="btn primary" onClick={() => startLogin()}>Sign in securely</button></section></main>;
  if (!isDirectoryRole) return <main className="page-shell"><section className="app-card auth-gate"><h1>Access pending</h1><p>Your account is authenticated, but an administrator must assign the Admin, HR, or Manager role before you can access employee data.</p><button className="btn" onClick={() => logout()}><LogOut size={16} /> Sign out</button></section></main>;

  const saveEmployee = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const payload = { name: String(data.get("name")), role: String(data.get("role")), email: String(data.get("email")), driveFolderId: String(data.get("driveFolderId") || ROOT_FOLDER_ID) }; if (editing?.id) update.mutate({ id: editing.id, ...payload }); else create.mutate(payload); setEditing(null); };
  const exportCsv = () => { const rows = ["ID,Name,Role,Email,DriveFolderId", ...(employees.data ?? []).map((e) => [e.id, e.name, e.role, e.email, e.driveFolderId].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))]; const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); link.download = "employee_database.csv"; link.click(); URL.revokeObjectURL(link.href); };

  return <main className="page-shell"><section className="app-card"><header className="brand-header"><div className="brand-mark">NE</div><div><h1>NextEdge Access Solutions</h1><p>Employee Database · Secure backend storage</p></div><div className="current-user"><Users size={16} /> {user.name || user.email} · {user.role}<button className="icon-btn" onClick={() => logout()} title="Sign out"><LogOut size={16} /></button></div></header><div className="toolbar"><button className="btn" onClick={exportCsv}><Download size={17} /> Export CSV</button>{canWrite && <button className="btn primary" onClick={() => setEditing({ id: 0, name: "", role: "", email: "", driveFolderId: "" })}><Plus size={17} /> Add Employee</button>}<div className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees…" /></div></div>{employees.isLoading ? <p>Loading employee records…</p> : <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Role</th><th>Email</th><th>Drive Folder</th><th>Actions</th></tr></thead><tbody>{filtered.map((employee) => <tr key={employee.id}><td><span className="avatar">{initials(employee.name)}</span>{employee.name}</td><td>{employee.role}</td><td>{employee.email}</td><td><a className="drive-link" href={`${DRIVE_BASE_URL}${employee.driveFolderId || ROOT_FOLDER_ID}`} target="_blank" rel="noreferrer"><FolderOpen size={15} /> Open folder</a></td><td>{canWrite ? <div className="actions"><button onClick={() => setEditing(employee)} title="Edit"><Edit3 size={16} /></button><button onClick={() => remove.mutate({ id: employee.id })} title="Delete"><Trash2 size={16} /></button></div> : <span className="muted">View only</span>}</td></tr>)}{!filtered.length && <tr><td colSpan={5} className="empty">No employees found.</td></tr>}</tbody></table></div>}<footer><span>Stored securely in the backend database · Drive root: <strong>{ROOT_FOLDER_ID}</strong></span></footer></section>{editing && <div className="modal-backdrop"><form className="modal" onSubmit={saveEmployee}><div className="modal-title"><h2>{editing.id ? "Edit Employee" : "Add Employee"}</h2><button type="button" onClick={() => setEditing(null)}><X size={18} /></button></div><label>Full name<input name="name" defaultValue={editing.name} required /></label><label>Job role<input name="role" defaultValue={editing.role} required /></label><label>Email<input name="email" type="email" defaultValue={editing.email} required /></label><label>Drive folder ID<input name="driveFolderId" defaultValue={editing.driveFolderId} placeholder={ROOT_FOLDER_ID} /></label><div className="modal-actions"><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" disabled={create.isPending || update.isPending}>Save employee</button></div></form></div>}</main>;
}
