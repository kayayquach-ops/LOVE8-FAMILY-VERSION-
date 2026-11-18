import { getLang, hasKey, onLangChange, t } from './i18n';
import type { Me, Post, Shot, ShotOccasion, Week } from './shared';

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
  if (!res.ok) throw Object.assign(new Error(errorText(data)), { status: res.status, code: data.code, data });
  return data as T;
}

/** Máy chủ nói thẳng là mã của máy này không còn dùng được (khác với mất mạng hay máy chủ đang khởi động lại). */
export const isSignedOut = (e: unknown) => (e as { status?: number })?.status === 401;

/** Tên nhà đang xin vào và tên gọi người duyệt: chỉ biết chừng này khi chưa được cho vào. */
export type JoinWaitInfo = { familyName: string; approverName: string };
/** Mã của máy là một lời xin vào nhà còn chờ duyệt (máy chủ trả 403 join_pending): giữ mã, hiện màn chờ, không coi là mã hỏng. */
export function joinPending(e: unknown): JoinWaitInfo | null {
  const x = e as { status?: number; code?: string; data?: Partial<JoinWaitInfo> };
  return x?.status === 403 && x.code === 'join_pending' ? { familyName: x.data?.familyName ?? '', approverName: x.data?.approverName ?? '' } : null;
}
// Máy đang chờ vào nhà nào: còn nhớ thì lúc lời xin mất (không được cho vào, hết hạn) vẫn báo được một câu trước khi về màn đầu.
const WKEY = 'sh-join-wait';
export const joinWait = {
  get: (): JoinWaitInfo | null => { try { return JSON.parse(localStorage.getItem(WKEY) ?? 'null'); } catch { return null; } },
  set: (w: JoinWaitInfo) => { try { localStorage.setItem(WKEY, JSON.stringify(w)); } catch {} },
  clear: () => { try { localStorage.removeItem(WKEY); } catch {} },
};

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

// Đăng nhập Google đang dở: state và bind (bí mật của máy, không lên URL) giữ trong máy suốt lúc sang trang Google rồi quay về,
// và suốt phần làm quen nếu tài khoản chưa có nhà. join: mã nhà trong link mời, để quay về vẫn vào đúng nhà.
export type GooglePending = { state: string; bind: string; intent: 'signin' | 'link'; at: number; join?: string };
const GKEY = 'sh-google';
export const googlePending = {
  get: (): GooglePending | null => {
    try {
      const p: GooglePending | null = JSON.parse(localStorage.getItem(GKEY) ?? 'null');
      return p && Date.now() - p.at < 2 * 3600e3 ? p : null;
    } catch { return null; }
  },
  set: (p: GooglePending) => { try { localStorage.setItem(GKEY, JSON.stringify(p)); } catch {} },
  clear: () => { try { localStorage.removeItem(GKEY); } catch {} },
};
export type GoogleResult =
  | { status: 'pending' | 'cancel' }
  | { status: 'signin'; token: string }
  | { status: 'new'; name: string | null; email: string | null }
  | { status: 'linked'; email: string | null };

/** Vừa từ Google quay về (/?google=1): đọc một lần lúc mở app rồi bỏ khỏi thanh địa chỉ (trên đó không có gì bí mật). */
export const fromGoogle = (() => {
  if (typeof location === 'undefined') return false;
  const u = new URL(location.href);
  if (!u.searchParams.has('google')) return false;
  u.searchParams.delete('google');
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  return true;
})();

/** Sang trang Google (cả trang, không popup: app trên Màn hình chính iPhone không giữ được popup). */
export async function startGoogle(intent: 'signin' | 'link', join?: string) {
  const r = await call<{ url: string; state: string; bind: string }>('/api/google/start', json({ intent }));
  googlePending.set({ state: r.state, bind: r.bind, intent, at: Date.now(), ...(join ? { join } : {}) });
  location.assign(r.url);
}

type Joining = { name: string; role: string; city: string; lang?: string; intro?: Record<string, string | boolean>; google?: { state: string; bind: string } };

