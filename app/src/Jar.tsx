import { useEffect, useState } from 'react';
import './jar.css';
import { api, errorText, token } from './api';
import { t, type Key } from './i18n';
import type { Me, Week } from './shared';
import { cached, remember } from './cache';
import { tap } from './sound';
import { Doodle, Icon, toast } from './ui';
import { JarArt, PaperStar } from './JarArt';

type SeedDef = { id: string };
type JarData = {
  total: number; seeds: Array<{ memberId: string; seed: string; count: number }>;
  catalog: SeedDef[]; mine: string;
};

// Mỗi mã là một loại giấy gấp sao (hình vẽ ở JarArt.tsx); máy chủ giữ cùng danh sách (server/jar.ts). Giấy nào cũng dùng được, không bán lẻ.
const CATALOG: SeedDef[] = [
  { id: 'heart_red' }, { id: 'lotus' }, { id: 'sun' }, { id: 'leaf' }, { id: 'pearl' },
  { id: 'sakura' }, { id: 'gold' }, { id: 'crystal' }, { id: 'rainbow' }, { id: 'dew' },
];
const seedName = (s: SeedDef) => t(`jar.seed.${s.id}` as Key);
const given = (name: string) => name.trim().split(/\s+/).pop() ?? name;

async function jfetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tk = token.get();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(tk ? { authorization: `Bearer ${tk}` } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data));
  return data as T;
}

function Shell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet oly jr">
      <div className="jr-head">
        <button className="jr-x" onClick={onClose} aria-label={t('common.close')}><Icon name="down" size={20} /></button>
        <b>{t('jar.title')}</b>
        <span className="jr-x-sp" />
      </div>
      <div className="scroll jr-body">{children}</div>
    </div>
  );
}

// Nhiệm vụ tự đánh dấu khi app thấy mình làm thật (server/missions.ts), không tích tay được.
// Bấm nhiệm vụ chưa làm thì mở chỗ làm được: camera (video, ảnh bữa cơm), trò chuyện (nói thương, hỏi kỷ niệm), cả nhà (gọi điện).
export type JarGo = 'camera' | 'chat' | 'family';
const GO: Record<string, JarGo> = { video: 'camera', meal: 'camera', love: 'chat', memory: 'chat', call: 'family' };

export function Jar({ me, onClose, onGo }: { me: Me; onClose: () => void; onGo: (to: JarGo) => void }) {
  // Mở là hiện ngay bản lần trước, không còn màn "đang tải".
  const [w, setW] = useState<Week | null>(() => cached<Week>('week'));
  const [j, setJ] = useState<JarData | null>(() => cached<JarData>('jar'));
  const load = () => {
    api.week().then((v) => { remember('week', v); setW(v); }).catch((e) => toast(e.message));
    jfetch<JarData>('/api/jar').then((v) => { remember('jar', v); setJ(v); }).catch((e) => toast(e.message));
  };
  useEffect(load, []);

  if (!w || !j) return <Shell onClose={onClose}><div className="muted jr-wait">{t('common.loading')}</div></Shell>;

  async function pick(s: SeedDef) {
    tap();
    // Đổi giấy hiện ngay; máy chủ từ chối thì trả lại giấy cũ.
    const was = j!.mine;
    setJ((x) => x && { ...x, mine: s.id, seeds: x.seeds.map((r) => (r.memberId === me.me.id ? { ...r, seed: s.id } : r)) });
    try { await jfetch('/api/jar/seed', { method: 'PUT', body: JSON.stringify({ seed: s.id }) }); load(); } catch (e) {
      setJ((x) => x && { ...x, mine: was, seeds: x.seeds.map((r) => (r.memberId === me.me.id ? { ...r, seed: was } : r)) });
      toast((e as Error).message);
    }
  }

  return (
    <Shell onClose={onClose}>
      <div className="jr-stage">
        <JarArt rows={j.seeds} family={me.family.id} width={250} tappable />
      </div>
      <div className="jr-count">
        <b>{j.total ?? 0}</b>
        <p>{t('jar.sub')}</p>
      </div>

      <div className="jr-legend">
        {j.seeds.map((s) => {
          const m = me.members.find((x) => x.id === s.memberId);
          return <span key={s.memberId}><PaperStar seed={s.seed} size={22} />{m ? given(m.name) : ''} {s.count}</span>;
        })}
      </div>

      <h2 className="jr-h">{t('jar.missions')}</h2>
      <div className="jr-list">
        {w.missions.map((m) => {
          const who = m.doneBy.flatMap((id) => me.members.filter((x) => x.id === id).map((x) => given(x.name)));
          const row = (
            <>
              <Doodle name={m.done ? 'check' : 'box'} size={26} />
              <span className="jr-task-text">
                <span>{m.text}</span>
                {!!who.length && <small>{t('jar.doneBy', { names: who.join(', ') })}</small>}
              </span>
              <em className="hand">{t('jar.plusOne')}</em>
            </>
          );
          // Mình làm rồi: chỉ là dấu, không bấm được. Chưa làm: bấm để tới chỗ làm.
          return m.done
            ? <div key={m.key} className="jr-task done">{row}</div>
            : <button key={m.key} className="jr-task" onClick={() => { tap(); onGo(GO[m.key] ?? 'camera'); }}>{row}</button>;
        })}
      </div>

      <h2 className="jr-h">{t('jar.mySeeds')}</h2>
      <div className="jr-papers">
        {CATALOG.map((s) => {
          const on = j.mine === s.id;
          return (
            <button key={s.id} className={`jr-paper${on ? ' on' : ''}`} onClick={() => pick(s)}>
              <PaperStar seed={s.id} size={40} />
              <b>{seedName(s)}</b>
              <i className={on ? 'hand' : undefined}>{on ? t('jar.using') : t('jar.use')}</i>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
