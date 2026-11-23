import express from 'express';
import { pool } from './db.ts';
import { upcoming } from './calendar.ts';
import { unreadLetters } from './letters.ts';
import { STARS_SQL, syncMissions } from './missions.ts';
import { listPodcasts } from './podcast.ts';
import { tReq } from './i18n.ts';

export const homeRouter = express.Router();

homeRouter.get('/home', async (req: any, res: any) => {
  try {
    const fid = req.member.family_id;
    // Nhiệm vụ tự đánh dấu xong rồi mới đếm sao, để số sao ở trang chủ khớp màn lọ (server/missions.ts). Các phần khác chạy song song.
    const synced = syncMissions(fid).catch((e) => console.error(e));
    const [ev, latest, total, week, pods, letters] = await Promise.all([
      upcoming(pool, fid, 30),
      pool.query(
        `select id, media, kind, author_id, created_at from posts
         where family_id = $1 and kind in ('photo','video') and media is not null order by created_at desc limit 6`, [fid]),
      synced.then(() => pool.query(STARS_SQL, [fid])),
      pool.query(
        `select kind, count(*)::int n from posts where family_id = $1 and created_at > now() - interval '7 days' group by kind`, [fid]),
      listPodcasts(fid, req.member.id, 12),
      unreadLetters(req.member.id),
    ]);
    const counts: Record<string, number> = { photo: 0, video: 0, voice: 0, hug: 0 };
    for (const r of week.rows) counts[r.kind] = r.n;
    res.json({
      upcoming: ev.slice(0, 4),
      letters,
      latest: latest.rows.map((r: any) => ({ id: r.id, media: r.media, kind: r.kind, authorId: r.author_id, createdAt: r.created_at })),
      jar: { total: total.rows[0].n },
      week: counts,
      podcasts: pods.filter((p) => p.status === 'ready').slice(0, 8)
        .map((p) => ({ id: p.id, title: p.title, topic: p.kind === 'topic' ? tReq('podcastGen.familyTells') : p.topic, memberId: p.memberId, duration: p.duration, cover: p.cover, createdAt: p.createdAt })),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || tReq('error.server') });
  }
});
