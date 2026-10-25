// Video tổng kết tuần: ảnh và clip ngắn của cả nhà ghép thành một đoạn phim dọc 1080x1920, nhạc nền tự tổng hợp.
// Dựng bằng ffmpeg chạy nền, mỗi lần một video để máy chủ không bị nặng.
import express from 'express';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { pool as db } from './db.ts';
import { errorBody, langOf, reqLang, runWithLang, tReq, type Lang } from './i18n.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const here = path.dirname(fileURLToPath(import.meta.url));
const FONT = [
  path.join(here, '../public/fonts/BeVietnamPro-Light.ttf'),
  path.join(here, '../dist/fonts/BeVietnamPro-Light.ttf'),
].find((f) => existsSync(f));

const W = 1080, H = 1920, FPS = 30, X = 0.45; // X: thời gian chồng mờ giữa hai cảnh
const CARD = 960, CX = 60, CY = 340, R = 56;
const MAX_ITEMS = 30, MIN_POSTS = 3;

export type RecapItem = { kind: 'photo' | 'video'; file: string; author: string; at: Date; caption?: string | null };
export type RecapInput = { family: string; week: string; items: RecapItem[]; counts: { photos: number; videos: number; hugs: number } };

// Tuần tính từ thứ Hai, theo giờ Việt Nam (giống server/index.ts).
export function weekKey(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const day = (t.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

function weekLabel(week: string) {
  const a = new Date(`${week}T00:00:00Z`), b = new Date(a.getTime() + 6 * 86400e3);
  const am = a.getUTCMonth() + 1, bm = b.getUTCMonth() + 1;
  return am === bm ? tReq('recapVideo.weekSame', { a: a.getUTCDate(), b: b.getUTCDate(), bm }) : tReq('recapVideo.weekCross', { a: a.getUTCDate(), am, b: b.getUTCDate(), bm });
}

function dayLabel(at: Date) {
  const t = new Date(at.getTime() + 7 * 3600e3);
  const dm = reqLang() === 'en' ? `${t.getUTCMonth() + 1}/${t.getUTCDate()}` : `${t.getUTCDate()}/${t.getUTCMonth() + 1}`;
  return `${tReq(`recapVideo.day.${t.getUTCDay()}`)}, ${dm}`;
}
const dayKey = (at: Date) => new Date(at.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

/** Cắt chú thích thành tối đa 2 dòng ngắn (drawtext không tự xuống dòng). */
function wrap(text: string, max = 30) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
    else { if (cur) lines.push(cur); cur = w.slice(0, max); }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].slice(0, max - 3) + '...'; }
  return lines;
}

// ---------- Chạy ffmpeg ----------

