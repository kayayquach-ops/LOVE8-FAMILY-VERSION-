import { getLang, hasKey, onLangChange, t } from './i18n';
import type { Me, Post, Week } from './shared';

// Mã riêng của máy này, có được khi tạo nhà hoặc vào nhà. Không có mật khẩu.
const KEY = 'homeletter-token';
export const token = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(KEY, t); } catch {} },
  clear: () => {
    try {
      localStorage.removeItem(KEY); localStorage.removeItem('homeletter-me');
      // Bản lưu tin nhà, chat... của nhà cũ (cache.ts).
      for (const k of Object.keys(localStorage)) if (k.startsWith('hl-c:')) localStorage.removeItem(k);
    } catch {}
  },
};

/** Lời báo lỗi: máy chủ gửi mã ổn định (code) thì tra bảng chữ; chưa có khoá thì dùng câu máy chủ gửi kèm. */
export function errorText(data: { error?: string; code?: string }) {
  const k = data.code ? `error.${data.code}` : '';
  return hasKey(k) ? t(k) : data.error || t('common.error');
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(tk ? { authorization: `Bearer ${tk}` } : {}), 'x-lang': getLang(), ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(errorText(data)), { status: res.status });
  return data as T;
}

/** Máy chủ nói thẳng là mã của máy này không còn dùng được (khác với mất mạng hay máy chủ đang khởi động lại). */
export const isSignedOut = (e: unknown) => (e as { status?: number })?.status === 401;

/** Gửi ảnh, video kèm tiến độ (fetch chưa báo được tiến độ tải lên). */
export function upload<T>(path: string, form: FormData, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', path);
    const tk = token.get();
    if (tk) x.setRequestHeader('authorization', `Bearer ${tk}`);
    x.setRequestHeader('x-lang', getLang());
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => {
      let data: { error?: string; code?: string } = {};
      try { data = JSON.parse(x.responseText); } catch {}
      if (x.status >= 200 && x.status < 300) resolve(data as T);
      else reject(Object.assign(new Error(errorText(data)), { status: x.status }));
    };
    x.onerror = () => reject(new Error(t('common.offlineSend')));
    x.send(form);
  });
}

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  create: (b: { family: string; name: string; role: string; city: string; lang?: string; intro?: Record<string, string | boolean> }) => call<{ token: string }>('/api/families', json(b)),
  join: (b: { code: string; name: string; role: string; city: string; lang?: string; intro?: Record<string, string | boolean> }) => call<{ token: string }>('/api/join', json(b)),
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
  lang: (lang: string) => call('/api/me/lang', { method: 'PUT', body: JSON.stringify({ lang }) }),
};

// Mọi yêu cầu tới /api/ mang theo ngôn ngữ đang chọn (header x-lang), để lời báo lỗi và chữ máy chủ soạn đúng thứ tiếng
// kể cả ở các màn tự gọi fetch riêng. Máy chủ ưu tiên x-lang, rồi tới ngôn ngữ đã lưu của người dùng (members.lang).
if (typeof window !== 'undefined' && !(window as { __langFetch?: boolean }).__langFetch) {
  (window as { __langFetch?: boolean }).__langFetch = true;
  const native = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (!url.startsWith('/api/')) return native(input, init);
    const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!h.has('x-lang')) h.set('x-lang', getLang());
    return native(input, { ...init, headers: h });
  };
}

// Đổi ngôn ngữ thì báo máy chủ, để thông báo đẩy và lời AI sau này nói đúng thứ tiếng.
onLangChange((l) => { if (token.get()) void api.lang(l).catch(() => {}); });
