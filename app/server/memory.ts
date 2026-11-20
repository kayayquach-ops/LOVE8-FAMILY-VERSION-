// Sổ nhớ của Mây (20/11/2026): những điều Mây nghe được trong cuộc gọi và nhớ để nhắc lại khi gọi người khác.
// Task này chỉ có bảng; phần ghi và đọc sổ thêm ở các task sau. Chi tiết: docs/may-moi.md.
import { pool } from './db.ts';

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// Mỗi câu một dòng: server/members.test.ts đọc các câu create table, add column để dựng lược đồ.
export async function migrateMemory(db: Db = pool) {
  await db.query(`
    create table if not exists memory_facts (
      id text primary key, family_id text not null references families(id),
      about_id text references members(id), source_id text not null references members(id),
      kind text not null, text text not null, text_en text not null, details jsonb not null default '{}'::jsonb,
      call_id text references calls(id) on delete cascade, answer_id text,
      visibility text not null default 'family', replacement_id text,
      created_at timestamptz not null default now(), used_at timestamptz, used_count int not null default 0
    );
    create index if not exists memory_facts_about on memory_facts (family_id, about_id);
    create index if not exists memory_facts_source on memory_facts (source_id);
  `);
}
