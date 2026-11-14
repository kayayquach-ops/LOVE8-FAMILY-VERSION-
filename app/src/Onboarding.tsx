import { useEffect, useRef, useState } from 'react';
import { api, fromGoogle, googlePending, startGoogle, token } from './api';
import { CityPicker } from './CityPicker';
import { getLang, LANGS, rememberLang, setLang, t, useLang } from './i18n';
import { fileName, type Recording } from './media';
import { cityOf, type Role } from './shared';
import { sfx, startMusic, stopMusic, tapSoft } from './sound';
import { Doodle, Icon, LuckyStar, SKIP_EVENT, toast, Typed } from './ui';
import { VoiceNote } from './VoiceNote';
import './onboarding.css';

// home: bước dựng nhà (tạo nhà mới, vào nhà bằng mã, Google). family: đặt tên nhà sau khi chọn tạo nhà mới.
type Step = 'hello' | 'role' | 'kid' | 'name' | 'dob' | 'city' | 'seen' | 'hug' | 'food' | 'love' | 'voice' | 'unsaid' | 'story' | 'home' | 'family' | 'code' | 'invite';
const FLOW: Step[] = ['hello', 'role', 'kid', 'name', 'dob', 'city', 'seen', 'hug', 'food', 'love', 'voice', 'unsaid', 'story', 'home'];

