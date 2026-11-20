// Hàng chờ tín hiệu và lời nhắc của Mây (20/11/2026): Mây thấy ai đó nhớ ai đó thì xếp một tín hiệu, tới hạn mới gửi lời nhắc.
// Task này chỉ có bảng; phần xếp và gửi thêm ở các task sau. Chi tiết: docs/may-moi.md.
import { pool } from './db.ts';

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// Mỗi câu một dòng: server/members.test.ts đọc các câu create table, add column để dựng lược đồ.
export async function migrateMay(db: Db = pool) {
  await db.query(`
    create table if not exists may_signals (
      id text primary key, family_id text not null references families(id),
      from_id text not null references members(id), to_id text not null references members(id),
      kind text not null, evidence text not null default '', call_id text references calls(id) on delete cascade, ref text,
      due_at timestamptz not null default now(), expires_at timestamptz not null,
      created_at timestamptz not null default now(), sent_at timestamptz, dropped text
    );
    create unique index if not exists may_signals_once on may_signals (call_id, to_id, kind);
    create index if not exists may_signals_pending on may_signals (to_id) where sent_at is null and dropped is null;
    create table if not exists may_nudges (
      id text primary key, family_id text not null references families(id), signal_id text,
      from_id text not null references members(id), to_id text not null references members(id),
      kind text not null, sent_at timestamptz not null default now(), opened_at timestamptz, contact_at timestamptz
    );
    create index if not exists may_nudges_to on may_nudges (to_id, sent_at desc);
    alter table members add column if not exists may_nudge boolean not null default true;
  `);
}
