import { useEffect, useState, ReactNode } from 'react';
import { api, R, ApiError } from '../api';
import { Modal, Fields, F, useToast, Err } from '../ui';
export function usePatients() { const [p, setP] = useState<R[]>([]); useEffect(() => { api('/lookups/patients').then(setP).catch(() => {}); }, []); return p.map(x => ({ v: String(x.id), l: `${x.full_name} (${x.mrn})` })); }
export function FormModal({ title, fields, initial = {}, onClose, onSaved, submit, label = 'Save', extra }: { title: string; fields: F[]; initial?: R; onClose: () => void; onSaved: () => void; submit: (v: R) => Promise<any>; label?: string; extra?: (v: R, set: (k: string, x: any) => void, err: R) => ReactNode }) {
  const [v, setV] = useState<R>(initial), [err, setErr] = useState(''), [data, setData] = useState<R>({}), [busy, setBusy] = useState(false), toast = useToast(), set = (k: string, x: any) => setV(p => ({ ...p, [k]: x }));
  async function go() { setErr(''); const miss = fields.filter(f => f.req && !v[f.k]); if (miss.length) return setErr('Complete the required fields: ' + miss.map(f => f.label).join(', ') + '.');
    setBusy(true); try { await submit(v); toast('Saved.'); onSaved(); onClose(); } catch (e) { setErr((e as ApiError).message); setData((e as ApiError).data || {}); } finally { setBusy(false); } }
  return <Modal title={title} onClose={onClose} foot={<><button className="btn o" onClick={onClose}>Cancel</button><button className="btn" onClick={go} disabled={busy}>{busy ? 'Saving…' : label}</button></>}>
    <div style={{ padding: '12px 16px 0' }}><Err e={err} /></div><Fields fields={fields} v={v} set={set} />{extra?.(v, set, data)}</Modal>;
}
export const useLoad = <T,>(path: string, deps: any[] = []) => { const [d, setD] = useState<T | null>(null), [err, setErr] = useState(''), [n, setN] = useState(0);
  useEffect(() => { api(path).then(setD).catch(e => setErr(e.message)); }, [path, n, ...deps]); return { d, err, reload: () => setN(x => x + 1) }; };
