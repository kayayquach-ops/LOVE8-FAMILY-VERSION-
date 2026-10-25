import { useEffect, useRef, useState } from 'react';
import { api, token } from './api';
import { CityPicker } from './CityPicker';
import { getLang, LANGS, rememberLang, setLang, t, useLang } from './i18n';
import { fileName, type Recording } from './media';
import type { Role } from './shared';
import { sfx, startMusic, stopMusic, tapSoft } from './sound';
import { Icon, SKIP_EVENT, toast, Typed } from './ui';
import { VoiceNote } from './VoiceNote';
import './onboarding.css';

type Step = 'hello' | 'role' | 'kid' | 'name' | 'dob' | 'city' | 'seen' | 'hug' | 'food' | 'love' | 'voice' | 'unsaid' | 'story' | 'home' | 'code' | 'invite';
const FLOW: Step[] = ['hello', 'role', 'kid', 'name', 'dob', 'city', 'seen', 'hug', 'food', 'love', 'voice', 'unsaid', 'story', 'home'];

// Chuyện vì sao có Sweet Home, kể chậm từng trang (chữ ở khoá onboarding.story.<trang>.a / .b).
const STORY = ['room', 'room', 'home', 'letter', 'letter'] as const;
const storyLine = (page: number, part: 'a' | 'b') => t(`onboarding.story.${(page + 1) as 1 | 2 | 3 | 4 | 5}.${part}`);

// Đáp án lưu bằng mã ổn định (members.intro); bản cũ lưu nguyên chữ tiếng Việt, máy chủ đọc được cả hai.
const SEEN = ['week', 'months', 'year', 'together'] as const;
const LOVE = ['often', 'sometimes', 'never'] as const;
type Kid = 'son' | 'daughter' | 'both';

