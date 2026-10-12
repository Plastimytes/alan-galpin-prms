import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { R } from './api';
const T = createContext<(m: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(T);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ m: string; bad?: boolean } | null>(null);
  const show = useCallback((m: string, bad?: boolean) => { setT({ m, bad }); setTimeout(() => setT(null), 3500); }, []);
  return <T.Provider value={show}>{children}{t && <div className={'toast ' + (t.bad ? 'bad' : '')} role="status">{t.m}</div>}</T.Provider>;
}
const TONE: R = { Verified: 'ok', Signed: 'ok', Completed: 'ok', Released: 'ok', Confirmed: 'ok', Active: 'ok', Dispensed: 'ok', Administered: 'ok', Reviewed: 'ok', Accepted: 'ok', 'Ready for Discharge': 'ok',
  Draft: 'warn', Pending: 'warn', 'Pending Verification': 'warn', Requested: 'warn', Prescribed: 'info', Amended: 'info', 'Checked In': 'info', 'In Consultation': 'info', 'In Progress': 'info', 'Waiting for Clinician': 'warn', 'Waiting for Triage': 'warn',
  Rejected: 'bad', Suspended: 'bad', Cancelled: 'bad', 'No Show': 'bad', Urgent: 'bad', Emergency: 'bad', Missed: 'bad', 'Expired Credentials': 'bad', Discontinued: 'bad', Unassessed: 'n', Routine: 'n' };
