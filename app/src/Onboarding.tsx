import { useEffect, useState } from 'react';
import { api, token } from './api';
import { CITIES, type Role } from './shared';
import { tap } from './sound';
import { Icon, toast, Typed } from './ui';

type Step = 'hello' | 'role' | 'name' | 'city' | 'home' | 'code' | 'invite';

// Vào app như một cuộc trò chuyện ngắn: bạn là ai, gọi bạn là gì, đang ở đâu, rồi vào nhà.
export function Onboarding({ onDone }: { onDone: () => void }) {
  const invite = new URLSearchParams(location.search).get('join') ?? '';
  const [step, setStep] = useState<Step>('hello');
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [family, setFamily] = useState('Nhà mình');
  const [code, setCode] = useState(invite);
  const [inviteName, setInviteName] = useState('');
  const [made, setMade] = useState<{ code: string; family: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState(false);

  useEffect(() => { if (invite) api.familyName(invite).then((r) => setInviteName(r.name)).catch(() => {}); }, []);
  useEffect(() => setTyped(false), [step]);

  const go = (s: Step) => { tap(); setStep(s); };
  const order: Step[] = ['hello', 'role', 'name', 'city', 'home'];
  const back = () => setStep(step === 'code' ? 'home' : order[Math.max(0, order.indexOf(step) - 1)]);

  async function finish(join: boolean) {
    setBusy(true);
    try {
      const body = { name: name.trim(), role: role!, city };
      const r = join ? await api.join({ ...body, code: code.trim() }) : await api.create({ ...body, family: family.trim() || 'Nhà mình' });
      token.set(r.token);
      if (join) return onDone();
      const me = await api.me();
      setMade({ code: me.family.code, family: me.family.name });
      setStep('invite');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'hello') {
    return (
      <button className="screen" onClick={() => go('role')} aria-label="Xin chào, chạm để bắt đầu" style={{ alignItems: 'center' }}>
        <div className="center"><Hello /></div>
        <div className="muted fade" style={{ animationDelay: '2.4s' }}>{inviteName ? `Bạn được mời vào ${inviteName}` : 'Chạm để bắt đầu'}</div>
      </button>
    );
  }

  const progress = { role: 1, name: 2, city: 3, home: 4, code: 4, invite: 5 }[step];

  return (
    <div className="screen">
      <div className="top">
        {step !== 'invite' ? <button className="icon-btn" onClick={back} aria-label="Quay lại"><Icon name="back" /></button> : <span style={{ width: 44 }} />}
        <div className="progress"><i style={{ width: `${(progress / 5) * 100}%` }} /></div>
        <span style={{ width: 44 }} />
      </div>

      {step === 'role' && (
        <Ask key="role" q="Bạn là ai trong gia đình?" typed={typed} onTyped={() => setTyped(true)}>
          {([['bo', 'Là bố'], ['me', 'Là mẹ'], ['con', 'Là con']] as const).map(([k, label], i) => (
            <button key={k} className={`opt fade ${role === k ? 'on' : ''}`} style={{ animationDelay: `${i * 110}ms` }}
              onClick={() => { setRole(k); setName(k === 'bo' ? 'Bố' : k === 'me' ? 'Mẹ' : name); go('name'); }}>{label}</button>
          ))}
        </Ask>
      )}

      {step === 'name' && (
        <Ask key="name" q="Mọi người trong nhà gọi bạn là gì?" typed={typed} onTyped={() => setTyped(true)}
          footer={<button className="btn" disabled={!name.trim()} onClick={() => go('city')}>Tiếp</button>}>
          <input className="field fade" autoFocus value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={role === 'con' ? 'Ví dụ: Lan, bé Na' : 'Ví dụ: Bố, Mẹ Hoa'} />
        </Ask>
      )}

      {step === 'city' && (
        <Ask key="city" q="Bạn đang ở đâu?" sub="Để cả nhà biết giờ và thời tiết bên bạn." typed={typed} onTyped={() => setTyped(true)}
          footer={<button className="btn" disabled={!city} onClick={() => go('home')}>Tiếp</button>}>
          <div className="chips fade">
            {Object.entries(CITIES).map(([k, c]) => <button key={k} className={`chip ${city === k ? 'on' : ''}`} onClick={() => { tap(); setCity(k); }}>{c.name}</button>)}
          </div>
        </Ask>
      )}

      {step === 'home' && (invite ? (
        <Ask key="join" q={inviteName ? `Vào ${inviteName} nhé?` : 'Vào nhà nhé?'} typed={typed} onTyped={() => setTyped(true)}
          footer={<button className="btn" disabled={busy} onClick={() => finish(true)}>Vào nhà</button>} />
      ) : (
        <Ask key="home" q="Nhà mình tên là gì?" sub="Bạn tạo nhà trước, rồi mời mọi người vào." typed={typed} onTyped={() => setTyped(true)}
          footer={<>
            <button className="btn" disabled={busy || !family.trim()} onClick={() => finish(false)}>Tạo nhà</button>
            <button className="link" onClick={() => go('code')}>Mình có mã nhà rồi</button>
          </>}>
          <input className="field fade" value={family} maxLength={40} onChange={(e) => setFamily(e.target.value)} />
        </Ask>
      ))}

      {step === 'code' && (
        <Ask key="code" q="Mã nhà là gì?" sub="Người tạo nhà có mã 6 số trong mục Gia đình." typed={typed} onTyped={() => setTyped(true)}
          footer={<button className="btn" disabled={busy || code.trim().length !== 6} onClick={() => finish(true)}>Vào nhà</button>}>
          <input className="field fade" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" style={{ letterSpacing: 6, fontSize: 24 }} />
        </Ask>
      )}

      {step === 'invite' && made && (
        <Ask key="invite" q="Giờ mời cả nhà vào nhé." typed={typed} onTyped={() => setTyped(true)}
          footer={<>
            <button className="btn" onClick={() => shareInvite(made.code, made.family)}><Icon name="share" size={20} /> Gửi lời mời</button>
            <button className="link" onClick={onDone}>Vào nhà trước</button>
          </>}>
          <div className="panel fade" style={{ alignSelf: 'center', width: '86%', textAlign: 'center' }}>
            <div className="muted">Mã nhà {made.family}</div>
            <div className="code">{made.code}</div>
            <div className="muted">Gửi link qua Zalo, Messenger. Bố mẹ bấm vào là vào nhà.</div>
          </div>
        </Ask>
      )}
    </div>
  );
}

export function shareInvite(code: string, family: string) {
  const url = `${location.origin}/?join=${code}`;
  const text = `Vào ${family} trên Homeletter với mình nhé. Mã nhà: ${code}`;
  if (navigator.share) navigator.share({ title: 'Homeletter', text, url }).catch(() => {});
  else navigator.clipboard?.writeText(`${text}\n${url}`).then(() => toast('Đã chép lời mời'));
}

function Ask({ q, sub, typed, onTyped, children, footer }: { q: string; sub?: string; typed: boolean; onTyped: () => void; children?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <>
      <div className="center">
        <h1 className="q"><Typed text={q} onDone={onTyped} /></h1>
        {typed && sub && <p className="sub fade">{sub}</p>}
        <div className="options">{typed && children}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 56 }}>{typed && footer}</div>
    </>
  );
}

/** Chữ "xin chào" mở dần từ trái sang như đang được viết ra. */
function Hello() {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (p >= 1) return;
    const t = setTimeout(() => setP(Math.min(1, p + 0.025)), p === 0 ? 500 : 38);
    return () => clearTimeout(t);
  }, [p]);
  const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  return (
    <div style={{ width: 300, alignSelf: 'center' }}>
      <div style={{ width: `${e * 100}%`, overflow: 'hidden' }}>
        <div style={{ width: 300, textAlign: 'center', fontSize: 58, letterSpacing: -1.5, color: '#4A3B2E', whiteSpace: 'nowrap' }}>xin chào</div>
      </div>
    </div>
  );
}
