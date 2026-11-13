import pg from 'pg';
import { DEFAULT_MASCOT_NAME } from '../src/shared.ts';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// members.lang: ngôn ngữ của từng người (vi, en, ko); null là tiếng Việt như bản cũ.
// members.google_sub: tài khoản Google đã liên kết (mã sub, mỗi tài khoản một người); google_auth: phiên đăng nhập Google đang dở (server/google.ts).
export async function migrate() {
  await pool.query(`
    create table if not exists families (
      id text primary key, name text not null, code text not null unique, created_at timestamptz not null default now()
    );
    create table if not exists members (
      id text primary key, family_id text not null references families(id), name text not null, role text not null,
      token text not null unique, avatar text, city text, phone text,
      last_seen timestamptz not null default now(), created_at timestamptz not null default now()
    );
    create index if not exists members_family on members (family_id);
    create table if not exists posts (
      id text primary key, family_id text not null references families(id), author_id text not null references members(id),
      kind text not null, media text, caption text, meal boolean not null default false, seconds real,
      question_week text, created_at timestamptz not null default now()
    );
    create index if not exists posts_family on posts (family_id, created_at desc);
    create table if not exists reactions (
      post_id text not null references posts(id) on delete cascade, member_id text not null references members(id),
      emoji text not null, primary key (post_id, member_id)
    );
    create table if not exists replies (
      id text primary key, post_id text not null references posts(id) on delete cascade, author_id text not null references members(id),
      kind text not null, media text, text text, seconds real, created_at timestamptz not null default now()
    );
    create table if not exists missions_done (
      family_id text not null references families(id), member_id text not null references members(id),
      mission text not null, week text not null, created_at timestamptz not null default now(),
      primary key (member_id, mission, week)
    );
    alter table members add column if not exists intro text;
    alter table members add column if not exists lang text;
    alter table families add column if not exists mascot_name text;
    alter table families add column if not exists mascot_shape text;
    alter table members add column if not exists google_sub text;
    alter table members add column if not exists google_email text;
    create unique index if not exists members_google_sub on members (google_sub);
    create table if not exists google_auth (
      state text primary key, bind_hash text not null, nonce text not null, intent text not null, member_id text,
      sub text, email text, name text, error text, tries int not null default 0,
      expires_at timestamptz not null, created_at timestamptz not null default now()
    );
    create table if not exists seen (member_id text primary key references members(id), at timestamptz not null default now());
  `);
}

/** Tên linh vật của nhà (chưa đặt thì Mây): dùng trong lời chào cuộc gọi, lời dẫn podcast, prompt AI. */
export async function mascotName(familyId: string): Promise<string> {
  const { rows } = await pool.query('select mascot_name from families where id = $1', [familyId]);
  return rows[0]?.mascot_name || DEFAULT_MASCOT_NAME;
}
