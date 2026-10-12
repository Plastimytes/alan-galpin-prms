export type R = Record<string, any>;
export class ApiError extends Error { status: number; data: R; constructor(m: string, s: number, d: R) { super(m); this.status = s; this.data = d; } }
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try { res = await fetch('/api' + path, { method: opts.method || 'GET', credentials: 'same-origin', headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
  catch { throw new ApiError('Cannot reach the server. Check your connection. Your changes have not been saved to the server.', 0, {}); }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && data?.error?.startsWith?.('session')) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(data?.error || 'Something went wrong. Please try again.', res.status, typeof data === 'object' ? data : {});
  }
  return data as T;
}
export const fmt = (s?: string) => s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-';
export const fmtD = (s?: string) => s ? new Date(s.length === 10 ? s + 'T00:00' : s).toLocaleDateString([], { dateStyle: 'medium' }) : '-';
