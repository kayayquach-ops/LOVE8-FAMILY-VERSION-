import type { Me, Post, Week } from './shared';

// Mã riêng của máy này, có được khi tạo nhà hoặc vào nhà. Không có mật khẩu.
const KEY = 'homeletter-token';
export const token = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(KEY, t); } catch {} },
  clear: () => { try { localStorage.removeItem(KEY); } catch {} },
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { ...init, headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(t ? { authorization: `Bearer ${t}` } : {}), ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi, thử lại nhé');
  return data as T;
}

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  create: (b: { family: string; name: string; role: string; city: string; intro?: Record<string, string | boolean> }) => call<{ token: string }>('/api/families', json(b)),
  join: (b: { code: string; name: string; role: string; city: string; intro?: Record<string, string | boolean> }) => call<{ token: string }>('/api/join', json(b)),
  familyName: (code: string) => call<{ name: string }>(`/api/family/${code}`),
  me: () => call<Me>('/api/me'),
  updateMe: (f: FormData) => call('/api/me', { method: 'PATCH', body: f }),
  feed: () => call<Post[]>('/api/feed'),
  post: (f: FormData) => call('/api/posts', { method: 'POST', body: f }),
  hug: () => { const f = new FormData(); f.set('kind', 'hug'); return call('/api/posts', { method: 'POST', body: f }); },
  react: (id: string, emoji: string) => call(`/api/posts/${id}/react`, json({ emoji })),
  reply: (id: string, f: FormData) => call(`/api/posts/${id}/replies`, { method: 'POST', body: f }),
  remove: (id: string) => call(`/api/posts/${id}`, { method: 'DELETE' }),
  week: () => call<Week>('/api/week'),
  mission: (key: string) => call(`/api/missions/${key}`, { method: 'POST' }),
};
