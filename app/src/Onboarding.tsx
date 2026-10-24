import { useEffect, useRef, useState } from 'react';
import { api, token } from './api';
import { CityPicker } from './CityPicker';
import { fileName, type Recording } from './media';
import type { Role } from './shared';
import { sfx, startMusic, stopMusic, tap } from './sound';
import { Icon, SKIP_EVENT, toast, Typed } from './ui';
import { VoiceNote } from './VoiceNote';
import './onboarding.css';

type Step = 'hello' | 'role' | 'kid' | 'name' | 'dob' | 'city' | 'seen' | 'hug' | 'food' | 'love' | 'voice' | 'unsaid' | 'story' | 'home' | 'code' | 'invite';
const FLOW: Step[] = ['hello', 'role', 'kid', 'name', 'dob', 'city', 'seen', 'hug', 'food', 'love', 'voice', 'unsaid', 'story', 'home'];

// Chuyện vì sao có Sweet Home, kể chậm từng trang.
const STORY: Array<{ art: string; lines: [string, string] }> = [
  { art: 'room', lines: ['Sweet Home bắt đầu từ một căn phòng trọ nhỏ ở Hàn Quốc.', 'Một bạn du học sinh, ngày đi học, tối đi làm thêm. Về đến phòng thì ở nhà đã ngủ.'] },
  { art: 'room', lines: ['Nhớ bố mẹ lắm. Nhưng mỗi lần gọi về, bạn ấy chỉ nói được “con vẫn ổn”.', 'Chưa giúp được gì nhiều cho nhà, nên càng ngại kể chuyện mình.'] },
  { art: 'home', lines: ['Ở quê, bố mẹ cũng vậy. Nhớ con, mà sợ hỏi nhiều con lại lo.', 'Hai đầu nỗi nhớ, ai cũng giữ cho riêng mình.'] },
  { art: 'letter', lines: ['Rồi bạn ấy nghĩ: giá mỗi tuần có một lá thư đi về nhà.', 'Không cần dài. Một tấm ảnh, một câu hỏi, một giọng nói.'] },
  { art: 'letter', lines: ['Sweet Home là lá thư ấy.', 'Cho bạn, và cho những người đang chờ bạn ở nhà.'] },
];

