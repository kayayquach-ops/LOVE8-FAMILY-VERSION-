import { useEffect } from 'react';
import { livePost, type LiveRoom } from './live';
import type { Me } from './shared';
import { buzz, sfx, tap } from './sound';
import { Avatar, Icon } from './ui';

// Chuông gọi video tách riêng khỏi màn gọi, để màn gọi (nặng) chỉ tải khi cần.
/** Chuông gọi video đến: ai đó trong nhà vừa gọi, hoặc cả nhà đang gọi dở. */
export function Incoming({ me, room, onAccept, onDecline }: { me: Me; room: NonNullable<LiveRoom>; onAccept: () => void; onDecline: (missed: boolean) => void }) {
  const caller = me.members.find((m) => m.id === room.by) ?? me.members.find((m) => room.members.includes(m.id));
  const others = room.members.filter((id) => id !== me.me.id);
  useEffect(() => {
    const ring = () => { sfx('hello'); buzz(400); };
    ring();
    const t = setInterval(ring, 3200);
    const miss = setTimeout(() => onDecline(true), 45000);
    return () => { clearInterval(t); clearTimeout(miss); };
  }, [room.id]);
  return (
    <div className="sheet call ft-ring">
      <div className="call-ring fade">
        <div className="call-orb"><i /><i /><b><Avatar m={caller} size={96} /></b></div>
        <div className="call-who">{caller?.name ?? 'Nhà mình'} đang gọi</div>
        <div className="call-sub">{others.length > 1 ? `${others.length} người đang trò chuyện` : 'Gọi video cả nhà'}</div>
        <div style={{ flex: 1 }} />
        <div className="call-actions">
          <button className="call-btn later" onClick={() => { tap(); void livePost('decline').catch(() => {}); onDecline(false); }}><Icon name="close" size={26} /><span>Để sau</span></button>
          <button className="call-btn pick" onClick={() => { tap(); onAccept(); }}><Icon name="video" size={26} /><span>Nghe</span></button>
        </div>
      </div>
    </div>
  );
}
