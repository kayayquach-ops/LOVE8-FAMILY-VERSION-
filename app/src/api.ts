import type { Me, Post, Week } from './shared';

// Mã riêng của máy này, có được khi tạo nhà hoặc vào nhà. Không có mật khẩu.
const KEY = 'homeletter-token';
export const token = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(KEY, t); } catch {} },
  clear: () => { try { localStorage.removeItem(KEY); localStorage.removeItem('homeletter-me'); } catch {} },
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(path, { ...init, headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(t ? { authorization: `Bearer ${t}` } : {}), ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Có lỗi, thử lại nhé'), { status: res.status });
  return data as T;
}

/** Máy chủ nói thẳng là mã của máy này không còn dùng được (khác với mất mạng hay máy chủ đang khởi động lại). */
export const isSignedOut = (e: unknown) => (e as { status?: number })?.status === 401;

/** Gửi ảnh, video kèm tiến độ (fetch chưa báo được tiến độ tải lên). */
export function upload<T>(path: string, form: FormData, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', path);
    const t = token.get();
    if (t) x.setRequestHeader('authorization', `Bearer ${t}`);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => {
      let data: { error?: string } = {};
      try { data = JSON.parse(x.responseText); } catch {}
      if (x.status >= 200 && x.status < 300) resolve(data as T);
      else reject(Object.assign(new Error(data.error || 'Có lỗi, thử lại nhé'), { status: x.status }));
    };
    x.onerror = () => reject(new Error('Mạng đang chập chờn, gửi lại nhé'));
    x.send(form);
  });
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
  firstVoice: (f: FormData) => call('/api/me/first-voice', { method: 'POST', body: f }),
  remove: (id: string) => call(`/api/posts/${id}`, { method: 'DELETE' }),
  week: () => call<Week>('/api/week'),
  mission: (key: string) => call(`/api/missions/${key}`, { method: 'POST' }),
};
