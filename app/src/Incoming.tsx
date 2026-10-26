import { useEffect } from 'react';
import { livePost, type LiveRoom } from './live';
import type { Me } from './shared';
import { startRing, stopRing, tap } from './sound';
import { Avatar, Icon } from './ui';
import { t } from './i18n';

// Chuông gọi video tách riêng khỏi màn gọi, để màn gọi (nặng) chỉ tải khi cần.
/** Chuông gọi video đến: ai đó trong nhà vừa gọi, hoặc cả nhà đang gọi dở. */
export function Incoming({ me, room, onAccept, onDecline }: { me: Me; room: NonNullable<LiveRoom>; onAccept: () => void; onDecline: (missed: boolean) => void }) {
  const caller = me.members.find((m) => m.id === room.by) ?? me.members.find((m) => room.members.includes(m.id));
  const others = room.members.filter((id) => id !== me.me.id);
  useEffect(() => {
    startRing('in');
    const miss = setTimeout(() => onDecline(true), 45000);
    return () => { stopRing(); clearTimeout(miss); };
  }, [room.id]);
  return (
    <div className="sheet call ft-ring">
      <div className="call-ring fade">
        <div className="call-orb"><i /><i /><b><Avatar m={caller} size={96} /></b></div>
        <div className="call-who">{t('incoming.calling', { name: caller?.name ?? t('onboarding.home.default') })}</div>
        <div className="call-sub">{room.to === me.me.id ? t('incoming.you') : others.length > 1 ? t('incoming.talking', { n: others.length }) : t('incoming.family')}</div>
        <div style={{ flex: 1 }} />
        <div className="call-actions">
          <button className="call-btn later" onClick={() => { tap(); void livePost('decline').catch(() => {}); onDecline(false); }}><Icon name="close" size={26} /><span>{t('common.later')}</span></button>
          <button className="call-btn pick" onClick={() => { tap(); onAccept(); }}><Icon name="video" size={26} /><span>{t('common.listen')}</span></button>
        </div>
      </div>
    </div>
  );
}
