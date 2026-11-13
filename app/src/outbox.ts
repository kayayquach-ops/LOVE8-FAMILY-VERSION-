import { token } from './api';

// Hàng chờ gửi của cuộc gọi AI: câu trả lời ghi âm, ảnh, lệnh kết thúc. Mỗi việc nằm trong IndexedDB tới khi máy chủ nhận:
// mạng chập thì thử lại giãn dần (2, 4, 8... tối đa 60 giây), tắt app giữa chừng thì lần mở app sau gửi tiếp.
// Việc có `last` (lệnh kết thúc) chỉ đi khi mọi việc trước nó của cùng nhóm (cùng cuộc gọi) đã xong.
// Máy không có IndexedDB (chế độ riêng tư) thì vẫn giữ và thử lại trong bộ nhớ khi app còn mở.

type Job = { id: string; group: string; url: string; last?: boolean; fields?: Record<string, string>; blob?: Blob; file?: string; at: number };
type Stored = Omit<Job, 'blob'> & { buf?: ArrayBuffer; type?: string };
type Live = { job: Job; tries: number; next: number; busy: boolean; done: Array<(r: unknown) => void> };

const DB = 'sh-outbox', STORE = 'jobs';
const KEEP = 3 * 86400e3; // quá 3 ngày vẫn chưa gửi được thì bỏ
const jobs = new Map<string, Live>();
let lastAt = 0;
let timer = 0;
let dbp: Promise<IDBDatabase | null> | null = null;
// Ghi và xoá trong IndexedDB chạy nối đuôi nhau: việc gửi xong trước khi kịp ghi thì lệnh xoá vẫn đến sau lệnh ghi.
let ops: Promise<unknown> = Promise.resolve();

function db() {
  dbp ??= new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = r.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function store<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | null> {
  const p = ops.then(async () => {
    const d = await db();
    if (!d) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? (req.result as T) : null);
        t.onerror = t.onabort = () => resolve(null);
      } catch { resolve(null); }
    });
  });
  ops = p.catch(() => null);
  return p;
}

// Safari cũ không cất được Blob vào IndexedDB: cất dạng ArrayBuffer kèm kiểu.
async function save(j: Job) {
  const { blob, ...rest } = j;
  const row: Stored = blob ? { ...rest, buf: await blob.arrayBuffer().catch(() => undefined), type: blob.type } : rest;
  await store('readwrite', (s) => s.put(row));
}

function post(j: Job) {
  const tk = token.get();
  let body: FormData | undefined;
  if (j.fields || j.blob) {
    body = new FormData();
    for (const [k, v] of Object.entries(j.fields ?? {})) body.set(k, v);
    if (j.blob) body.set('file', j.blob, j.file ?? 'file');
  }
  // Máy chủ chép lời có thể mất vài giây, mạng chậm thì tải lâu: quá 90 giây coi như rớt, thử lại sau.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90_000);
  return fetch(j.url, { method: 'POST', body, headers: tk ? { authorization: `Bearer ${tk}` } : {}, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function run(l: Live) {
  l.busy = true;
  const res = await post(l.job).catch(() => null);
  // Máy chủ nhận, hoặc từ chối hẳn (không còn cuộc gọi, mã máy hết hạn): thôi gửi. Mất mạng, 5xx, 429 thì thử lại.
  const final = !!res && (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429));
  if (final) {
    const data = res.ok ? await res.json().catch(() => ({})) : null;
    jobs.delete(l.job.id);
    void store('readwrite', (s) => s.delete(l.job.id));
    l.done.forEach((f) => f(data));
  } else {
    l.busy = false;
    l.tries++;
    l.next = Date.now() + Math.min(60_000, 2000 * 2 ** (l.tries - 1));
  }
  pump();
}

function pump() {
  clearTimeout(timer);
  const now = Date.now();
  const list = [...jobs.values()].sort((a, b) => a.job.at - b.job.at);
  let soonest = Infinity;
  for (const l of list) {
    if (l.busy) continue;
    if (l.job.last && list.some((o) => o.job.group === l.job.group && o.job.at < l.job.at)) continue;
    if (l.next > now) { soonest = Math.min(soonest, l.next); continue; }
    void run(l);
  }
  if (soonest < Infinity) timer = window.setTimeout(pump, soonest - now);
}

/** Thêm một việc gửi. Trả về thân trả lời của máy chủ khi gửi được, null nếu máy chủ từ chối hẳn. Mất mạng thì promise chờ tới khi gửi được. */
export function send(job: Omit<Job, 'id' | 'at'>): Promise<any> {
  lastAt = Math.max(Date.now(), lastAt + 1);
  const j: Job = { ...job, id: `${lastAt}-${Math.random().toString(36).slice(2, 8)}`, at: lastAt };
  return new Promise((resolve) => {
    jobs.set(j.id, { job: j, tries: 0, next: 0, busy: false, done: [resolve] });
    void save(j);
    pump();
  });
}

/** Mở app: gửi tiếp những việc lần trước chưa gửi xong. */
export async function resumeOutbox() {
  const rows = (await store<Stored[]>('readonly', (s) => s.getAll())) ?? [];
  for (const r of rows) {
    if (jobs.has(r.id)) continue;
    if (Date.now() - r.at > KEEP) { void store('readwrite', (s) => s.delete(r.id)); continue; }
    const { buf, type, ...rest } = r;
    lastAt = Math.max(lastAt, r.at);
    jobs.set(r.id, { job: { ...rest, ...(buf ? { blob: new Blob([buf], { type }) } : {}) }, tries: 0, next: 0, busy: false, done: [] });
  }
  pump();
}

// Có mạng lại hoặc quay lại app: thử ngay, không chờ hết khoảng giãn.
const now = () => { for (const l of jobs.values()) l.next = 0; pump(); };
if (typeof window !== 'undefined') {
  window.addEventListener('online', now);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && jobs.size) now(); });
}
