import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { api } from './api';
import { Login, Forgot, Reset, Claim } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PatientList, Register, PatientProfile } from './pages/Patients';
import { Consultations, Consultation } from './pages/Consultation';
import { Queue, Appointments, Prescriptions, Investigations, Referrals, Followups } from './pages/Clinical';
import { Reports } from './pages/Reports';
import { Users, AuditLog, SettingsPage, System } from './pages/Admin';
import { PortalProfile, PortalVisits, PortalVisit, PortalRx, PortalResults, PortalAppts, PortalFollowups } from './pages/Portal';
import { Notifications, Security, Help, Requests, Denied } from './pages/Misc';

type Item = { to: string; label: string; perm?: string[]; roles?: string[]; grp?: string };
const NAV: Item[] = [
  { to: '/', label: 'Dashboard', roles: ['super_admin', 'records_manager', 'doctor', 'nurse'] }, { to: '/', label: 'My dashboard', roles: ['patient'] },
  { to: '/patients', label: 'Patients', perm: ['patient.read', 'patient.min'], grp: 'Clinic' }, { to: '/patients/new', label: 'Register patient', perm: ['patient.write'] },
  { to: '/queue', label: "Today's queue", perm: ['queue.manage'] }, { to: '/appointments', label: 'Appointments', perm: ['appt.manage'] },
  { to: '/consultations', label: 'Consultations', perm: ['clinical.write'] }, { to: '/prescriptions', label: 'Prescriptions', perm: ['clinical.read', 'dispense'] },
  { to: '/investigations', label: 'Investigations', perm: ['clinical.read', 'invest.work'] }, { to: '/referrals', label: 'Referrals', perm: ['clinical.read'] }, { to: '/followups', label: 'Follow-ups', perm: ['clinical.read', 'appt.manage'] },
  { to: '/requests', label: 'Patient requests', perm: ['patient.write'] }, { to: '/reports', label: 'Reports', perm: ['report.view'] },
  { to: '/admin/users', label: 'Users and verification', perm: ['users.manage', 'staff.verify'], grp: 'Administration' }, { to: '/admin/audit', label: 'Audit log', perm: ['audit.view'] },
  { to: '/admin/settings', label: 'System settings', perm: ['settings.manage'] }, { to: '/admin/system', label: 'Backup and health', perm: ['system'] },
  { to: '/me/profile', label: 'My profile', roles: ['patient'], grp: 'My records' }, { to: '/me/visits', label: 'My visits', roles: ['patient'] }, { to: '/me/prescriptions', label: 'My prescriptions', roles: ['patient'] },
  { to: '/me/results', label: 'My test results', roles: ['patient'] }, { to: '/me/appointments', label: 'My appointments', roles: ['patient'] }, { to: '/me/followups', label: 'Follow-up instructions', roles: ['patient'] },
  { to: '/notifications', label: 'Notifications', grp: 'Account' }, { to: '/security', label: 'Privacy and security' }, { to: '/help', label: 'Help and support' },
];
export default function App() {
  const { user, loading, expired } = useAuth();
  if (loading) return <div className="pad">Loading…</div>;
  return <Routes>
    <Route path="/login" element={user ? <Navigate to="/" /> : <Login expired={expired} />} /><Route path="/forgot" element={<Forgot />} /><Route path="/reset" element={<Reset />} /><Route path="/claim" element={<Claim />} />
    <Route path="/*" element={user ? <Shell /> : <Navigate to="/login" />} /></Routes>;
}
function Shell() {
  const { user, can, logout } = useAuth(), loc = useLocation(), nav = useNavigate(), [open, setOpen] = useState(false), [unread, setUnread] = useState(0), [online, setOnline] = useState(navigator.onLine);
  const patient = user!.role === 'patient';
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  useEffect(() => { const f = () => api('/notifications').then(r => setUnread(r.filter((n: any) => !n.read).length)).catch(() => {}); f(); const t = setInterval(f, 60000); return () => clearInterval(t); }, [loc.pathname]);
  const items = NAV.filter(i => (!i.roles || i.roles.includes(user!.role)) && (!i.perm || can(...i.perm)));
  const label = items.find(i => i.to === loc.pathname || (i.to !== '/' && loc.pathname.startsWith(i.to)))?.label || 'Alan Galpin UCU';
  const flip = () => { const d = document.documentElement.dataset.theme !== 'dark', t = d ? 'dark' : 'light'; document.documentElement.dataset.theme = t; try { localStorage.setItem('theme', t); } catch {} api('/auth/theme', { method: 'PATCH', body: { theme: t } }).catch(() => {}); };
  const pending = !patient && ['doctor', 'nurse', 'lab', 'pharmacy'].includes(user!.role) && user!.verification !== 'Verified';
  let last = '';
  return <div className="shell"><a className="skip" href="#main">Skip to content</a>
    <aside className={'side ' + (open ? 'open' : '')} aria-label="Main navigation"><div className="brand"><img src="/ucu-logo.jpg" alt="Uganda Christian University crest" /><div><b>ALAN GALPIN UCU</b><small>Patient Records Management System</small></div></div>
      <nav className="nav">{items.map(i => { const g = i.grp && i.grp !== last ? (last = i.grp, <div className="grp" key={'g' + i.grp}>{i.grp}</div>) : null; return <span key={i.to + i.label}>{g}<NavLink to={i.to} end={i.to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>{i.label}{i.to === '/notifications' && unread > 0 && <span className="dot">{unread}</span>}</NavLink></span>; })}</nav></aside>
    <div className="main">{!online && <div className="offline" role="alert">You are offline. Changes are not saved to the server until the connection returns.</div>}
      <header className="top"><button id="menu" className="ib" onClick={() => setOpen(!open)} aria-label="Open navigation menu">☰</button><div className="crumb">Home › <b>{label}</b></div><div className="sp" />
        <button className="ib" onClick={() => nav('/notifications')} aria-label={`Notifications, ${unread} unread`}>🔔{unread > 0 && <span className="dot">{unread}</span>}</button>
        <button className="ib" onClick={flip} aria-label="Toggle dark mode">◐</button><span className="muted small" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user!.name}</span>
        <button className="ib" onClick={() => logout().then(() => nav('/login'))}>Sign out</button></header>
      <main id="main" className="page">{pending && <div className="alert warn">Your credentials are awaiting verification. Clinical features unlock after an administrator verifies them.</div>}
        <Routes>
          <Route index element={<Dashboard />} /><Route path="patients" element={<PatientList />} /><Route path="patients/new" element={<Register />} /><Route path="patients/:id" element={<PatientProfile />} />
          <Route path="consultations" element={<Consultations />} /><Route path="consultations/:id" element={<Consultation />} />
          <Route path="queue" element={<Queue />} /><Route path="appointments" element={<Appointments />} /><Route path="prescriptions" element={<Prescriptions />} /><Route path="investigations" element={<Investigations />} />
          <Route path="referrals" element={<Referrals />} /><Route path="followups" element={<Followups />} /><Route path="reports" element={<Reports />} /><Route path="requests" element={<Requests />} />
          <Route path="admin/users" element={<Users />} /><Route path="admin/audit" element={<AuditLog />} /><Route path="admin/settings" element={<SettingsPage />} /><Route path="admin/system" element={<System />} />
          <Route path="me/profile" element={<PortalProfile />} /><Route path="me/visits" element={<PortalVisits />} /><Route path="me/visits/:id" element={<PortalVisit />} /><Route path="me/prescriptions" element={<PortalRx />} />
          <Route path="me/results" element={<PortalResults />} /><Route path="me/appointments" element={<PortalAppts />} /><Route path="me/followups" element={<PortalFollowups />} />
          <Route path="notifications" element={<Notifications />} /><Route path="security" element={<Security />} /><Route path="help" element={<Help />} /><Route path="*" element={<Denied />} />
        </Routes></main></div></div>;
}