export function run(bin: string, args: string[], cwd: string, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-6000); });
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} thoát với mã ${code}\n${err}`));
    });
  });
}

export async function probe(file: string, cwd: string) {
  try {
    const out = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], cwd, 30_000);
    const j = JSON.parse(out);
    const dur = Number(j.format?.duration);
    return { duration: Number.isFinite(dur) ? dur : null, audio: (j.streams ?? []).some((s: any) => s.codec_type === 'audio') };
  } catch { return { duration: null, audio: false }; }
}

// ---------- Nền sương và khung ảnh, vẽ thẳng bằng JS ra PPM/PGM ----------

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function sdRound(px: number, py: number, cx: number, cy: number, half: number, r: number) {
  const qx = Math.abs(px - cx) - (half - r), qy = Math.abs(py - cy) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Nền 270x480 (ffmpeg phóng lên 1080x1920, gradient vẫn mịn). shadow: thêm bóng mềm dưới khung ảnh. */
function writeBackground(file: string, shadow: boolean) {
  const w = 270, h = 480, s = W / w;
  const buf = Buffer.alloc(w * h * 3);
  const stops: Array<[number, number[]]> = [[0, [205, 211, 216]], [0.4, [231, 230, 229]], [0.75, [233, 222, 214]], [1, [201, 195, 203]]];
  const blobs = [
    { x: 0.25, y: 0.3, r: 0.6, c: [255, 255, 255], a: 0.85 },
    { x: 0.0, y: 0.95, r: 0.55, c: [236, 196, 172], a: 0.7 },
    { x: 1.0, y: 0.9, r: 0.55, c: [150, 146, 170], a: 0.5 },
    { x: 0.95, y: 0.02, r: 0.5, c: [176, 190, 200], a: 0.6 },
  ];
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    let i = 0;
    while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
    const [v0, c0] = stops[i], [v1, c1] = stops[i + 1];
    const k = smooth(v0, v1, v);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      let c = c0.map((a, j) => a + (c1[j] - a) * k);
      for (const b of blobs) {
        const d = Math.hypot(u - b.x, (v - b.y) * (h / w));
        const a = b.a * Math.exp(-((d / b.r) ** 2) * 2.2);
        c = c.map((ch, j) => ch * (1 - a) + b.c[j] * a);
      }
      if (shadow) {
        const d = sdRound(x * s, y * s, W / 2, CY + CARD / 2 + 30, CARD / 2 - 12, R + 10);
        const a = 0.2 * (1 - smooth(-40, 90, d));
        c = c.map((ch, j) => ch * (1 - a) + [70, 58, 52][j] * a);
      }
      const o = (y * w + x) * 3;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
    }
  }
  writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), buf]));
}

/** Mặt nạ bo góc cho khung ảnh, có khử răng cưa. */
function writeMask(file: string) {
  const buf = Buffer.alloc(CARD * CARD);
  for (let y = 0; y < CARD; y++) for (let x = 0; x < CARD; x++) {
    const d = sdRound(x + 0.5, y + 0.5, CARD / 2, CARD / 2, CARD / 2, R);
    buf[y * CARD + x] = Math.round(Math.min(1, Math.max(0, 0.5 - d)) * 255);
  }
  writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${CARD} ${CARD}\n255\n`), buf]));
}

// ---------- Nhạc nền: pad hợp âm êm và tiếng hộp nhạc, tổng hợp bằng aevalsrc ----------

// Fmaj7 - Em7 - Dm7 - Cadd9, mỗi hợp âm 4 giây.
const CHORDS = [[174.61, 220, 261.63, 329.63], [164.81, 196, 246.94, 293.66], [146.83, 174.61, 220, 261.63], [130.81, 196, 261.63, 293.66]];
const pick = (idx: string, vals: number[]) => vals.map((v, i) => `eq(${idx},${i})*${v.toFixed(3)}`).join('+');

export function musicExpr(detune: number) {
  // Hai lớp pad lệch nhau 2 giây, mỗi lớp phồng lên rồi tắt hẳn ở biên cửa sổ: đổi hợp âm không bị lách cách, tổng âm lượng đều.
  const pad = (shift: number) => {
    const w = `floor((t+${shift})/4)`, tau = `(t+${shift}-4*${w})`, c = `mod(${w},4)`;
    const notes = [0, 1, 2, 3].map((n) => `sin(2*PI*(${pick(c, CHORDS.map((ch) => ch[n] * detune))})*${tau})`).join('+');
    return `pow(sin(PI*${tau}/4),2)*(${notes})`;
  };
  // Hộp nhạc: mỗi nửa giây một nốt (cao hơn một quãng tám), nghỉ ở nhịp cuối.
  const s = 'floor(t*2)', tau = `(t-floor(t*2)/2)`, step = `mod(${s},8)`, c = 'mod(floor(t/4),4)';
  const PATTERN = [0, 2, 1, 3, 2, 1, 3, 0];
  const n = PATTERN.map((p, i) => `eq(${step},${i})*${p}`).join('+');
  const f = `2*(${[0, 1, 2, 3].map((k) => `eq(${n},${k})*(${pick(c, CHORDS.map((ch) => ch[k]))})`).join('+')})`;
  const env = `(1-exp(-120*${tau}))*exp(-6*${tau})*(1-2*${tau})*(1-eq(${step},7))`;
  const bell = `${env}*(sin(2*PI*${f}*${tau})+0.25*sin(4*PI*${f}*${tau}))`;
  return `0.045*(${pad(0)}+${pad(2)})+0.08*${bell}`;
}

// ---------- Dựng video ----------

type Seg = { file: string; dur: number; voice?: { src: string; dur: number } };

