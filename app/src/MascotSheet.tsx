import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { t, type Key } from './i18n';
import type { MascotMode } from './Mascot';
import { MascotAny } from './Mascot3D';
import { mascotThumbs } from './mascotModels';
import { applyMascot } from './mascotStore';
import { cleanMascotName, DEFAULT_MASCOT_NAME, isMascotShape, MASCOT_NAME_MAX, MASCOT_SHAPES, mascotNameOf, type MascotShape, type Me } from './shared';
import { tap } from './sound';
import { Icon, toast } from './ui';
import './may.css';

/** Đổi tên và hình linh vật của nhà. Ai trong nhà cũng đổi được, đổi là cả nhà thấy. */
export function MascotSheet({ me, onClose, onSaved }: { me: Me; onClose: () => void; onSaved: () => void }) {
  const [shape, setShape] = useState<MascotShape>(isMascotShape(me.family.mascotShape) ? me.family.mascotShape : 'cloud');
  const [name, setName] = useState(mascotNameOf(me.family));
  const [thumbs, setThumbs] = useState<Partial<Record<MascotShape, string>>>({});
  const [mode, setMode] = useState<MascotMode>('wave');
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    void mascotThumbs(MASCOT_SHAPES).then(setThumbs);
    timer.current = window.setTimeout(() => setMode('idle'), 1800);
    return () => clearTimeout(timer.current);
  }, []);

  const pick = (s: MascotShape) => {
    tap();
    setShape(s);
    setMode('happy');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMode('idle'), 1400);
  };

  const clean = cleanMascotName(name);
  const save = async () => {
    if (!clean || busy) return;
    tap();
    setBusy(true);
    try {
      await api.mascot({ name: clean, shape });
      applyMascot({ mascotName: clean, mascotShape: shape });
      toast(t('mascot.saved'));
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{t('mascot.title')}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll mascot-edit">
        <div className="mascot-stage"><MascotAny shape={shape} mode={mode} size={200} /></div>
        <div className="mascot-shapes" role="radiogroup" aria-label={t('mascot.title')}>
          {MASCOT_SHAPES.map((s) => (
            <button key={s} role="radio" aria-checked={shape === s} aria-label={t(`mascot.shape.${s}` as Key)} className={`mascot-shape${shape === s ? ' on' : ''}`} onClick={() => pick(s)}>
              {thumbs[s] ? <img src={thumbs[s]} alt="" draggable={false} /> : <i />}
            </button>
          ))}
        </div>
        <label className="mascot-name">
          <span>{t('mascot.name')}</span>
          <input className="field" value={name} maxLength={MASCOT_NAME_MAX} placeholder={DEFAULT_MASCOT_NAME} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} enterKeyHint="done" autoComplete="off" />
        </label>
        <button className="btn mascot-save" disabled={!clean || busy} onClick={() => void save()}>{t('mascot.save')}</button>
      </div>
    </div>
  );
}