// Vào app như một cuộc trò chuyện: bạn là ai, nhớ nhà thế nào, rồi nghe kể vì sao có Sweet Home và vào nhà.
export function Onboarding({ onDone }: { onDone: () => void }) {
  const lang = useLang();
  const invite = new URLSearchParams(location.search).get('join') ?? '';
  const [step, setStep] = useState<Step>('hello');
  const [role, setRole] = useState<Role | null>(null);
  const [kid, setKid] = useState<Kid | ''>('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [dob, setDob] = useState({ d: '', m: '', y: '' });
  const [a, setA] = useState<Record<string, string>>({});
  const [wantHug, setWantHug] = useState<boolean | null>(null);
  // Câu "thương" đầu tiên bằng giọng mình: chỉ giữ trong máy, tạo nhà xong mới gửi lên.
  const [voice, setVoice] = useState<Recording | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [page, setPage] = useState(0);
  // null: chưa sửa, hiện tên nhà mặc định theo ngôn ngữ đang chọn (đổi ngôn ngữ ở màn chào vẫn đúng).
  const [family, setFamily] = useState<string | null>(null);
  const familyName = family ?? t('onboarding.home.default');
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
  const self = t(role === 'bo' ? 'onboarding.self.bo' : role === 'me' ? 'onboarding.self.me' : 'onboarding.self.con');
  const Self = self[0].toUpperCase() + self.slice(1);
  const kids = t(kid === 'both' ? 'onboarding.kids.many' : 'onboarding.kids.one');
  const V = { self, Self, kids };
  // Câu theo vai: bố mẹ một câu, con một câu.
  const R = (k: string) => t(`onboarding.${k}.${parent ? 'parent' : 'child'}` as Parameters<typeof t>[0], V);
  const go = (s: Step) => { sfx('button', true); setStep(s); };
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
    tapSoft();
    setA({ ...a, [k]: v });
    later(() => { choosing.current = false; next(); }, 4200);
  };

  async function finish(join: boolean) {
    setBusy(true);
    try {
      const body = { name: name.trim(), role: role!, city, lang: getLang(), intro: { ...a, kid, ...(wantHug === null ? {} : { wantHug }), loveVoice: !!voice } };
      const r = join ? await api.join({ ...body, code: code.trim() }) : await api.create({ ...body, family: familyName.trim() || t('onboarding.home.default') });
      token.set(r.token);
      // Từ giờ máy này có mã: ghi nhớ ngôn ngữ đang dùng để lần mở sau không bị coi là người cũ của bản tiếng Việt.
      rememberLang();
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
        <button className="screen hello" onClick={() => { sfx('hello'); void startMusic(); setStep('role'); }} aria-label={t('onboarding.hello.aria')}>
          <HelloFrame />
          <div className="hello-top" aria-hidden>
            <div className="hello-brand">sweet home</div>
          </div>
          <Welcome />
          <div className="center" />
          <div className="hello-hint">{inviteName ? t('onboarding.hello.invited', { family: inviteName }) : t('onboarding.hello.tap')}</div>
        </button>
        <div className="hello-lang" role="group" aria-label="Language">
          {LANGS.map((l, i) => (
            <span key={l}>
              {i > 0 && <i aria-hidden>·</i>}
              <button className={l === lang ? 'on' : ''} lang={l} aria-pressed={l === lang} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            </span>
          ))}
        </div>
      </>
    );
  }

  const seenEcho = (k: string) => (k === 'year' ? R('seen.echo.year') : t(`onboarding.seen.echo.${k as 'week' | 'months' | 'together'}`));
  const loveEcho = (k: string) => R(`love.echo.${k}`);

  const dobValid = +dob.d >= 1 && +dob.d <= 31 && +dob.m >= 1 && +dob.m <= 12 && +dob.y >= 1920 && +dob.y <= new Date().getFullYear();
  const dobIso = `${dob.y}-${dob.m.padStart(2, '0')}-${dob.d.padStart(2, '0')}`;
  const done = FLOW.indexOf(step === 'code' || step === 'invite' ? 'home' : step);
  const T = { typed, onTyped: setTyped, fast };

  return (
    <>
    <Meadow />
    <div className="screen" onPointerDownCapture={skip}>
      {step === 'role' && hint && <div className="skip-hint" aria-hidden onAnimationStart={() => { try { localStorage.setItem('hl-skip-hint', '1'); } catch { /* bỏ qua */ } }}>{t('onboarding.skipHint')}</div>}
      <div className="top">
        {step !== 'invite' ? <button className="icon-btn" onClick={back} aria-label={t('common.back')}><Icon name="back" /></button> : <span style={{ width: 44 }} />}
        <div className="progress"><i style={{ width: `${(done / (FLOW.length - 1)) * 100}%` }} /></div>
        <span style={{ width: 44 }} />
      </div>

      {step === 'role' && (
        <Ask key="role" q={t('onboarding.role.q')} {...T}>
          {(['bo', 'me', 'con'] as const).map((k) => (
            <Opt key={k} on={role === k} onClick={() => { tapSoft(); setRole(k); setName(k === 'bo' ? t('role.bo') : k === 'me' ? t('role.me') : ''); later(next, 250); }}>{t(`onboarding.role.opt.${k}`)}</Opt>
          ))}
        </Ask>
      )}

      {step === 'kid' && (
        <Ask key="kid" q={R('kid.q')} {...T}>
          {(parent ? ['son', 'daughter', 'both'] as const : ['son', 'daughter'] as const).map((k) => (
            <Opt key={k} on={kid === k} onClick={() => { tapSoft(); setKid(k); later(next, 250); }}>{t(`onboarding.kid.opt.${k}`)}</Opt>
          ))}
        </Ask>
      )}

      {step === 'name' && (
        <Ask key="name" q={t('onboarding.name.q')} {...T} footer={<button className="btn" disabled={!name.trim()} onClick={next}>{t('common.next')}</button>}>
          <input className="field fade" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={R('name.placeholder')} />
        </Ask>
      )}

      {step === 'dob' && (
        <Ask key="dob" q={t('onboarding.dob.q', V)} sub={R('dob.sub')} {...T}
          footer={<><button className="btn" disabled={!dobValid} onClick={next}>{t('common.next')}</button><button className="link" onClick={next}>{t('common.later')}</button></>}>
          <div className="dob fade">
            <input className="field" inputMode="numeric" maxLength={2} placeholder={t('common.day')} value={dob.d} onChange={(e) => setDob({ ...dob, d: e.target.value.replace(/\D/g, '') })} />
            <input className="field" inputMode="numeric" maxLength={2} placeholder={t('common.month')} value={dob.m} onChange={(e) => setDob({ ...dob, m: e.target.value.replace(/\D/g, '') })} />
            <input className="field" inputMode="numeric" maxLength={4} placeholder={t('common.year')} value={dob.y} onChange={(e) => setDob({ ...dob, y: e.target.value.replace(/\D/g, '') })} style={{ flex: 1.4 }} />
          </div>
        </Ask>
      )}

      {step === 'city' && (
        <Ask key="city" q={t('onboarding.city.q', V)} sub={t('onboarding.city.sub')} {...T}
          footer={<button className="btn" disabled={!city} onClick={next}>{t('common.next')}</button>}>
          <CityPicker value={city} onChange={setCity} />
        </Ask>
      )}

      {step === 'seen' && (
        <Ask key="seen" q={R('seen.q')} echo={a.seen && seenEcho(a.seen)} {...T}>
          {SEEN.map((k) => <Opt key={k} on={a.seen === k} onClick={() => choose('seen', k)}>{t(`onboarding.seen.opt.${k}`)}</Opt>)}
        </Ask>
      )}

      {step === 'hug' && (
        <Ask key="hug" q={R('hug.q')}
          echo={wantHug === true ? R('hug.echo.yes') : wantHug === false ? R('hug.echo.no') : undefined} {...T}>
          <Opt key="yes" on={wantHug === true} onClick={() => { if (wantHug !== null) return; tapSoft(); setWantHug(true); later(next, 4200); }}>{t('onboarding.hug.yes')}</Opt>
          <Opt key="no" on={wantHug === false} onClick={() => { if (wantHug !== null) return; tapSoft(); setWantHug(false); later(next, 4200); }}>{t('onboarding.hug.no')}</Opt>
        </Ask>
      )}

      {step === 'food' && (
        <Ask key="food" q={R('food.q')}
          echo={(a.food ?? '').trim().length > 1 ? R('food.echo') : undefined} {...T}
          footer={<><button className="btn" disabled={!(a.food ?? '').trim()} onClick={next}>{t('common.next')}</button><button className="link" onClick={next}>{t('common.later')}</button></>}>
          <input className="field fade" value={a.food ?? ''} maxLength={60} onChange={(e) => setA({ ...a, food: e.target.value })} placeholder={R('food.placeholder')} />
        </Ask>
      )}

      {step === 'love' && (
        <Ask key="love" q={R('love.q')} echo={a.love && loveEcho(a.love)} {...T}>
          {LOVE.map((k) => <Opt key={k} on={a.love === k} onClick={() => choose('love', k)}>{t(`onboarding.love.opt.${k}`)}</Opt>)}
        </Ask>
      )}

      {step === 'voice' && (
        <Ask key="voice" q={R('voice.q')}
          sub={R('voice.sub')}
          echo={voice ? t('onboarding.voice.kept') : micDenied ? t('onboarding.voice.denied') : undefined} {...T}
          footer={voice
            ? <><button className="btn" onClick={next}>{t('onboarding.voice.keep')}</button><button className="link" onClick={() => { tapSoft(); URL.revokeObjectURL(voice.url); setVoice(null); }}>{t('onboarding.voice.redo')}</button></>
            : <button className="link" onClick={next}>{t('common.later')}</button>}>
          <VoiceNote value={voice} onChange={(r) => { setMicDenied(false); setVoice(r); }} onDenied={() => setMicDenied(true)} />
        </Ask>
      )}

      {step === 'unsaid' && (
        <Ask key="unsaid" q={R('unsaid.q')}
          echo={(a.unsaid ?? '').trim().length > 1 ? R('unsaid.echo') : undefined} {...T}
          footer={<><button className="btn" disabled={!(a.unsaid ?? '').trim()} onClick={next}>{t('common.next')}</button><button className="link" onClick={next}>{t('common.later')}</button></>}>
          <textarea className="field fade" rows={3} value={a.unsaid ?? ''} maxLength={200} onChange={(e) => setA({ ...a, unsaid: e.target.value })} placeholder={t('onboarding.unsaid.placeholder')} />
        </Ask>
      )}

      {step === 'story' && (
        <div key={page} className="center fade" style={{ justifyContent: 'flex-start' }}>
          <img src={`/art/story-${STORY[page]}.png`} alt="" decoding="async"
            onError={(e) => { const el = e.currentTarget; if (!el.dataset.retry) { el.dataset.retry = '1'; el.src = `${el.src.split('?')[0]}?r=${Date.now()}`; } }}
            style={{ width: '100%', aspectRatio: '4 / 3', maxHeight: '36vh', objectFit: 'contain', marginTop: 10 }} />
          <h2 className="story-lead"><Typed text={storyLine(page, 'a')} onDone={setTyped} /></h2>
          <p className={`story-line ${typed ? (fast ? 'quick-in' : 'fade') : 'reserve'}`}>{storyLine(page, 'b')}</p>
          <div style={{ flex: 1 }} />
          <button className={`btn ${typed ? (fast ? 'quick-in' : 'fade') : 'reserve'}`} onClick={() => { sfx('button', true); page < STORY.length - 1 ? setPage(page + 1) : setStep('home'); }}>{page < STORY.length - 1 ? t('common.next') : t('onboarding.story.end')}</button>
        </div>
      )}

      {step === 'home' && (invite ? (
        <Ask key="join" q={inviteName ? t('onboarding.join.q', { family: inviteName }) : t('onboarding.join.qHome')} {...T}
          footer={<button className="btn" disabled={busy} onClick={() => finish(true)}>{t('onboarding.join.btn')}</button>} />
      ) : (
        <Ask key="home" q={t('onboarding.home.q')} sub={t('onboarding.home.sub')} {...T}
          footer={<>
            <button className="btn" disabled={busy || !familyName.trim()} onClick={() => finish(false)}>{t('onboarding.home.create')}</button>
            <button className="link" onClick={() => go('code')}>{t('onboarding.home.haveCode')}</button>
          </>}>
          <input className="field fade" value={familyName} maxLength={40} onChange={(e) => setFamily(e.target.value)} />
        </Ask>
      ))}

      {step === 'code' && (
        <Ask key="code" q={t('onboarding.code.q')} sub={t('onboarding.code.sub')} {...T}
          footer={<button className="btn" disabled={busy || code.trim().length !== 6} onClick={() => finish(true)}>{t('onboarding.join.btn')}</button>}>
          {/* Không đặt maxLength: dán cả câu mời ("Mã nhà: 123456") vẫn lấy được đủ 6 số. */}
          <input className="field fade" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => { const six = e.target.value.match(/\d{6}/g); setCode(six ? six[six.length - 1] : e.target.value.replace(/\D/g, '').slice(0, 6)); }} placeholder="123456" style={{ letterSpacing: 6, fontSize: 24 }} />
        </Ask>
      )}

      {step === 'invite' && made && (
        <Ask key="invite" q={t('onboarding.invite.q')} {...T}
          footer={<>
            <button className="btn" onClick={() => { sfx('button', true); void shareInvite(made.code, made.family); }}><Icon name="share" size={20} /> {t('invite.send')}</button>
            <button className="link" onClick={onDone}>{t('onboarding.invite.skip')}</button>
          </>}>
          <div className="panel fade" style={{ alignSelf: 'center', width: '86%', textAlign: 'center' }}>
            <img className="invite-logo" src="/logo.svg" alt="" />
            <div className="muted">{t('onboarding.invite.codeOf', { family: made.family })}</div>
            <button className="code" onClick={() => void copyCode(made.code)} aria-label={t('invite.codeAria', { code: made.code })}>{made.code}</button>
            <div className="code-hint">{t('invite.codeHint')}</div>
            <div className="muted">{t('onboarding.invite.how')}</div>
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
  const text = t('invite.text', { family, code });
  if (navigator.share) {
    try { await navigator.share({ title: 'Sweet Home', text, url }); return; } catch (e) {
      // Tự đóng bảng chia sẻ thì thôi; máy không cho chia sẻ thì chép lời mời.
      if ((e as Error).name === 'AbortError') return;
    }
  }
  toast(await copyText(`${text}\n${url}`) ? t('invite.copied') : t('invite.code', { code }));
}

export async function copyCode(code: string) {
  toast(await copyText(code) ? t('invite.codeCopied', { code }) : t('invite.code', { code }));
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

/** Mỗi lần mở app: màn "chào mừng về nhà" hiện vài giây (chạm để vào ngay), mờ đi rồi mới vào app. */
export function Greeting({ onDone }: { onDone: () => void }) {
  const [out, setOut] = useState(false);
  const closed = useRef(false);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    setOut(true);
    setTimeout(onDone, 500);
  };
  useEffect(() => {
    const id = setTimeout(close, 3600);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className={`greet${out ? ' out' : ''}`}>
      <Meadow />
      <button className="screen hello" onClick={close} aria-label={t('onboarding.hello.aria')}>
        <HelloFrame />
        <div className="hello-top" aria-hidden><div className="hello-brand">sweet home</div></div>
        <Welcome />
      </button>
    </div>
  );
}

/** "chào mừng về nhà" trượt vào từ bên trái, chữ "bạn" từ bên phải, rồi đứng yên với quầng sáng thở nhẹ. */
function Welcome() {
  return (
    <div className="welcome ref-box" role="img" aria-label={t('onboarding.welcome.aria')}>
      <i className="wl-glow" />
      <img className="wl-bfly" src="/art/orn-butterfly.png" alt="" />
      <div className="wl-left"><span><span>{t('onboarding.welcome.l1')}</span><span>{t('onboarding.welcome.l2')}</span></span></div>
      <div className="wl-right">{t('onboarding.welcome.r')}</div>
    </div>
  );
}
