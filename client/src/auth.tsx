import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, R } from './api';
type Ctx = { user: R | null; loading: boolean; setUser: (u: R | null) => void; can: (...p: string[]) => boolean; logout: () => Promise<void>; expired: boolean; settings: R; };
const C = createContext<Ctx>(null as any);
export const useAuth = () => useContext(C);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<R | null>(null), [loading, setLoading] = useState(true), [expired, setExpired] = useState(false), [settings, setSettings] = useState<R>({});
  useEffect(() => { api('/auth/me').then(r => setUser(r.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (user) { api('/settings/public').then(setSettings).catch(() => {}); if (user.theme) document.documentElement.dataset.theme = user.theme; } }, [user?.id]);
  useEffect(() => { const h = () => { setUser(null); setExpired(true); }; window.addEventListener('session-expired', h); return () => window.removeEventListener('session-expired', h); }, []);
  const can = (...p: string[]) => !!user && p.some(x => user.perms.includes(x));
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); setExpired(false); };
  return <C.Provider value={{ user, loading, setUser, can, logout, expired, settings }}>{children}</C.Provider>;
}