export async function buildRecapVideo(input: RecapInput, outFile: string) {
  if (!FONT) throw new Error('Thiếu font BeVietnamPro-Light.ttf');
  const work = mkdtempSync(path.join(os.tmpdir(), 'recap-'));
  try {
    copyFileSync(FONT, path.join(work, 'font.ttf'));
    writeBackground(path.join(work, 'bg.ppm'), false);
    writeBackground(path.join(work, 'bgcard.ppm'), true);
    writeMask(path.join(work, 'mask.pgm'));

    // Chữ ghi ra file rồi đọc bằng textfile: không phải thoát ký tự, không lo dấu % hay ':'.
    let ti = 0;
    const txt = (s: string) => { const n = `t${ti++}.txt`; writeFileSync(path.join(work, n), s.replace(/[\r\n]+/g, ' ')); return n; };
    const draw = (s: string, size: number, color: string, y: number, delay = -1) => {
      const e = `min(1,max(0,(t-${delay})/0.7))`;
      const anim = delay >= 0 ? `:y='${y}+18*pow(1-${e},2)':alpha='${e}'` : `:y=${y}`;
      return `drawtext=fontfile=font.ttf:textfile=${txt(s)}:expansion=none:fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2${anim}`;
    };
    const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-threads', '2', '-an'];
    const base = ['-y', '-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1'];
    const week = weekLabel(input.week);
    const segs: Seg[] = [];

    // Thẻ chữ: nền sương trôi lên rất chậm, chữ hiện dần.
    const titleCard = async (name: string, dur: number, lines: string[]) => {
      const frames = Math.round(dur * FPS);
      await run(FFMPEG, [...base, '-loop', '1', '-framerate', String(FPS), '-i', 'bg.ppm', '-filter_complex',
        `[0]scale=${W}:${Math.round(H * 1.06)}:flags=bicubic,crop=${W}:${H}:0:'${Math.round(H * 0.06)}*(1-t/${dur})',format=yuv420p,${lines.join(',')}[v]`,
        '-map', '[v]', '-frames:v', String(frames), ...ENC, name], work);
      segs.push({ file: name, dur: frames / FPS });
    };

    await titleCard('open.mp4', 2.5, [
      draw(week, 92, '0x2B2723', 820, 0.15),
      draw(input.family, 48, '0x5A534B', 950, 0.55),
    ]);

    // Xếp theo ngày, trong ngày gom theo người gửi.
    const items = input.items.slice(0, MAX_ITEMS).sort((a, b) =>
      dayKey(a.at).localeCompare(dayKey(b.at)) || a.author.localeCompare(b.author) || a.at.getTime() - b.at.getTime());
    const nPhotos = items.filter((i) => i.kind === 'photo').length;
    const videoTime = items.filter((i) => i.kind === 'video').length * 3;
    // Tổng khoảng 30 đến 45 giây: chia đều phần còn lại cho ảnh, mỗi tấm 1.6 đến 2.2 giây.
    const photoDur = Math.min(2.2, Math.max(1.6, nPhotos ? (40 - 5.7 - videoTime) / nPhotos : 2));

    let k = 0;
    for (const it of items) {
      const name = `s${k++}.mp4`;
      const src = path.relative(work, it.file);
      const text = [
        draw(week, 34, '0x8A8278', 200),
        draw(it.author, 60, '0x2B2723', CY + CARD + 70, 0.15),
        draw(dayLabel(it.at), 38, '0x8A8278', CY + CARD + 154, 0.3),
        ...wrap(it.caption ?? '').map((l, i) => draw(l, 40, '0x5A534B', CY + CARD + 232 + i * 58, 0.45)),
      ].join(',');
      const tail = `[2]format=gray,scale=${CARD}:${CARD}[m];[c][m]alphamerge[cm];[0]scale=${W}:${H}:flags=bicubic[bg];[bg][cm]overlay=${CX}:${CY},format=yuv420p,${text}[v]`;
      try {
        if (it.kind === 'photo') {
          const frames = Math.round(photoDur * FPS);
          const z = k % 2 ? `1+0.08*on/${frames}` : `1.08-0.08*on/${frames}`; // lần lượt phóng vào và lùi ra
          await run(FFMPEG, [...base, '-loop', '1', '-framerate', String(FPS), '-i', 'bgcard.ppm', '-i', src, '-loop', '1', '-framerate', String(FPS), '-i', 'mask.pgm',
            '-filter_complex',
            `[1]scale=1920:1920:force_original_aspect_ratio=increase:flags=bicubic,crop=1920:1920:(iw-1920)/2:(ih-1920)*0.35,setsar=1,format=yuv420p,` +
            `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${CARD}x${CARD}:fps=${FPS}[c];${tail}`,
            '-map', '[v]', '-frames:v', String(frames), ...ENC, name], work);
          segs.push({ file: name, dur: frames / FPS });
        } else {
          const info = await probe(src, work);
          const dur = Math.round(Math.min(3, Math.max(1.2, info.duration ?? 3)) * FPS) / FPS;
          const frames = Math.round(dur * FPS);
          await run(FFMPEG, [...base, '-loop', '1', '-framerate', String(FPS), '-i', 'bgcard.ppm', '-t', String(dur + 0.5), '-i', src, '-loop', '1', '-framerate', String(FPS), '-i', 'mask.pgm',
            '-filter_complex',
            `[1:v]setpts=PTS-STARTPTS,fps=${FPS},scale=${CARD}:${CARD}:force_original_aspect_ratio=increase,crop=${CARD}:${CARD}:(iw-${CARD})/2:(ih-${CARD})*0.4,setsar=1,format=yuv420p,` +
            `tpad=stop_mode=clone:stop_duration=${dur},trim=duration=${dur},setpts=PTS-STARTPTS[c];${tail}`,
            '-map', '[v]', '-frames:v', String(frames), ...ENC, name], work);
          segs.push({ file: name, dur: frames / FPS, voice: info.audio ? { src, dur } : undefined });
        }
      } catch (e) {
        console.error(`[recap] bỏ qua ${it.file}:`, (e as Error).message);
      }
    }
    if (segs.length < 2) throw new Error('Không dựng được tấm ảnh nào');

    const c = input.counts;
    const lines = [c.photos && tReq('recapVideo.photos', { n: c.photos }), c.videos && tReq('recapVideo.videos', { n: c.videos }), c.hugs && tReq('recapVideo.hugs', { n: c.hugs })].filter(Boolean) as string[];
    const top = 860 - lines.length * 45;
    await titleCard('close.mp4', 3.4, [
      ...lines.map((l, i) => draw(l, 64, '0x2B2723', top + i * 92, 0.15 + i * 0.25)),
      draw(tReq('recapVideo.bye'), 44, '0x9A5A44', top + lines.length * 92 + 70, 0.4 + lines.length * 0.25),
      draw(input.family, 34, '0x8A8278', 1640, 0.6),
    ]);

    // Ghép: các cảnh chồng mờ vào nhau, tiếng clip đặt đúng chỗ, nhạc nền tự hạ khi clip có tiếng.
    const total = segs.reduce((a, s) => a + s.dur, 0) - (segs.length - 1) * X;
    await run(FFMPEG, [...base, '-f', 'lavfi', '-i', `aevalsrc=exprs='${musicExpr(0.998)}|${musicExpr(1.002)}':s=44100:d=${(total + 1).toFixed(2)}`,
      '-af', 'lowpass=f=3200,aecho=0.8:0.6:180|340:0.22|0.12,volume=3', '-c:a', 'pcm_s16le', 'music.wav'], work);

    const inputs: string[] = [];
    const fc: string[] = [];
    segs.forEach((s) => inputs.push('-i', s.file));
    let prev = '0:v', acc = segs[0].dur;
    const starts = [0];
    for (let i = 1; i < segs.length; i++) {
      const offset = acc - X;
      starts.push(offset);
      const out = i === segs.length - 1 ? 'vx' : `x${i}`;
      fc.push(`[${prev}][${i}:v]xfade=transition=fade:duration=${X}:offset=${offset.toFixed(3)}[${out}]`);
      acc = offset + segs[i].dur;
      prev = out;
    }
    fc.push('[vx]format=yuv420p[v]');
    const M = segs.length;
    inputs.push('-i', 'music.wav');
    fc.push(`[${M}:a]atrim=0:${total.toFixed(3)},afade=t=in:d=1.5,afade=t=out:st=${(total - 2.5).toFixed(3)}:d=2.5[mus]`);
    const voices: string[] = [];
    let vi = M + 1;
    segs.forEach((s, i) => {
      if (!s.voice) return;
      inputs.push('-t', String(s.voice.dur + 0.5), '-i', s.voice.src);
      const ms = Math.round((starts[i] + X / 2) * 1000);
      fc.push(`[${vi++}:a]atrim=0:${s.voice.dur},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
        `afade=t=in:d=0.2,afade=t=out:st=${(s.voice.dur - 0.35).toFixed(3)}:d=0.35,volume=0.9,adelay=delays=${ms}:all=1[vo${voices.length}]`);
      voices.push(`[vo${voices.length}]`);
    });
    if (voices.length) {
      fc.push(`${voices.join('')}amix=inputs=${voices.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)},asplit[vc][sc]`);
      fc.push('[mus][sc]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=600[duck]');
      fc.push('[duck][vc]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]');
    } else fc.push('[mus]alimiter=limit=0.95[a]');

    const tmp = path.join(work, 'out.mp4');
    await run(FFMPEG, [...base, ...inputs, '-filter_complex', fc.join(';'), '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-maxrate', '6M', '-bufsize', '12M', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-threads', '2',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', '-t', total.toFixed(3), tmp], work, 600_000);
    mkdirSync(path.dirname(outFile), { recursive: true });
    try { renameSync(tmp, outFile); } catch { copyFileSync(tmp, outFile); }
    return { duration: total, items: segs.length - 2 };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------- Cơ sở dữ liệu, hàng đợi, lịch tự dựng ----------

export async function migrateRecap(p: pg.Pool) {
  await p.query(`
    create table if not exists recaps (
      family_id text not null references families(id), week text not null, status text not null, media text,
      posts_count int not null default 0, created_at timestamptz not null default now(), primary key (family_id, week)
    );
  `);
  // Máy chủ vừa khởi động lại: video đang dựng dở coi như hỏng (vẫn giữ bản cũ nếu có).
  await p.query(`update recaps set status = case when media is not null then 'ready' else 'failed' end where status = 'rendering'`);
}

const weekStart = (week: string) => new Date(`${week}T00:00:00+07:00`);
const mediaFile = (m: string) => path.join(MEDIA_DIR, path.basename(m.split('?')[0]));

async function countPosts(p: pg.Pool, fid: string, week: string) {
  const s = weekStart(week);
  const { rows } = await p.query(
    `select count(*)::int n from posts where family_id = $1 and kind in ('photo','video') and media is not null and created_at >= $2 and created_at < $3`,
    [fid, s, new Date(s.getTime() + 7 * 86400e3)]);
  return rows[0].n as number;
}

async function renderFamilyWeek(p: pg.Pool, fid: string, week: string) {
  const s = weekStart(week), e = new Date(s.getTime() + 7 * 86400e3);
  try {
    const [fam, posts, counts] = await Promise.all([
      p.query('select name from families where id = $1', [fid]),
      p.query(
        `select p.kind, p.media, p.caption, p.created_at, m.name, (select count(*) from reactions r where r.post_id = p.id) n
         from posts p join members m on m.id = p.author_id
         where p.family_id = $1 and p.kind in ('photo','video') and p.media is not null and p.created_at >= $2 and p.created_at < $3
         order by n desc, p.created_at desc limit ${MAX_ITEMS}`, [fid, s, e]),
      p.query('select kind, count(*)::int n from posts where family_id = $1 and created_at >= $2 and created_at < $3 group by kind', [fid, s, e]),
    ]);
    const n = (k: string) => counts.rows.find((r) => r.kind === k)?.n ?? 0;
    const items: RecapItem[] = posts.rows
      .map((r) => ({ kind: r.kind, file: mediaFile(r.media), author: r.name, at: new Date(r.created_at), caption: r.caption }))
      .filter((i) => existsSync(i.file));
    if (!items.length) throw new Error('Không còn file ảnh nào trên ổ đĩa');
    const out = path.join(MEDIA_DIR, 'recaps', `${fid}-${week}.mp4`);
    await buildRecapVideo({ family: fam.rows[0]?.name ?? tReq('family.defaultName'), week, items, counts: { photos: n('photo'), videos: n('video'), hugs: n('hug') } }, out);
    await p.query(`update recaps set status = 'ready', media = $3, posts_count = $4, created_at = now() where family_id = $1 and week = $2`,
      [fid, week, `/media/recaps/${fid}-${week}.mp4?v=${Date.now()}`, items.length]);
    console.log(`[recap] xong ${fid} ${week}`);
  } catch (err) {
    console.error(`[recap] lỗi ${fid} ${week}:`, (err as Error).message);
    await p.query(`update recaps set status = case when media is not null then 'ready' else 'failed' end where family_id = $1 and week = $2`, [fid, week]).catch(() => {});
  }
}

// Mỗi lần dựng một video.
let queue: Promise<void> = Promise.resolve();
const busy = new Set<string>();
async function enqueue(p: pg.Pool, fid: string, week: string, postsCount: number, lang: Lang) {
  const key = `${fid}:${week}`;
  if (busy.has(key)) return;
  busy.add(key);
  await p.query(
    `insert into recaps (family_id, week, status, posts_count) values ($1,$2,'rendering',$3)
     on conflict (family_id, week) do update set status = 'rendering', posts_count = excluded.posts_count`, [fid, week, postsCount]);
  queue = queue.then(() => runWithLang(lang, () => renderFamilyWeek(p, fid, week))).finally(() => { busy.delete(key); });
}

const row = (r: any) => ({ week: r.week, status: r.status, media: r.media, postsCount: r.posts_count, createdAt: r.created_at });

export const recapRouter = express.Router();

recapRouter.get('/recaps', async (req: any, res) => {
  try {
    const { rows } = await db.query('select * from recaps where family_id = $1 order by week desc limit 52', [req.member.family_id]);
    res.json(rows.map(row));
  } catch (e) { console.error(e); res.status(500).json(errorBody('server')); }
});

recapRouter.post('/recaps/render', async (req: any, res) => {
  try {
    const fid = req.member.family_id;
    const week = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.week ?? '')) ? String(req.body.week) : weekKey();
    const n = await countPosts(db, fid, week);
    if (n < MIN_POSTS) {
      return res.json({ skipped: true, code: n ? 'recap_few' : 'recap_none', n, message: n ? tReq('recap.few', { n }) : tReq('recap.none') });
    }
    await enqueue(db, fid, week, n, reqLang());
    const { rows } = await db.query('select * from recaps where family_id = $1 and week = $2', [fid, week]);
    res.json(row(rows[0]));
  } catch (e) { console.error(e); res.status(500).json(errorBody('server')); }
});

/** Mỗi giờ kiểm tra: từ 19 giờ tối Chủ nhật (giờ Việt Nam), nhà nào có từ 3 ảnh/video và chưa có video tuần này thì dựng. */
export function startRecapScheduler(p: pg.Pool) {
  const check = async () => {
    const vn = new Date(Date.now() + 7 * 3600e3);
    if (vn.getUTCDay() !== 0 || vn.getUTCHours() < 19) return;
    const week = weekKey(), s = weekStart(week);
    const { rows } = await p.query(
      `select p.family_id, count(*)::int n from posts p
       where p.kind in ('photo','video') and p.media is not null and p.created_at >= $1
         and not exists (select 1 from recaps r where r.family_id = p.family_id and r.week = $2)
       group by p.family_id having count(*) >= ${MIN_POSTS}`, [s, week]);
    for (const r of rows) {
      // Nhà không có người nhận lời nhắc riêng: dùng ngôn ngữ của người vào nhà đầu tiên.
      const { rows: [m] } = await p.query('select lang from members where family_id = $1 order by created_at limit 1', [r.family_id]);
      await enqueue(p, r.family_id, week, r.n, langOf(m?.lang));
    }
  };
  const tick = () => { check().catch((e) => console.error('[recap] lịch:', e)); };
  setTimeout(tick, 60_000);
  return setInterval(tick, 3600e3);
}
