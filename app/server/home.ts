import express from 'express';
import { pool } from './db.ts';
import { upcoming } from './calendar.ts';
import { JAR_CAPACITY } from './jar.ts';
import { listPodcasts } from './podcast.ts';

export const homeRouter = express.Router();

homeRouter.get('/home', async (req: any, res: any) => {
  try {
    const fid = req.member.family_id;
    const [ev, latest, total, week, pods] = await Promise.all([
      upcoming(pool, fid, 30),
      pool.query(
        `select id, media, kind, author_id, created_at from posts
         where family_id = $1 and kind in ('photo','video') and media is not null order by created_at desc limit 6`, [fid]),
      pool.query(
        `select (
           (select count(*) from posts where family_id = $1)
           + (select count(*) from replies r join posts p on p.id = r.post_id where p.family_id = $1)
           + (select count(*) from missions_done where family_id = $1)
         )::int n`, [fid]),
      pool.query(
        `select kind, count(*)::int n from posts where family_id = $1 and created_at > now() - interval '7 days' group by kind`, [fid]),
      listPodcasts(fid, 12),
    ]);
    const counts: Record<string, number> = { photo: 0, video: 0, voice: 0, hug: 0 };
    for (const r of week.rows) counts[r.kind] = r.n;
    res.json({
      upcoming: ev.slice(0, 4),
      latest: latest.rows.map((r: any) => ({ id: r.id, media: r.media, kind: r.kind, authorId: r.author_id, createdAt: r.created_at })),
      jar: { level: total.rows[0].n % JAR_CAPACITY, capacity: JAR_CAPACITY },
      week: counts,
      podcasts: pods.filter((p) => p.status === 'ready').slice(0, 8)
        .map((p) => ({ id: p.id, title: p.title, topic: p.kind === 'topic' ? 'Cả nhà kể' : p.topic, memberId: p.memberId, duration: p.duration, cover: p.cover, createdAt: p.createdAt })),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi máy chủ' });
  }
});