// Severity is always shown as text as well as colour.
export const Badge = ({ s }: { s?: string }) => <span className={'badge ' + (TONE[s || ''] || 'n')}>{s || '-'}</span>;
export const Head = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => <div className="head row"><div className="sp"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{children}</div>;
export function Modal({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <div className="modal" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="box" role="dialog" aria-modal="true" aria-label={title}><div className="mh"><h2 className="sp">{title}</h2><button className="ib" onClick={onClose} aria-label="Close">×</button></div>{children}{foot && <div className="mf">{foot}</div>}</div></div>;
}
export type F = { k: string; label: string; type?: string; options?: string[] | { v: string; l: string }[]; req?: boolean; full?: boolean; hint?: string; rows?: number; disabled?: boolean };
export function Fields({ fields, v, set }: { fields: F[]; v: R; set: (k: string, val: any) => void }) {
  return <div className="form">{fields.map(f => <div key={f.k} className={f.full || f.type === 'textarea' ? 'full' : ''}>
    {f.type === 'check' ? <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!v[f.k]} onChange={e => set(f.k, e.target.checked)} />{f.label}{f.req && <span className="req">*</span>}</label> : <>
      <label htmlFor={'f_' + f.k}>{f.label}{f.req && <span className="req"> *</span>}</label>
      {f.type === 'textarea' ? <textarea id={'f_' + f.k} rows={f.rows || 3} value={v[f.k] ?? ''} disabled={f.disabled} onChange={e => set(f.k, e.target.value)} />
        : f.options ? <select id={'f_' + f.k} value={v[f.k] ?? ''} disabled={f.disabled} onChange={e => set(f.k, e.target.value)}><option value="">Select</option>{f.options.map((o: any) => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        : <input id={'f_' + f.k} type={f.type || 'text'} value={v[f.k] ?? ''} disabled={f.disabled} onChange={e => set(f.k, e.target.value)} />}</>}
    {f.hint && <div className="small muted">{f.hint}</div>}</div>)}</div>;
}
export const useForm = (init: R = {}) => { const [v, setV] = useState<R>(init); return { v, setV, set: (k: string, x: any) => setV(p => ({ ...p, [k]: x })) }; };
export type Col = { k: string; h: string; r?: (row: R) => ReactNode; sort?: string };
export function Table({ cols, rows, onRow, empty = 'Nothing to show yet.', sort, onSort }: { cols: Col[]; rows: R[]; onRow?: (r: R) => void; empty?: string; sort?: { k: string; dir: string }; onSort?: (k: string) => void }) {
  if (!rows.length) return <div className="pad muted">{empty}</div>;
  return <div className="tw"><table className="rs"><thead><tr>{cols.map(c => <th key={c.k} className={c.sort ? 'sort' : ''} onClick={() => c.sort && onSort?.(c.sort)} aria-sort={sort?.k === c.sort ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}>{c.h}{sort?.k === c.sort ? (sort?.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.id ?? i} className={onRow ? 'click' : ''} onClick={() => onRow?.(r)} tabIndex={onRow ? 0 : undefined} onKeyDown={e => e.key === 'Enter' && onRow?.(r)}>{cols.map(c => <td key={c.k} data-l={c.h}>{c.r ? c.r(r) : r[c.k] ?? '-'}</td>)}</tr>)}</tbody></table></div>;
}
export const Pager = ({ page, total, limit, go }: { page: number; total: number; limit: number; go: (p: number) => void }) => {
  const pages = Math.max(1, Math.ceil(total / limit)); return <div className="bar" style={{ borderTop: '1px solid var(--bd)', borderBottom: 0 }}><span className="muted small sp">{total} record{total === 1 ? '' : 's'} · page {page} of {pages}</span>
    <button className="btn o s" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button><button className="btn o s" disabled={page >= pages} onClick={() => go(page + 1)}>Next</button></div>; };
export const Err = ({ e }: { e: string }) => e ? <div className="alert bad" role="alert">{e}</div> : null;
export const Card = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => <div className="card"><div className="chead"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div></div>{children}</div>;
// Charts: plain SVG/CSS, always with an accessible data table.
const Tbl = ({ data }: { data: R[] }) => <details style={{ padding: '0 12px 10px' }}><summary className="small muted">View data table</summary><table><tbody>{data.map(d => <tr key={d.label}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody></table></details>;
export function Bars({ title, data }: { title: string; data: R[] }) { const mx = Math.max(1, ...data.map(d => d.value));
  return <div className="card"><div className="pad"><h3>{title}</h3>{data.length ? <div className="bars" role="img" aria-label={title}>{data.map(d => <div key={d.label} title={`${d.label}: ${d.value}`}><span>{d.value}</span><i style={{ height: (d.value / mx) * 100 + '%' }} /><span style={{ fontSize: 10 }}>{d.label}</span></div>)}</div> : <p className="muted">No data in this period.</p>}</div><Tbl data={data} /></div>; }
export function Line({ title, data }: { title: string; data: R[] }) { const mx = Math.max(1, ...data.map(d => d.value)), W = 400, H = 120, p = data.map((d, i) => `${(i / Math.max(1, data.length - 1)) * W},${H - (d.value / mx) * (H - 10) - 4}`).join(' ');
  return <div className="card"><div className="pad"><h3>{title}</h3><svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title}><polyline points={p} fill="none" stroke="var(--pri)" strokeWidth="2.5" />{data.map((d, i) => <circle key={i} cx={(i / Math.max(1, data.length - 1)) * W} cy={H - (d.value / mx) * (H - 10) - 4} r="3" fill="var(--pri2)"><title>{d.label}: {d.value}</title></circle>)}</svg>
    <div className="small muted">Peak: {mx} · {data[0]?.label} to {data[data.length - 1]?.label}</div></div><Tbl data={data.filter(d => d.value)} /></div>; }
export function HBars({ title, data }: { title: string; data: R[] }) { const mx = Math.max(1, ...data.map(d => d.value));
  return <div className="card"><div className="pad"><h3>{title}</h3>{data.length ? data.map(d => <div className="hbar" key={d.label}><span>{d.label}</span><i style={{ width: (d.value / mx) * 100 + '%' }} /><b>{d.value}</b></div>) : <p className="muted">No data in this period.</p>}</div></div>; }
export function Donut({ title, data }: { title: string; data: R[] }) { const tot = data.reduce((a, d) => a + d.value, 0) || 1, cols = ['#00A9B7', '#1976D2', '#F57C00', '#2E7D32', '#8e5bd1', '#D32F2F']; let acc = 0;
  return <div className="card"><div className="pad"><h3>{title}</h3><div className="row"><svg viewBox="0 0 42 42" width="120" role="img" aria-label={title}><circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--bd)" strokeWidth="6" />{data.map((d, i) => { const s = (d.value / tot) * 100, el = <circle key={d.label} cx="21" cy="21" r="15.9" fill="none" stroke={cols[i % 6]} strokeWidth="6" strokeDasharray={`${s} ${100 - s}`} strokeDashoffset={25 - acc}><title>{d.label}: {d.value}</title></circle>; acc += s; return el; })}</svg>
    <div>{data.map((d, i) => <div key={d.label} className="small"><span style={{ color: cols[i % 6] }}>■</span> {d.label}: <b>{d.value}</b> ({Math.round(d.value / tot * 100)}%)</div>)}</div></div></div></div>; }