// Vào app như một cuộc trò chuyện: bạn là ai, nhớ nhà thế nào, rồi nghe kể vì sao có Sweet Home và vào nhà.
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
  // Chạm màn hình khi chữ còn đang hiện: hiện đủ ngay, đáp án mờ nhanh không chờ.
  const [fastKey, setFastKey] = useState('');
  const fast = fastKey === typedNow;
  const skip = () => { if (!typed) setFastKey(typedNow); window.dispatchEvent(new Event(SKIP_EVENT)); };
  const [hint] = useState(() => { try { return !localStorage.getItem('hl-skip-hint'); } catch { return false; } });

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
  const auto = useRef<ReturnType<typeof setTimeout>>(undefined);
  const later = (f: () => void, ms: number) => { clearTimeout(auto.current); auto.current = setTimeout(f, ms); };
  useEffect(() => () => clearTimeout(auto.current), []);
  const back = () => {
    // Đang chờ tự sang câu sau mà bấm quay lại thì huỷ, không bị đẩy tới câu khác.
    clearTimeout(auto.current); choosing.current = false;
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
    later(() => { choosing.current = false; next(); }, 4200);
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
      // Nhà đã tạo xong; chưa lấy được mã thì cứ vào nhà (mã có trong mục Gia đình), không để bấm Tạo nhà lần nữa thành hai nhà.
      const me = await api.me().catch(() => null);
      if (!me) return onDone();
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
      <>
        <Meadow />
        <button className="screen hello" onClick={() => { sfx('hello'); void startMusic(); setStep('role'); }} aria-label="Chào mừng về nhà, chạm để bắt đầu">
          <HelloFrame />
          <div className="hello-top" aria-hidden>
            <div className="hello-brand">sweet home</div>
          </div>
          <Welcome />
          <div className="center" />
          <div className="hello-hint">{inviteName ? `Bạn được mời vào ${inviteName}` : 'Chạm để bắt đầu'}</div>
        </button>
      </>
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
    'Chưa nói thành lời bao giờ': 'Không sao. Có những câu cần thời gian. Sweet Home sẽ giúp bạn.',
  };

  const dobValid = +dob.d >= 1 && +dob.d <= 31 && +dob.m >= 1 && +dob.m <= 12 && +dob.y >= 1920 && +dob.y <= new Date().getFullYear();
  const dobIso = `${dob.y}-${dob.m.padStart(2, '0')}-${dob.d.padStart(2, '0')}`;
  const done = FLOW.indexOf(step === 'code' || step === 'invite' ? 'home' : step);
  const T = { typed, onTyped: setTyped, fast };

  return (
    <>
    <Meadow />
    <div className="screen" onPointerDownCapture={skip}>
      {step === 'role' && hint && <div className="skip-hint" aria-hidden onAnimationStart={() => { try { localStorage.setItem('hl-skip-hint', '1'); } catch { /* bỏ qua */ } }}>Chạm để hiện nhanh</div>}
      <div className="top">
        {step !== 'invite' ? <button className="icon-btn" onClick={back} aria-label="Quay lại"><Icon name="back" /></button> : <span style={{ width: 44 }} />}
        <div className="progress"><i style={{ width: `${(done / (FLOW.length - 1)) * 100}%` }} /></div>
        <span style={{ width: 44 }} />
      </div>

      {step === 'role' && (
        <Ask key="role" q="Bạn là ai trong gia đình?" {...T}>
          {([['bo', 'Là bố'], ['me', 'Là mẹ'], ['con', 'Là con']] as const).map(([k, label]) => (
            <Opt key={k} on={role === k} onClick={() => { tap(); setRole(k); setName(k === 'bo' ? 'Bố' : k === 'me' ? 'Mẹ' : ''); later(next, 250); }}>{label}</Opt>
          ))}
        </Ask>
      )}

      {step === 'kid' && (
        <Ask key="kid" q={parent ? `Con của ${self} là trai hay gái?` : 'Bạn là con trai hay con gái của bố mẹ?'} {...T}>
          {(parent ? ['Con trai', 'Con gái', 'Cả trai lẫn gái'] : ['Con trai', 'Con gái']).map((k) => (
            <Opt key={k} on={kid === k} onClick={() => { tap(); setKid(k); later(next, 250); }}>{k}</Opt>
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
          echo={wantHug === true ? (parent ? `Vậy lát nữa ${self} ôm ${kids} thật chặt nhé.` : 'Vậy lát nữa bạn ôm bố mẹ thật chặt nhé.')
            : wantHug === false ? (parent ? `Không sao. Lúc nào nhớ ${kids}, mình ôm sau nhé.` : 'Không sao. Lúc nào nhớ nhà, mình ôm sau nhé.') : undefined} {...T}>
          <Opt key="yes" on={wantHug === true} onClick={() => { if (wantHug !== null) return; tap(); setWantHug(true); later(next, 4200); }}>Có, rất muốn</Opt>
          <Opt key="no" on={wantHug === false} onClick={() => { if (wantHug !== null) return; tap(); setWantHug(false); later(next, 4200); }}>Để lúc khác</Opt>
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
          echo={(a.unsaid ?? '').trim().length > 1 ? (parent ? 'Sweet Home sẽ giữ câu ấy, chờ lúc hợp để con được nghe.' : 'Có những câu khó nói thành lời. Sweet Home sẽ giữ giúp bạn.') : undefined} {...T}
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
          <p className={`story-line ${typed ? (fast ? 'quick-in' : 'fade') : 'reserve'}`}>{STORY[page].lines[1]}</p>
          <div style={{ flex: 1 }} />
          <button className={`btn ${typed ? (fast ? 'quick-in' : 'fade') : 'reserve'}`} onClick={() => { sfx('button'); page < STORY.length - 1 ? setPage(page + 1) : setStep('home'); }}>{page < STORY.length - 1 ? 'Tiếp' : 'Viết lá thư đầu tiên'}</button>
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
          {/* Không đặt maxLength: dán cả câu mời ("Mã nhà: 123456") vẫn lấy được đủ 6 số. */}
          <input className="field fade" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => { const six = e.target.value.match(/\d{6}/g); setCode(six ? six[six.length - 1] : e.target.value.replace(/\D/g, '').slice(0, 6)); }} placeholder="123456" style={{ letterSpacing: 6, fontSize: 24 }} />
        </Ask>
      )}

      {step === 'invite' && made && (
        <Ask key="invite" q="Giờ mời cả nhà vào nhé." {...T}
          footer={<>
            <button className="btn" onClick={() => { sfx('button'); void shareInvite(made.code, made.family); }}><Icon name="share" size={20} /> Gửi lời mời</button>
            <button className="link" onClick={onDone}>Vào nhà trước</button>
          </>}>
          <div className="panel fade" style={{ alignSelf: 'center', width: '86%', textAlign: 'center' }}>
            <img className="invite-logo" src="/logo.svg" alt="" />
            <div className="muted">Mã của {made.family}</div>
            <button className="code" onClick={() => void copyCode(made.code)} aria-label={`Mã nhà ${made.code}, chạm để chép`}>{made.code}</button>
            <div className="code-hint">Chạm vào mã để chép</div>
            <div className="muted">Gửi link qua Zalo, Messenger. Bố mẹ bấm vào là vào nhà.</div>
          </div>
        </Ask>
      )}
    </div>
    </>
  );
}

/** Chép chữ vào bộ nhớ tạm. Máy chặn clipboard thì dùng cách cũ qua ô chữ ẩn. */
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch { return false; }
}

