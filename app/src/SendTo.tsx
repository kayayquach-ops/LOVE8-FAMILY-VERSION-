import { useRef, useState } from 'react';
import { upload } from './api';
import { fileName } from './media';
import type { Me } from './shared';
import { tap } from './sound';
import { Avatar, Doodle, Icon, toast } from './ui';
import { t } from './i18n';

export type Draft = { kind: 'photo' | 'video' | 'voice'; blob: Blob; url: string; seconds?: number };

/** Màn "gửi tới…" kiểu YOPE: ảnh vừa chụp ở giữa, ô viết một dòng nằm trên ảnh, chọn nơi gửi, nút gửi lớn. Tải lên xong gọi onSent. */
export function SendTo({ me, draft, onBack, onSent }: { me: Me; draft: Draft; onBack: () => void; onSent: () => void }) {
  const [caption, setCaption] = useState('');
  const [meal, setMeal] = useState(false);
  // null: chưa gửi; số 0..1: đang tải lên tới đâu.
  const [sending, setSending] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);
  const others = me.members.filter((m) => m.id !== me.me.id);

  async function send() {
    if (sending !== null) return;
    setSending(0);
    try {
      const f = new FormData();
      f.set('kind', draft.kind);
      f.set('file', draft.blob, fileName(draft.blob, draft.kind));
      if (caption.trim()) f.set('caption', caption.trim());
      if (meal) f.set('meal', 'true');
      if (draft.seconds) f.set('seconds', String(draft.seconds));
      await upload('/api/posts', f, (p) => setSending(p));
      onSent();
    } catch (e) {
      // Giữ nguyên ảnh và dòng chữ để bấm gửi lại, không bắt chụp lại.
      toast((e as Error).message);
      setSending(null);
    }
  }

  return (
    <div className="cam-ui cam-send" role="dialog" aria-modal="true" aria-labelledby="send-title">
      <div className="send-top">
        <button className="send-x" onClick={onBack} disabled={sending !== null} aria-label={t('camera.redo')}><Icon name="close" /></button>
        <h2 id="send-title" className="send-title">{t('camera.send.title')}</h2>
        <span />
      </div>

      <div className="send-stage">
        <div className={`send-card ${draft.kind === 'voice' ? 'is-voice' : ''}`}>
          {draft.kind === 'photo' && <img src={draft.url} alt="" />}
          {draft.kind === 'video' && <video src={draft.url} autoPlay loop playsInline muted={muted} />}
          {draft.kind === 'video' && (
            <button className="send-sound" onClick={() => { tap(); setMuted(!muted); }} aria-label={muted ? t('camera.send.soundOn') : t('camera.send.soundOff')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" />
                {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.2 4.2 0 010 6M18 6.5a7.8 7.8 0 010 11" />}
              </svg>
            </button>
          )}
          {draft.kind === 'voice' && <div className="cam-voice"><VoiceDot url={draft.url} seconds={draft.seconds} /></div>}
          {draft.kind !== 'voice' && (
            <input className="send-cap" value={caption} maxLength={60} onChange={(e) => setCaption(e.target.value)} placeholder={t('camera.captionPlaceholder')}
              enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          )}
        </div>
      </div>

      <div className="send-list">
        <div className="send-row">
          <span className="send-faces" aria-hidden>
            {(others.length ? others : [me.me]).slice(0, 3).map((m) => <Avatar key={m.id} m={m} size={34} />)}
          </span>
          <span className="send-txt">
            <b>{t('feed.everyone')}</b>
            <small>{others.length ? others.map((m) => m.name).join(', ') : t('camera.send.alone')}</small>
          </span>
          <span className="send-check on" aria-hidden><Icon name="check" /></span>
        </div>
        {draft.kind !== 'voice' && (
          <button className="send-row" aria-pressed={meal} onClick={() => { tap(); setMeal(!meal); }} disabled={sending !== null}>
            <span className="send-ico" aria-hidden><Doodle name="bowl" size={24} wobble={false} /></span>
            <span className="send-txt">
              <b>{t('camera.meal')}</b>
              <small>{t('camera.send.mealSub')}</small>
            </span>
            <span className={`send-check ${meal ? 'on' : ''}`} aria-hidden>{meal && <Icon name="check" />}</span>
          </button>
        )}
      </div>

      <button className="send-go" onClick={send} disabled={sending !== null}>
        <i style={{ transform: `scaleX(${sending ?? 0})` }} aria-hidden />
        <span>{sending !== null ? t('camera.send.progress', { n: Math.round(sending * 100) }) : t('camera.send.go')}</span>
        {sending === null && <Icon name="send" />}
      </button>
    </div>
  );
}

export function VoiceDot({ url, seconds }: { url: string; seconds?: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  return (
    <>
      <audio ref={audio} src={url} preload="metadata" onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onEnded={() => { setPlaying(false); setPos(0); }} />
      <button className="play" onClick={() => { if (playing) audio.current?.pause(); else void audio.current?.play().catch(() => {}); }} aria-label={playing ? t('common.stop') : t('common.listen')}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="bars">
        {Array.from({ length: 22 }, (_, i) => (
          <i key={i} className={seconds && pos / seconds > i / 22 ? 'on' : ''} style={{ height: 8 + Math.abs(Math.sin(i * 1.7)) * 26 + (i % 3) * 3 }} />
        ))}
      </div>
      <div style={{ fontSize: 14 }}>{seconds ? t('common.seconds', { n: Math.round(seconds) }) : ''}</div>
    </>
  );
}