export const api = {
  create: (b: Joining & { family: string }) => call<{ token: string; google?: boolean }>('/api/families', json(b)),
  /** Vào nhà có sẵn: chỉ gửi lời xin, máy giữ mã của lời xin và chờ người lập nhà cho vào. */
  join: (b: Joining & { code: string }) => call<{ token: string; google?: boolean; pending: true } & JoinWaitInfo>('/api/join', json(b)),
  joinStatus: () => call<{ status: 'in' } | ({ status: 'pending' } & JoinWaitInfo)>('/api/join/status'),
  joinCancel: () => call<{ ok: boolean }>('/api/join', { method: 'DELETE' }),
  /** Người duyệt cho vào (yes) hoặc không. */
  joinDecide: (id: string, yes: boolean) => call<{ ok: boolean }>(`/api/join/requests/${encodeURIComponent(id)}/${yes ? 'approve' : 'deny'}`, { method: 'POST' }),
  google: () => call<{ enabled: boolean }>('/api/google'),
  googleFinish: (p: GooglePending) => call<GoogleResult>('/api/google/finish', json({ state: p.state, bind: p.bind })),
  googleMe: () => call<{ enabled: boolean; linked: boolean; email: string | null }>('/api/google/me'),
  googleUnlink: () => call('/api/google/link', { method: 'DELETE' }),
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
  mascot: (b: { name?: string; shape?: string }) => call('/api/family/mascot', { method: 'PUT', body: JSON.stringify(b) }),
  /** Xoá một người khác khỏi nhà cùng mọi dữ liệu của họ (không xoá được chính mình). */
  removeMember: (id: string) => call<{ ok: boolean }>(`/api/members/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // Chụp chung dù ở xa (docs/chup-chung.md). Gửi ảnh qua upload để có tiến độ như lúc gửi ảnh thường.
  /** f: file (selfie), occasion, custom (khi tu-viet), with (id những người chụp cùng, cách nhau bằng dấu phẩy). */
  shotCreate: (f: FormData, onProgress?: (p: number) => void) => upload<{ shot: Shot }>('/api/shots', f, onProgress),
  shotsOpen: () => call<{ shots: Shot[] }>('/api/shots/open'),
  shot: (id: string) => call<{ shot: Shot }>(`/api/shots/${encodeURIComponent(id)}`),
  shotPhoto: (id: string, f: FormData, onProgress?: (p: number) => void) => upload<{ shot: Shot }>(`/api/shots/${encodeURIComponent(id)}/photo`, f, onProgress),
  shotDevelop: (id: string) => call<{ shot: Shot }>(`/api/shots/${encodeURIComponent(id)}/develop`, { method: 'POST' }),
  shotNudge: (id: string) => call<{ ok: boolean }>(`/api/shots/${encodeURIComponent(id)}/nudge`, { method: 'POST' }),
  shotRedo: (id: string, b: { occasion?: ShotOccasion; custom?: string } = {}) => call<{ shot: Shot }>(`/api/shots/${encodeURIComponent(id)}/redo`, json(b)),
  shotPost: (id: string) => call<{ ok: boolean; postId: string }>(`/api/shots/${encodeURIComponent(id)}/post`, { method: 'POST' }),
};

// Mọi yêu cầu tới /api/ mang theo ngôn ngữ đang chọn (header x-lang), để lời báo lỗi và chữ máy chủ soạn đúng thứ tiếng
// kể cả ở các màn tự gọi fetch riêng. Máy chủ ưu tiên x-lang, rồi tới ngôn ngữ đã lưu của người dùng (members.lang).
// Mất mạng thì trình duyệt ném "Load failed", "Failed to fetch": đổi thành câu dễ hiểu theo ngôn ngữ đang chọn cho mọi màn.
if (typeof window !== 'undefined' && !(window as { __langFetch?: boolean }).__langFetch) {
  (window as { __langFetch?: boolean }).__langFetch = true;
  const native = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (!url.startsWith('/api/')) return native(input, init);
    const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!h.has('x-lang')) h.set('x-lang', getLang());
    return native(input, { ...init, headers: h }).catch((e: Error) => {
      if (e?.name === 'AbortError') throw e;
      const send = (init?.method ?? 'GET').toUpperCase() !== 'GET';
      throw Object.assign(new Error(t(send ? 'common.offlineSend' : 'common.offline')), { offline: true });
    });
  };
}

// Đổi ngôn ngữ thì báo máy chủ, để thông báo đẩy và lời AI sau này nói đúng thứ tiếng.
onLangChange((l) => { if (token.get()) void api.lang(l).catch(() => {}); });
