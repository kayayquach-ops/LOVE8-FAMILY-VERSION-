import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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
    create table if not exists seen (member_id text primary key references members(id), at timestamptz not null default now());
  `);
}
