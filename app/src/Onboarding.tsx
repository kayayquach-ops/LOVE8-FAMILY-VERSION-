import { useEffect, useRef, useState } from 'react';
import { api, token } from './api';
import { CityPicker } from './CityPicker';
import { fileName, type Recording } from './media';
import type { Role } from './shared';
import { buzz, sfx, startMusic, stopMusic, tap } from './sound';
import { Icon, toast, Typed } from './ui';
import { VoiceNote } from './VoiceNote';

type Step = 'hello' | 'role' | 'kid' | 'name' | 'dob' | 'city' | 'seen' | 'hug' | 'food' | 'love' | 'voice' | 'unsaid' | 'story' | 'home' | 'code' | 'invite';
const FLOW: Step[] = ['hello', 'role', 'kid', 'name', 'dob', 'city', 'seen', 'hug', 'food', 'love', 'voice', 'unsaid', 'story', 'home'];

// Chuyện vì sao có Homeletter, kể chậm từng trang.
const STORY: Array<{ art: string; lines: [string, string] }> = [
  { art: 'room', lines: ['Homeletter bắt đầu từ một căn phòng trọ nhỏ ở Hàn Quốc.', 'Một bạn du học sinh, ngày đi học, tối đi làm thêm. Về đến phòng thì ở nhà đã ngủ.'] },
  { art: 'room', lines: ['Nhớ bố mẹ lắm. Nhưng mỗi lần gọi về, bạn ấy chỉ nói được “con vẫn ổn”.', 'Chưa giúp được gì nhiều cho nhà, nên càng ngại kể chuyện mình.'] },
  { art: 'home', lines: ['Ở quê, bố mẹ cũng vậy. Nhớ con, mà sợ hỏi nhiều con lại lo.', 'Hai đầu nỗi nhớ, ai cũng giữ cho riêng mình.'] },
  { art: 'letter', lines: ['Rồi bạn ấy nghĩ: giá mỗi tuần có một lá thư đi về nhà.', 'Không cần dài. Một tấm ảnh, một câu hỏi, một giọng nói.'] },
  { art: 'letter', lines: ['Homeletter là lá thư ấy.', 'Cho bạn, và cho những người đang chờ bạn ở nhà.'] },
];

