import { Mascot } from './Mascot';
import { t } from './i18n';
import { tap } from './sound';
import { Icon } from './ui';
import type { Me } from './shared';
import './may.css';

/** Tab Mây: gọi cho Mây bất cứ lúc nào, hoặc chờ Mây gọi (cuối tuần). Mây gọi thì nút "Nghe máy" nổi lên. */
export function MayTab({ me, callDue, onCall, onPodcast }: { me: Me; callDue: boolean; onCall: () => void; onPodcast: () => void }) {
  const first = me.me.name.trim().split(/\s+/).pop() ?? '';
  return (
    <div className="may scroll">
      <div className={`may-hero${callDue ? ' ring' : ''}`}>
        <div className="may-mascot"><Mascot mode={callDue ? 'wave' : 'idle'} size={190} /></div>
        {callDue && <i className="may-ring" aria-hidden />}
      </div>
      <h1 className="may-title">{callDue ? t('may.due.title', { name: first }) : t('may.title')}</h1>
      <p className="may-sub">{callDue ? t('may.due.sub') : t('may.wait.sub')}</p>
      <button className="btn may-call" onClick={() => { tap(); onCall(); }}>
        <Icon name="phone" size={22} /> {callDue ? t('call.pickUp') : t('may.call')}
      </button>
      {!callDue && <p className="muted may-note">{t('may.wait.note')}</p>}
      <button className="link may-more" onClick={() => { tap(); onPodcast(); }}>{t('may.listen')}</button>
    </div>
  );
}