// Bấm Google ở bước dựng nhà thì cả trang sang Google rồi tải lại: giữ tạm câu trả lời trong máy (cả câu thu âm) để quay về đúng bước dựng nhà.
// Chỉ đọc lại khi máy này đang dở một lượt Google; tạo nhà, vào nhà xong hay huỷ Google thì xoá.
type Draft = { at: number; role: Role | null; kid: Kid | ''; name: string; city: string; dob: { d: string; m: string; y: string }; a: Record<string, string>; wantHug: boolean | null; voice?: { data: string; seconds: number } };
const DRAFT = 'sh-ob-draft';
function readDraft(): Draft | null {
  try {
    const d: Draft | null = JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
    return d && Date.now() - d.at < 2 * 3600e3 ? d : null;
  } catch { return null; }
}
const clearDraft = () => { try { localStorage.removeItem(DRAFT); } catch { /* bỏ qua */ } };
async function saveDraft(d: Omit<Draft, 'at' | 'voice'>, voice: Recording | null) {
  const data = voice ? await new Promise<string | null>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => res(null);
    r.readAsDataURL(voice.blob);
  }) : null;
  const put = (x: Draft) => localStorage.setItem(DRAFT, JSON.stringify(x));
  // Máy hết chỗ thì bỏ câu thu âm, vẫn giữ câu trả lời.
  try { put({ ...d, at: Date.now(), ...(data && voice ? { voice: { data, seconds: voice.seconds } } : {}) }); } catch { try { put({ ...d, at: Date.now() }); } catch { /* bỏ qua */ } }
}
function draftVoice(d: Draft | null): Recording | null {
  if (!d?.voice) return null;
  try {
    const [head, b64] = d.voice.data.split(',');
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], { type: head.match(/^data:([^;,]+)/)?.[1] ?? '' });
    return { blob, seconds: d.voice.seconds, url: URL.createObjectURL(blob) };
  } catch { return null; }
}

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
  // Đi Google rồi quay về thì link mời đã rời thanh địa chỉ: lấy lại mã nhà đã giữ cùng phiên Google.
  const [invite] = useState(() => new URLSearchParams(location.search).get('join') ?? googlePending.get()?.join ?? '');
  // Quay về từ Google đã bấm ở bước dựng nhà: lấy lại câu trả lời, vào thẳng bước dựng nhà.
  const [draft] = useState(() => (googlePending.get()?.intent === 'signin' ? readDraft() : null));
  const [step, setStep] = useState<Step>(draft ? 'home' : 'hello');
  const stepRef = useRef(step);
  stepRef.current = step;
  const [role, setRole] = useState<Role | null>(draft?.role ?? null);
  const [kid, setKid] = useState<Kid | ''>(draft?.kid ?? '');
  const [name, setName] = useState(draft?.name ?? '');
  const [city, setCity] = useState(draft?.city ?? '');
  const [dob, setDob] = useState(draft?.dob ?? { d: '', m: '', y: '' });
  const [a, setA] = useState<Record<string, string>>(draft?.a ?? {});
  const [wantHug, setWantHug] = useState<boolean | null>(draft?.wantHug ?? null);
  // Câu "thương" đầu tiên bằng giọng mình: chỉ giữ trong máy, tạo nhà xong mới gửi lên.
  const [voice, setVoice] = useState<Recording | null>(() => draftVoice(draft));
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

  // Đăng nhập Google: máy chủ chưa đặt GOOGLE_CLIENT_ID thì không có nút. gName: tài khoản chưa có nhà, tên lấy từ Google.
  const [gOn, setGOn] = useState(false);
  const [gBusy, setGBusy] = useState(false);
  const [gName, setGName] = useState<string | null>(null);
  // Google xong ở cửa sổ khác (Safari) mà không phải app đã bấm: nhắc quay lại app trên Màn hình chính.
  const [gBack] = useState(() => fromGoogle && !googlePending.get());
  const resuming = useRef(false);
  const gNameRef = useRef<string | null>(null);
  useEffect(() => {
    api.google().then((r) => setGOn(r.enabled)).catch(() => {});
    // Quay về từ Google (trang tải lại, hoặc app trên Màn hình chính hiện lại sau khi Google mở ở cửa sổ khác): hỏi máy chủ kết quả.
    const resume = async () => {
      const p = googlePending.get();
      if (!p || p.intent !== 'signin' || resuming.current) return;
      resuming.current = true;
      try {
        const r = await api.googleFinish(p);
        if (r.status === 'signin') {
          googlePending.clear();
          clearDraft();
          token.set(r.token);
          rememberLang();
          sfx('arrive');
          return onDone();
        }
        if (r.status === 'cancel') { googlePending.clear(); clearDraft(); }
        if (r.status === 'new') {
          // Giữ phiên Google để tạo nhà hoặc vào nhà xong thì nối luôn.
          const first = gNameRef.current === null;
          gNameRef.current = r.name ?? '';
          setGName(gNameRef.current);
          if (first) {
            // Bấm Google ở màn chào: đi tiếp phần làm quen, tên lấy từ Google. Bấm ở bước dựng nhà: giữ tên đã gõ, ở lại bước dựng nhà.
            const atStart = stepRef.current !== 'hello';
            setName((n) => (n.trim() ? n : gNameRef.current ?? ''));
            setStep((s) => (s === 'hello' ? 'role' : s));
            toast(t(atStart ? 'onboarding.google.newHome' : 'onboarding.google.new'));
          }
        }
      } catch (e) {
        googlePending.clear();
        clearDraft();
        // Phiên cũ đã hết hạn từ lâu thì bỏ lặng lẽ; vừa quay về thì báo.
        if (Date.now() - p.at < 16 * 60e3) toast((e as Error).message);
      } finally {
        resuming.current = false;
      }
    };
    void resume();
    const onShow = () => { if (document.visibilityState === 'visible') void resume(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  const google = async () => {
    if (gBusy) return;
    sfx('button', true);
    setGBusy(true);
    try {
      if (step === 'hello') clearDraft();
      else await saveDraft({ role, kid, name, city, dob, a, wantHug }, voice);
      await startGoogle('signin', invite || undefined);
    } catch (e) { toast((e as Error).message); setGBusy(false); }
  };
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
    setStep(step === 'code' || step === 'family' ? 'home' : FLOW[Math.max(0, FLOW.indexOf(step) - 1)]);
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
      // Vào bằng Google mà chưa có nhà: gửi kèm phiên Google, máy chủ nối tài khoản theo danh tính đã xác minh.
      const gp = gName !== null ? googlePending.get() : null;
      const body = { name: name.trim(), role: role!, city, lang: getLang(), intro: { ...a, kid, ...(wantHug === null ? {} : { wantHug }), loveVoice: !!voice },
        ...(gp?.intent === 'signin' ? { google: { state: gp.state, bind: gp.bind } } : {}) };
      const r = join ? await api.join({ ...body, code: code.trim() }) : await api.create({ ...body, family: familyName.trim() || t('onboarding.home.default') });
      token.set(r.token);
      clearDraft();
      // Phiên Google hết hạn giữa chừng (làm quen quá lâu) hay tài khoản vừa bị nối ở máy khác: vẫn vào nhà, nhắc nối lại sau.
      if (gName !== null) { googlePending.clear(); if (r.google !== true) toast(t('onboarding.google.linkLater')); }
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
          <div className="hello-hint" style={gOn ? { paddingBottom: 70 } : undefined}>
            {gBack ? t('onboarding.google.back') : inviteName ? t('onboarding.hello.invited', { family: inviteName }) : t('onboarding.hello.tap')}
          </div>
        </button>
        {gOn && (
          <button className="hello-google" disabled={gBusy} onClick={google}
            style={{ position: 'fixed', zIndex: 30, left: '50%', bottom: 'calc(var(--safe-bottom) + 22px)', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10,
              minHeight: 46, padding: '0 22px', borderRadius: 999, border: '1px solid rgba(59,62,52,.16)', background: 'rgba(255,255,255,.82)', color: '#3B3E34',
              font: 'inherit', fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,.08)', opacity: 0, animation: 'slowFade 1.6s 1.8s forwards' }}>
            <GoogleMark /> {t('onboarding.hello.google')}
          </button>
        )}
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
  const done = FLOW.indexOf(step === 'code' || step === 'family' || step === 'invite' ? 'home' : step);
  const T = { typed, onTyped: setTyped, fast };

  // Từ câu hỏi đầu tiên trở đi: nền giấy trắng của bộ giao diện mới (màn chào vẫn là cánh đồng).
  return (
    <div className="screen ob" onPointerDownCapture={skip}>
      {step === 'role' && hint && <div className="skip-hint" aria-hidden onAnimationStart={() => { try { localStorage.setItem('hl-skip-hint', '1'); } catch { /* bỏ qua */ } }}>{t('onboarding.skipHint')}</div>}
      <div className="top">
        {step !== 'invite' ? <button className="icon-btn" onClick={back} aria-label={t('common.back')}><Icon name="back" /></button> : <span style={{ width: 44 }} />}
        <div className="progress"><i style={{ transform: `scaleX(${done / (FLOW.length - 1)})` }} /></div>
        <span style={{ width: 44 }} />
      </div>

      {step === 'role' && (
        <Ask key="role" q={t('onboarding.role.q')} {...T}>
          {(['bo', 'me', 'con'] as const).map((k) => (
            <Opt key={k} on={role === k} onClick={() => { tapSoft(); setRole(k); setName(gName || (k === 'bo' ? t('role.bo') : k === 'me' ? t('role.me') : '')); later(next, 250); }}>{t(`onboarding.role.opt.${k}`)}</Opt>
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

      {step === 'home' && (
        <BuildHome role={role} name={name} city={city} invite={!!invite} inviteName={inviteName} busy={busy}
          google={gOn && gName === null} gBusy={gBusy} onGoogle={google}
          onCreate={() => go('family')} onCode={() => go('code')} onJoin={() => void finish(true)} />
      )}

      {step === 'family' && (
        <Ask key="family" q={t('onboarding.home.q')} sub={t('onboarding.home.sub')} {...T}
          footer={<button className="btn" disabled={busy || !familyName.trim()} onClick={() => finish(false)}>{t('onboarding.home.create')}</button>}>
          <input className="field fade" value={familyName} maxLength={40} onChange={(e) => setFamily(e.target.value)} />
        </Ask>
      )}

      {step === 'code' && (
        <Ask key="code" q={t('onboarding.code.q')} sub={t('onboarding.code.sub')} {...T}
          footer={<button className="btn" disabled={busy || !/^\d{6,7}$/.test(code.trim())} onClick={() => finish(true)}>{t('onboarding.join.btn')}</button>}>
          {/* Không đặt maxLength: dán cả câu mời ("Mã nhà: 123456") vẫn lấy được đủ 6 số. */}
          <input className="field ob-code fade" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => { const found = e.target.value.match(/\d{6,7}/g); setCode(found ? found[found.length - 1] : e.target.value.replace(/\D/g, '').slice(0, 7)); }} placeholder="1234567" />
        </Ask>
      )}

      {step === 'invite' && made && (
        <Ask key="invite" q={t('onboarding.invite.q')} {...T}
          footer={<>
            <button className="btn" onClick={() => { sfx('button', true); void shareInvite(made.code, made.family); }}><Icon name="share" size={20} /> {t('invite.send')}</button>
            <button className="link" onClick={onDone}>{t('onboarding.invite.skip')}</button>
          </>}>
          <div className="panel ob-invite fade">
            <img className="invite-logo" src="/logo-mark.png" alt="" />
            <div className="muted">{t('onboarding.invite.codeOf', { family: made.family })}</div>
            <button className="code" onClick={() => void copyCode(made.code)} aria-label={t('invite.codeAria', { code: made.code })}>{made.code}</button>
            <div className="code-hint">{t('invite.codeHint')}</div>
            <div className="muted">{t('onboarding.invite.how')}</div>
          </div>
        </Ask>
      )}
    </div>
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
  // Link nằm ngay trong lời nhắn: Zalo, Messenger, iMessage hay bỏ `url` riêng khi có `text`, khiến người nhận chỉ thấy mã mà không có link.
  const text = `${t('invite.text', { family, code })}\n${url}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Sweet Home', text }); return; } catch (e) {
      // Tự đóng bảng chia sẻ thì thôi; máy không cho chia sẻ thì chép lời mời.
      if ((e as Error).name === 'AbortError') return;
    }
  }
  toast(await copyText(text) ? t('invite.copied') : t('invite.code', { code }));
}

export async function copyCode(code: string) {
  toast(await copyText(code) ? t('invite.codeCopied', { code }) : t('invite.code', { code }));
}

/** Chữ G nhiều màu của Google, đúng mẫu nút đăng nhập Google. */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ flex: 'none' }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`opt ${on ? 'on' : ''}`} onClick={onClick}>{children}</button>;
}

/** Câu hỏi hiện từng chữ; xong thì các đáp án hiện lên lần lượt với tiếng "bụp" nhẹ. Câu hỏi là tiêu đề chữ thường, cụm trong *...* viết tay mực tím. */
function Ask({ q, sub, echo, typed, onTyped, fast, children, footer }: {
  q: string; sub?: string; echo?: string | false; typed: boolean; onTyped: () => void; fast?: boolean; children?: React.ReactNode; footer?: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <>
      <div className="center">
        <h1 className="q display"><Line text={q} onDone={onTyped} /></h1>
        {sub && <p className={`sub ${typed ? (fast ? 'quick-in' : 'slow-in') : 'reserve'}`}>{sub}</p>}
        <div className="options">{items.map((c, i) => <div key={i} className={`ob-item ${typed ? (fast ? 'quick-in' : 'slow-in') : 'reserve'}`} style={{ animationDelay: fast ? undefined : `${i * 130}ms` }}>{c}</div>)}</div>
        <div className="echo">{echo && <span className="slow-in" key={echo} style={{ animationDelay: '300ms' }}>{echo}</span>}</div>
      </div>
      <div className={`ob-foot ${fast ? 'quick-in' : 'slow-in'}`} key={String(typed)} style={{ animationDelay: fast ? undefined : '350ms' }}>{typed && footer}</div>
    </>
  );
}

/** Tách câu thành từng từ để hiện dần; cụm trong *...* đánh dấu viết tay. Dấu câu dính liền sau cụm (như "đâu*?") vẫn chung một từ. */
type Piece = { s: string; hand: boolean };
function words(text: string): Piece[][] {
  const out: Piece[][] = [];
  let glue = false;
  text.split('*').forEach((seg, i) => {
    seg.split(' ').forEach((s, j) => {
      if (j > 0) glue = false;
      if (!s) return;
      if (glue && out.length) out[out.length - 1].push({ s, hand: i % 2 === 1 });
      else out.push([{ s, hand: i % 2 === 1 }]);
      glue = true;
    });
  });
  return out;
}

/** Như Typed ở ui.tsx (hiện từng từ, tiếng lật trang, chạm là hiện đủ), thêm cụm viết tay. */
function Line({ text, onDone }: { text: string; onDone?: () => void }) {
  const list = words(text);
  const [done, setDone] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    setDone(false);
    fired.current = false;
    sfx('reveal');
    // Safari iOS đôi khi kẹt chữ ở trạng thái mờ, nên hết giờ thì ép về rõ hẳn.
    const clear = setTimeout(() => setDone(true), 600 + list.length * 220 + 1700);
    const early = setTimeout(() => { fired.current = true; onDone?.(); }, 600 + (list.length - 1) * 220 + 700);
    const skip = () => {
      clearTimeout(clear); clearTimeout(early);
      setDone(true);
      if (!fired.current) { fired.current = true; onDone?.(); }
    };
    window.addEventListener(SKIP_EVENT, skip);
    return () => { clearTimeout(clear); clearTimeout(early); window.removeEventListener(SKIP_EVENT, skip); };
  }, [text]);
  return (
    <span key={text}>
      {list.map((w, i) => (
        <span key={i} className={done ? 'word done' : 'word'} style={{ animationDelay: `${600 + i * 220}ms` }}>
          {w.map((p, j) => (p.hand ? <span key={j} className="hand">{p.s}</span> : p.s))}{i < list.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

/** Tiêu đề đứng yên, cụm trong *...* viết tay mực tím. */
function Hand({ text }: { text: string }) {
  return <>{text.split('*').map((s, i) => (i % 2 ? <span key={i} className="hand">{s}</span> : s))}</>;
}

// Bước dựng nhà, theo màn "tạo nhóm đầu tiên" của YOPE: trên là ba tấm giấy màu bay vào (chưa có ảnh nhà thật nên không giả ảnh),
// giờ thật ở nơi mỗi người, hai tin nhắn, máy bay giấy từ Việt Nam sang Hàn; dưới là tiêu đề và các nút.
const VN_TZ = 'Asia/Ho_Chi_Minh';
const KR_TZ = 'Asia/Seoul';
// Nét máy bay giấy, cùng nét với Doodle "plane" ở ui.tsx, đặt ở cuối đường bay.
const PLANE = 'M2.8 11.2 20.9 3.6 15.6 20.3 11.4 13.1Z M11.4 13.1 20.9 3.6 M11.4 13.1 10.9 18.4 13.4 16.2';
// Cảnh bay vào chỉ chạy lần đầu; quay lại từ màn nhập mã thì đứng yên.
let startPlayed = false;

/** Giờ 24 tiếng ở múi giờ tz, dạng 19:40. */
function hhmm(now: Date, tz: string) {
  try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(now); }
  catch { return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; }
}

/** Giờ hiện tại, cập nhật đúng lúc sang phút mới. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id = 0;
    const tick = () => { setNow(new Date()); id = window.setTimeout(tick, 60e3 - (Date.now() % 60e3) + 50); };
    id = window.setTimeout(tick, 60e3 - (Date.now() % 60e3) + 50);
    return () => clearTimeout(id);
  }, []);
  return now;
}

function BuildHome({ role, name, city, invite, inviteName, busy, google, gBusy, onGoogle, onCreate, onCode, onJoin }: {
  role: Role | null; name: string; city: string; invite: boolean; inviteName: string; busy: boolean;
  google: boolean; gBusy: boolean; onGoogle: () => void; onCreate: () => void; onCode: () => void; onJoin: () => void;
}) {
  const [play] = useState(() => !startPlayed);
  useEffect(() => { startPlayed = true; }, []);
  const now = useNow();
  const parent = role === 'bo' || role === 'me';
  // Nơi mình chọn ở câu hỏi thành phố nằm đúng phía mình; phía kia chưa biết thì lấy Hải Phòng (bố mẹ) và Busan (con).
  const mine = cityOf(city);
  const home = parent && mine ? mine : { name: t('onboarding.start.cityHome'), tz: VN_TZ };
  const away = !parent && mine ? mine : { name: t('onboarding.start.cityAway'), tz: KR_TZ };
  const me = name.trim();
  const pName = parent ? me || t(role === 'bo' ? 'onboarding.start.dad' : 'onboarding.start.mom') : t('onboarding.start.mom');
  const kName = parent ? t('onboarding.start.kid') : me || t('onboarding.start.kid');
  const pColor = role === 'bo' ? 'var(--s-bien)' : 'var(--s-hong)';
  const kColor = 'var(--s-tim)';
  // Tấm của con đổi theo giờ thật bên đó: tối thì trăng trên giấy xanh đêm, ngày thì mặt trời trên giấy xanh trời.
  const h = parseInt(hhmm(now, away.tz), 10);
  const night = !(h >= 6 && h < 18);
  return (
    <div className={`ob-start${play ? ' ob-play' : ''}`}>
      <div className="ob-collage" aria-hidden>
        <div className="ob-stage">
          <div className="ob-card a">
            <span className="ob-who"><LuckyStar color={pColor} /><i>{pName}</i></span>
            <Doodle name="bowl" className="ob-art" />
            <span className="ob-stamp"><b>{hhmm(now, home.tz)}</b><span>{home.name}</span></span>
          </div>
          <div className={`ob-card b${night ? ' night' : ''}`}>
            <span className="ob-who"><LuckyStar color={kColor} /><i>{kName}</i></span>
            <Doodle name={night ? 'moon' : 'sun'} className="ob-art" />
            {night && <><Doodle name="star" className="ob-tw t1" /><Doodle name="star" className="ob-tw t2" /></>}
            <span className="ob-stamp"><b>{hhmm(now, away.tz)}</b><span>{away.name}</span></span>
          </div>
          {/* Tấm thứ ba là ngôi nhà sắp dựng: tên nhà viết tay mực tím dưới hình nhà. */}
          <div className="ob-card c">
            <Doodle name="house" className="ob-art" />
            <Doodle name="heart" className="ob-heart" />
            <span className="ob-note">{inviteName || t('onboarding.home.default')}</span>
          </div>
          <svg className="ob-plane" viewBox="0 0 120 90">
            <g filter="url(#hl-wob)">
              <path className="ob-route" d="M8 80C20 40 60 20 100 18" />
              <path d={PLANE} transform="translate(92 4)" />
            </g>
          </svg>
          <div className={`ob-bub one${parent ? ' me' : ''}`}><LuckyStar color={pColor} /><i>{t('onboarding.start.ask')}</i></div>
          <div className={`ob-bub two${parent ? '' : ' me'}`}><LuckyStar color={kColor} /><i>{t(role === 'bo' ? 'onboarding.start.replyDad' : 'onboarding.start.replyMom')}</i></div>
          <div className="ob-streak"><Doodle name="heartFill" wobble={false} />{t('onboarding.start.streak', { n: 36 })}</div>
        </div>
      </div>
      <div className="ob-body">
        <h1 className="display ob-title">
          <Hand text={invite ? (inviteName ? t('onboarding.join.q', { family: inviteName }) : t('onboarding.join.qHome')) : t('onboarding.start.title')} />
        </h1>
        <p className="ob-lede">{t('onboarding.start.sub')}</p>
        {invite ? (
          <button className="btn" disabled={busy} onClick={onJoin}>{t('onboarding.join.btn')}</button>
        ) : (
          <>
            <button className="btn" disabled={busy} onClick={onCreate}>{t('onboarding.start.create')}</button>
            <div className="ob-or">{t('onboarding.start.or')}</div>
            <button className="btn line" disabled={busy} onClick={onCode}>{t('onboarding.start.code')}</button>
          </>
        )}
        {google && <button className="ob-google" disabled={gBusy} onClick={onGoogle}><GoogleMark size={18} />{t('onboarding.start.google')}</button>}
      </div>
    </div>
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