// Vào app như một cuộc trò chuyện: bạn là ai, nhớ nhà thế nào, rồi nghe kể vì sao có Homeletter và vào nhà.
export function Onboarding({ onDone }: { onDone: () => void }) {
  const invite = new URLSearchParams(location.search).get('join') ?? '';
  const [step, setStep] = useState<Step>('hello');
  const [role, setRole] = useState<Role | null>(null);
  const [kid, setKid] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [dob, setDob] = useState({ d: '', m: '', y: '' });
  const [a, setA] = useState<Record<string, string>>({});
  const [wantHug, setWantHug] = useState<boolean | null>(null);
  // Câu "thương" đầu tiên bằng giọng mình: chỉ giữ trong máy, tạo nhà xong mới gửi lên.
  const [voice, setVoice] = useState<Recording | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [page, setPage] = useState(0);
  const [family, setFamily] = useState('Nhà mình');
  const [code, setCode] = useState(invite);
  const [inviteName, setInviteName] = useState('');
  const [made, setMade] = useState<{ code: string; family: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const choosing = useRef(false);
  // Chữ đã hiện xong hay chưa tính theo từng câu (step và page), để khi sang câu mới không còn sót trạng thái cũ.
  const [typedKey, setTypedKey] = useState('');
  const typedNow = `${step}:${page}`;
  const typed = typedKey === typedNow;
  const setTyped = () => setTypedKey(typedNow);

  useEffect(() => { for (const a of ['room', 'home', 'letter']) new Image().src = `/art/story-${a}.png`; }, []);
  useEffect(() => { if (invite) api.familyName(invite).then((r) => setInviteName(r.name)).catch(() => {}); }, []);
  // Quay lại câu ôm thì hỏi lại từ đầu.
  useEffect(() => { if (step === 'hug') { setWantHug(null); setA((x) => { const { hug: _, ...r } = x; return r; }); } }, [step]);

  const parent = role === 'bo' || role === 'me';
  const self = role === 'bo' ? 'bố' : role === 'me' ? 'mẹ' : 'bạn';
  const Self = self[0].toUpperCase() + self.slice(1);
  const kids = kid === 'Cả trai lẫn gái' ? 'các con' : 'con';
  const Kids = kids[0].toUpperCase() + kids.slice(1);
  const go = (s: Step) => { sfx('button'); setStep(s); };
  const next = () => go(FLOW[FLOW.indexOf(step) + 1]);
  const back = () => {
    if (step === 'story' && page > 0) return setPage(page - 1);
    setStep(step === 'code' ? 'home' : FLOW[Math.max(0, FLOW.indexOf(step) - 1)]);
  };
  // Chọn xong thì để lời đáp hiện một lúc rồi tự sang câu sau.
  // Quay lại câu đã trả lời thì vẫn chọn lại được; chỉ chặn bấm thêm trong lúc đang chờ sang câu sau.
  const choose = (k: string, v: string) => {
    if (choosing.current) return;
    choosing.current = true;
    tap();
    setA({ ...a, [k]: v });
    setTimeout(() => { choosing.current = false; next(); }, 4200);
  };

  async function finish(join: boolean) {
    setBusy(true);
    try {
      const body = { name: name.trim(), role: role!, city, intro: { ...a, kid, ...(wantHug === null ? {} : { wantHug }), loveVoice: !!voice } };
      const r = join ? await api.join({ ...body, code: code.trim() }) : await api.create({ ...body, family: family.trim() || 'Nhà mình' });
      token.set(r.token);
      if (voice) {
        // Gửi lỗi thì thôi, không chặn việc vào nhà.
        const f = new FormData();
        f.set('file', voice.blob, fileName(voice.blob, 'first-voice'));
        f.set('seconds', String(voice.seconds));
        await api.firstVoice(f).catch(() => {});
      }
      if (dobValid) await fetch('/api/me/dob', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${r.token}` }, body: JSON.stringify({ dob: dobIso }) }).catch(() => {});
      sfx('arrive');
      stopMusic(4);
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
      <button className="screen hello" onClick={() => { sfx('hello'); void startMusic(); setStep('role'); }} aria-label="Xin chào, chạm để bắt đầu">
        <div className="center"><Hello /></div>
        <div className="hello-hint">{inviteName ? `Bạn được mời vào ${inviteName}` : 'Chạm để bắt đầu'}</div>
      </button>
    );
  }

  const seenOpts: Record<string, string> = {
    'Mới tuần trước': 'Vậy là vòng tay vẫn còn ấm.',
    'Vài tháng rồi': 'Vài tháng, đủ để nhà có thêm bao chuyện chưa kể.',
    'Hơn một năm': parent ? 'Hơn một năm. Chắc con cũng đang đếm ngày về.' : 'Hơn một năm. Chắc ở nhà đã đếm qua mấy cái Tết.',
    'Ở cùng nhà mà ít nói chuyện': 'Gần mà xa. Mình bắt đầu lại từ một câu hỏi nhỏ nhé.',
  };
  const loveOpts: Record<string, string> = parent ? {
    'Nói thường xuyên': 'Con may mắn lắm đấy.',
    'Thỉnh thoảng': 'Thỉnh thoảng thôi cũng đủ ấm cả tuần.',
    'Chưa nói thành lời bao giờ': 'Bố mẹ nhiều khi thương mà không nói. Con vẫn biết mà.',
  } : {
    'Nói thường xuyên': 'Bố mẹ chắc vui lắm mỗi lần nghe.',
    'Thỉnh thoảng': 'Lần tới, nói thêm một lần nữa nhé.',
    'Chưa nói thành lời bao giờ': 'Không sao. Có những câu cần thời gian. Homeletter sẽ giúp bạn.',
  };

  const dobValid = +dob.d >= 1 && +dob.d <= 31 && +dob.m >= 1 && +dob.m <= 12 && +dob.y >= 1920 && +dob.y <= new Date().getFullYear();
  const dobIso = `${dob.y}-${dob.m.padStart(2, '0')}-${dob.d.padStart(2, '0')}`;
  const done = FLOW.indexOf(step === 'code' || step === 'invite' ? 'home' : step);
  const T = { typed, onTyped: setTyped };

  return (
    <div className="screen">
      <div className="top">
        {step !== 'invite' ? <button className="icon-btn" onClick={back} aria-label="Quay lại"><Icon name="back" /></button> : <span style={{ width: 44 }} />}
        <div className="progress"><i style={{ width: `${(done / (FLOW.length - 1)) * 100}%` }} /></div>
        <span style={{ width: 44 }} />
      </div>

      {step === 'role' && (
        <Ask key="role" q="Bạn là ai trong gia đình?" {...T}>
          {([['bo', 'Là bố'], ['me', 'Là mẹ'], ['con', 'Là con']] as const).map(([k, label]) => (
            <Opt key={k} on={role === k} onClick={() => { tap(); setRole(k); setName(k === 'bo' ? 'Bố' : k === 'me' ? 'Mẹ' : ''); setTimeout(next, 250); }}>{label}</Opt>
          ))}
        </Ask>
      )}

      {step === 'kid' && (
        <Ask key="kid" q={parent ? `Con của ${self} là trai hay gái?` : 'Bạn là con trai hay con gái của bố mẹ?'} {...T}>
          {(parent ? ['Con trai', 'Con gái', 'Cả trai lẫn gái'] : ['Con trai', 'Con gái']).map((k) => (
            <Opt key={k} on={kid === k} onClick={() => { tap(); setKid(k); setTimeout(next, 250); }}>{k}</Opt>
          ))}
        </Ask>
      )}

      {step === 'name' && (
        <Ask key="name" q="Mọi người trong nhà gọi bạn là gì?" {...T} footer={<button className="btn" disabled={!name.trim()} onClick={next}>Tiếp</button>}>
          <input className="field fade" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={parent ? 'Ví dụ: Bố, Mẹ Hoa' : 'Ví dụ: Lan, bé Na'} />
        </Ask>
      )}

      {step === 'dob' && (
        <Ask key="dob" q={`${Self} sinh ngày nào?`} sub={parent ? 'Để các con không bao giờ quên ngày này.' : 'Để bố mẹ nhớ chúc mừng bạn.'} {...T}
          footer={<><button className="btn" disabled={!dobValid} onClick={next}>Tiếp</button><button className="link" onClick={next}>Để sau</button></>}>
          <div className="dob fade">
            <input className="field" inputMode="numeric" maxLength={2} placeholder="Ngày" value={dob.d} onChange={(e) => setDob({ ...dob, d: e.target.value.replace(/\D/g, '') })} />
            <input className="field" inputMode="numeric" maxLength={2} placeholder="Tháng" value={dob.m} onChange={(e) => setDob({ ...dob, m: e.target.value.replace(/\D/g, '') })} />
            <input className="field" inputMode="numeric" maxLength={4} placeholder="Năm" value={dob.y} onChange={(e) => setDob({ ...dob, y: e.target.value.replace(/\D/g, '') })} style={{ flex: 1.4 }} />
          </div>
        </Ask>
      )}

      {step === 'city' && (
        <Ask key="city" q={`${Self} đang ở đâu?`} sub="Để cả nhà biết giờ và thời tiết bên đó." {...T}
          footer={<button className="btn" disabled={!city} onClick={next}>Tiếp</button>}>
          <CityPicker value={city} onChange={setCity} />
        </Ask>
      )}

      {step === 'seen' && (
        <Ask key="seen" q={parent ? `Bao lâu rồi ${self} chưa gặp con?` : 'Bao lâu rồi bạn chưa về nhà?'} echo={a.seen && seenOpts[a.seen]} {...T}>
          {Object.keys(seenOpts).map((k) => <Opt key={k} on={a.seen === k} onClick={() => choose('seen', k)}>{k}</Opt>)}
        </Ask>
      )}

      {step === 'hug' && (
        <Ask key="hug" q={parent ? `${Self} có muốn ôm ${kids} một cái ngay bây giờ không?` : 'Bạn có muốn ôm bố mẹ một cái ngay bây giờ không?'}
          sub={wantHug && !a.hug ? 'Giữ ngón tay vào vòng tròn' : undefined}
          echo={wantHug === false ? (parent ? `Không sao. Lúc nào nhớ ${kids}, mình ôm sau nhé.` : 'Không sao. Lúc nào nhớ nhà, mình ôm sau nhé.')
            : a.hug ? (parent ? `${Kids} sẽ biết là có người đang ôm mình từ xa.` : 'Ở nhà sẽ biết là bạn đang nhớ.') : undefined} {...T}>
          {wantHug
            ? <div key="hold" className="slow-in"><Hold onDone={() => { sfx('hug'); setA({ ...a, hug: 'yes' }); setTimeout(next, 4200); }} /></div>
            : [
              <Opt key="yes" on={false} onClick={() => { if (wantHug !== null) return; tap(); setWantHug(true); }}>Có, rất muốn</Opt>,
              <Opt key="no" on={wantHug === false} onClick={() => { if (wantHug !== null) return; tap(); setWantHug(false); setTimeout(next, 4200); }}>Để lúc khác</Opt>,
            ]}
        </Ask>
      )}

      {step === 'food' && (
        <Ask key="food" q={parent ? `${Self} còn nhớ con thích ăn món gì không?` : 'Món gì ở nhà mà bạn nhớ nhất?'}
          echo={(a.food ?? '').trim().length > 1 ? (parent ? 'Món ấy, chắc đến giờ con vẫn nhớ vị.' : 'Lần tới gọi về, thử hỏi mẹ cách nấu món ấy nhé.') : undefined} {...T}
          footer={<><button className="btn" disabled={!(a.food ?? '').trim()} onClick={next}>Tiếp</button><button className="link" onClick={next}>Để sau</button></>}>
          <input className="field fade" value={a.food ?? ''} maxLength={60} onChange={(e) => setA({ ...a, food: e.target.value })} placeholder={parent ? 'Ví dụ: trứng rán, canh chua' : 'Ví dụ: canh chua của mẹ'} />
        </Ask>
      )}

      {step === 'love' && (
        <Ask key="love" q={parent ? `${Self} đã bao giờ nói “${self} thương con” chưa?` : 'Bạn đã bao giờ nói “con thương bố mẹ” chưa?'} echo={a.love && loveOpts[a.love]} {...T}>
          {Object.keys(loveOpts).map((k) => <Opt key={k} on={a.love === k} onClick={() => choose('love', k)}>{k}</Opt>)}
        </Ask>
      )}

      {step === 'voice' && (
        <Ask key="voice" q={parent ? `${Self} nói một câu thôi, giờ luôn nhé.` : 'Nói một câu thôi, giờ luôn nhé.'}
          sub={`Như là: “${parent ? `${Self} thương ${kids}.` : 'Con thương bố mẹ.'}”`}
          echo={voice ? 'Câu ấy sẽ là lá thư đầu tiên trong nhà.' : micDenied ? 'Máy chưa cho dùng micro. Không sao, mình nói sau nhé.' : undefined} {...T}
          footer={voice
            ? <><button className="btn" onClick={next}>Giữ câu này</button><button className="link" onClick={() => { tap(); URL.revokeObjectURL(voice.url); setVoice(null); }}>Thu lại</button></>
            : <button className="link" onClick={next}>Để sau</button>}>
          <VoiceNote value={voice} onChange={(r) => { setMicDenied(false); setVoice(r); }} onDenied={() => setMicDenied(true)} />
        </Ask>
      )}

      {step === 'unsaid' && (
        <Ask key="unsaid" q={parent ? `Điều ${self} muốn nói với con mà chưa nói?` : 'Có điều gì bạn muốn nói với bố mẹ mà chưa nói?'}
          echo={(a.unsaid ?? '').trim().length > 1 ? (parent ? 'Homeletter sẽ giữ câu ấy, chờ lúc hợp để con được nghe.' : 'Có những câu khó nói thành lời. Homeletter sẽ giữ giúp bạn.') : undefined} {...T}
          footer={<><button className="btn" disabled={!(a.unsaid ?? '').trim()} onClick={next}>Tiếp</button><button className="link" onClick={next}>Để sau</button></>}>
          <textarea className="field fade" rows={3} value={a.unsaid ?? ''} maxLength={200} onChange={(e) => setA({ ...a, unsaid: e.target.value })} placeholder="Viết ở đây, chỉ mình bạn thấy" />
        </Ask>
      )}

      {step === 'story' && (
        <div key={page} className="center fade" style={{ justifyContent: 'flex-start' }}>
          <img src={`/art/story-${STORY[page].art}.png`} alt="" decoding="async"
            onError={(e) => { const el = e.currentTarget; if (!el.dataset.retry) { el.dataset.retry = '1'; el.src = `${el.src.split('?')[0]}?r=${Date.now()}`; } }}
            style={{ width: '100%', aspectRatio: '4 / 3', maxHeight: '36vh', objectFit: 'contain', marginTop: 10 }} />
          <h2 className="story-lead"><Typed text={STORY[page].lines[0]} onDone={setTyped} /></h2>
          <p className={`story-line ${typed ? 'fade' : 'reserve'}`}>{STORY[page].lines[1]}</p>
          <div style={{ flex: 1 }} />
          <button className={`btn ${typed ? 'fade' : 'reserve'}`} onClick={() => { sfx('button'); page < STORY.length - 1 ? setPage(page + 1) : setStep('home'); }}>{page < STORY.length - 1 ? 'Tiếp' : 'Viết lá thư đầu tiên'}</button>
        </div>
      )}

      {step === 'home' && (invite ? (
        <Ask key="join" q={inviteName ? `Vào ${inviteName} nhé?` : 'Vào nhà nhé?'} {...T}
          footer={<button className="btn" disabled={busy} onClick={() => finish(true)}>Vào nhà</button>} />
      ) : (
        <Ask key="home" q="Nhà mình tên là gì?" sub="Bạn tạo nhà trước, rồi mời mọi người vào." {...T}
          footer={<>
            <button className="btn" disabled={busy || !family.trim()} onClick={() => finish(false)}>Tạo nhà</button>
            <button className="link" onClick={() => go('code')}>Mình có mã nhà rồi</button>
          </>}>
          <input className="field fade" value={family} maxLength={40} onChange={(e) => setFamily(e.target.value)} />
        </Ask>
      ))}

      {step === 'code' && (
        <Ask key="code" q="Mã nhà là gì?" sub="Người tạo nhà có mã 6 số trong mục Gia đình." {...T}
          footer={<button className="btn" disabled={busy || code.trim().length !== 6} onClick={() => finish(true)}>Vào nhà</button>}>
          <input className="field fade" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" style={{ letterSpacing: 6, fontSize: 24 }} />
        </Ask>
      )}

      {step === 'invite' && made && (
        <Ask key="invite" q="Giờ mời cả nhà vào nhé." {...T}
          footer={<>
            <button className="btn" onClick={() => { sfx('button'); shareInvite(made.code, made.family); }}><Icon name="share" size={20} /> Gửi lời mời</button>
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

function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`opt ${on ? 'on' : ''}`} onClick={onClick}>{children}</button>;
}

/** Câu hỏi gõ từng chữ; gõ xong các đáp án hiện lên lần lượt với tiếng "bụp" nhẹ. */
function Ask({ q, sub, echo, typed, onTyped, children, footer }: {
  q: string; sub?: string; echo?: string | false; typed: boolean; onTyped: () => void; children?: React.ReactNode; footer?: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <>
      <div className="center">
        <h1 className="q"><Typed text={q} onDone={onTyped} /></h1>
        {sub && <p className={`sub ${typed ? 'slow-in' : 'reserve'}`}>{sub}</p>}
        <div className="options">{items.map((c, i) => <div key={i} className={typed ? 'slow-in' : 'reserve'} style={{ animationDelay: `${i * 130}ms`, width: '100%', display: 'flex', justifyContent: 'center' }}>{c}</div>)}</div>
        <div className="echo">{echo && <span className="slow-in" key={echo} style={{ animationDelay: '300ms' }}>{echo}</span>}</div>
      </div>
      <div className="slow-in" key={String(typed)} style={{ display: 'flex', flexDirection: 'column', minHeight: 56, animationDelay: "350ms" }}>{typed && footer}</div>
    </>
  );
}

/** Giữ ngón tay để "ôm": vòng tròn đầy dần trong khoảng 1,6 giây, rung nhẹ theo từng nhịp. */
function Hold({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    if (p >= 1) return;
    if (!holding) {
      if (p <= 0) return;
      const t = setTimeout(() => setP(Math.max(0, p - 0.08)), 30);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      const np = Math.min(1, p + 0.02);
      if (Math.floor(np * 4) > Math.floor(p * 4)) buzz(12);
      setP(np);
      if (np >= 1) onDone();
    }, 32);
    return () => clearTimeout(t);
  }, [p, holding]);
  return (
    <div className="hold" onPointerDown={() => setHolding(true)} onPointerUp={() => setHolding(false)} onPointerLeave={() => setHolding(false)}
      onContextMenu={(e) => e.preventDefault()} role="button" aria-label="Giữ để ôm">
      <i style={{ transform: `scale(${0.25 + p * 0.75})`, opacity: 0.25 + p * 0.75 }} />
      <span style={{ color: p >= 1 ? '#fff' : 'var(--accent)', position: 'relative' }}><Icon name={p >= 1 ? 'heartFill' : 'heart'} size={46} /></span>
    </div>
  );
}

/** "xin chào" viết tay: nét chữ được vẽ dần như đang viết, rồi mực đầy lên. */
function Hello() {
  return (
    <div className="hello-wrap">
      <i className="hello-glow" aria-hidden />
      <svg className="hello-word" viewBox="0 0 600 220" role="img" aria-label="xin chào">
        <text x="300" y="150" textAnchor="middle">xin chào</text>
      </svg>
    </div>
  );
}