export async function shareInvite(code: string, family: string) {
  const url = `${location.origin}/?join=${code}`;
  const text = `Vào ${family} trên Sweet Home với mình nhé. Mã nhà: ${code}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Sweet Home', text, url }); return; } catch (e) {
      // Tự đóng bảng chia sẻ thì thôi; máy không cho chia sẻ thì chép lời mời.
      if ((e as Error).name === 'AbortError') return;
    }
  }
  toast(await copyText(`${text}\n${url}`) ? 'Đã chép lời mời, dán vào Zalo gửi nhà nhé' : `Mã nhà: ${code}`);
}

export async function copyCode(code: string) {
  toast(await copyText(code) ? `Đã chép mã ${code}` : `Mã nhà: ${code}`);
}

function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`opt ${on ? 'on' : ''}`} onClick={onClick}>{children}</button>;
}

/** Câu hỏi gõ từng chữ; gõ xong các đáp án hiện lên lần lượt với tiếng "bụp" nhẹ. */
function Ask({ q, sub, echo, typed, onTyped, fast, children, footer }: {
  q: string; sub?: string; echo?: string | false; typed: boolean; onTyped: () => void; fast?: boolean; children?: React.ReactNode; footer?: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <>
      <div className="center">
        <h1 className="q"><Typed text={q} onDone={onTyped} /></h1>
        {sub && <p className={`sub ${typed ? (fast ? 'quick-in' : 'slow-in') : 'reserve'}`}>{sub}</p>}
        <div className="options">{items.map((c, i) => <div key={i} className={typed ? (fast ? 'quick-in' : 'slow-in') : 'reserve'} style={{ animationDelay: fast ? undefined : `${i * 130}ms`, width: '100%', display: 'flex', justifyContent: 'center' }}>{c}</div>)}</div>
        <div className="echo">{echo && <span className="slow-in" key={echo} style={{ animationDelay: '300ms' }}>{echo}</span>}</div>
      </div>
      <div className={fast ? 'quick-in' : 'slow-in'} key={String(typed)} style={{ display: 'flex', flexDirection: 'column', minHeight: 56, animationDelay: fast ? undefined : "350ms" }}>{typed && footer}</div>
    </>
  );
}

/** Nền cánh đồng cỏ lau cho cả phần hỏi đầu: ảnh đứng yên, vài hạt lấp lánh nhấp nháy. */
const SPARKS: Array<[number, number, number]> = [[12, 22, 0], [78, 14, 1.4], [64, 31, 2.6], [22, 47, 0.8], [88, 52, 3.2], [40, 63, 1.9], [9, 72, 2.9], [70, 70, 0.4], [52, 84, 3.6], [30, 90, 1.1],
  [46, 18, 2.2], [33, 36, 3.9], [84, 38, 0.6], [58, 58, 2.9], [16, 82, 1.7], [90, 86, 4.3]];
function Meadow() {
  return <div className="meadow" aria-hidden>{SPARKS.map(([x, y, d], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />)}</div>;
}

/** Khung chấm chỉ ở màn chào, tách từ ảnh mẫu: dải trên và dải dưới bám mép màn, hai hoa văn bên theo khung 9:16 ở giữa. Ảnh tĩnh, chỉ hiện dần. */
function HelloFrame() {
  return (
    <div className="hello-frame" aria-hidden>
      <img className="orn-band top" src="/art/orn-top.png" alt="" />
      <img className="orn-band bot" src="/art/orn-bottom.png" alt="" />
      <div className="ref-box">
        <img className="orn-s l" src="/art/orn-side-l.png" alt="" />
        <img className="orn-s r" src="/art/orn-side-r.png" alt="" />
      </div>
    </div>
  );
}

/** "chào mừng về nhà" trượt vào từ bên trái, chữ "bạn" từ bên phải, rồi đứng yên với quầng sáng thở nhẹ. */
function Welcome() {
  return (
    <div className="welcome ref-box" role="img" aria-label="Chào mừng về nhà, bạn">
      <i className="wl-glow" />
      <img className="wl-bfly" src="/art/orn-butterfly.png" alt="" />
      <div className="wl-left"><span><span>chào mừng</span><span>về nhà</span></span></div>
      <div className="wl-right">bạn</div>
    </div>
  );
}
