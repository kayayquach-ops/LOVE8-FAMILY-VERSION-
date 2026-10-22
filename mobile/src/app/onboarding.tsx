import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@/components/Icon';
import { Mesh } from '@/components/Mesh';
import { Button, FadeIn, Screen, T, Tap } from '@/components/ui';
import { inviteMessage } from '@/lib/family';
import { keySound, tapSound } from '@/lib/tap';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

type Who = 'bo' | 'me' | 'con';
type Step = 'hello' | 'who' | 'kid' | 'birthday' | 'photo' | 'age' | 'seen' | 'hug' | 'q1' | 'love' | 'q2' | 'story';
const HELLO_W = 320;
// Ngày sinh, ảnh, tuổi để sau trong mục Gia đình; lúc mới vào chỉ trò chuyện.
const STEPS: Step[] = ['hello', 'who', 'kid', 'seen', 'hug', 'q1', 'love', 'q2', 'story'];

const ART = {
  room: require('../../assets/art/story-room.png'),
  home: require('../../assets/art/story-home.png'),
  letter: require('../../assets/art/story-letter.png'),
};

// Chuyện vì sao có Homeletter, kể chậm từng trang.
const STORY: Array<{ art: keyof typeof ART; lines: string[] }> = [
  { art: 'room', lines: ['Homeletter bắt đầu từ một căn phòng trọ nhỏ ở Hàn Quốc.', 'Một bạn du học sinh, ngày đi học, tối đi làm thêm. Về đến phòng thì ở nhà đã ngủ.'] },
  { art: 'room', lines: ['Nhớ bố mẹ lắm. Nhưng mỗi lần gọi về, bạn ấy chỉ nói được “con vẫn ổn”.', 'Chưa giúp được gì nhiều cho nhà, nên càng ngại kể chuyện mình.'] },
  { art: 'home', lines: ['Ở quê, bố mẹ cũng vậy. Nhớ con, mà sợ hỏi nhiều con lại lo.', 'Hai đầu nỗi nhớ, ai cũng giữ cho riêng mình.'] },
  { art: 'letter', lines: ['Rồi bạn ấy nghĩ: giá mỗi tuần có một lá thư đi về nhà.', 'Không cần dài. Một bữa cơm, một câu hỏi, một giọng nói.'] },
  { art: 'letter', lines: ['Homeletter là lá thư ấy.', 'Cho bạn, và cho những người đang chờ bạn ở nhà.'] },
];

// Vào app như một cuộc trò chuyện ngắn: bạn là ai, sinh ngày nào, lâu chưa gặp nhau, rồi nghe kể vì sao có Homeletter.
export default function Onboarding() {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState<Step>('hello');
  const [who, setWho] = useState<Who | null>(null);
  const [kid, setKid] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [age, setAge] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);

  const parent = who === 'bo' || who === 'me';
  // Cách xưng trong câu hỏi: bố mẹ thì "Bố"/"Mẹ", con thì "bạn".
  const self = who === 'bo' ? 'Bố' : who === 'me' ? 'Mẹ' : 'Bạn';
  const child = 'con';
  const idx = STEPS.indexOf(step);
  const next = () => { tapSound(); setStep(STEPS[idx + 1]); };
  const back = () => (step === 'story' && page > 0 ? setPage(page - 1) : idx > 0 && setStep(STEPS[idx - 1]));
  const answer = (k: string, v: string) => setAnswers({ ...answers, [k]: v });
  // Chọn xong thì để lời đáp hiện một lúc rồi tự sang câu sau, khỏi phải bấm Tiếp.
  const choose = (k: string, v: string) => { answer(k, v); setTimeout(next, 2200); };

  const d = Number(day), m = Number(month);
  const validDate = d >= 1 && d <= 31 && m >= 1 && m <= 12;

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled) setPhoto(res.assets[0].uri);
  }

  function enter() {
    // Bản demo gắn mỗi vai với một người trong gia đình mẫu.
    const memberId = who === 'bo' ? 'bo' : who === 'me' ? 'me' : kid === 'Con trai' ? 'nam' : 'lan';
    dispatch({
      type: 'chooseMember', memberId, parentMode: parent, avatarUri: photo,
      birthday: validDate ? { day: d, month: m } : undefined,
      intro: { ...answers, kid, age },
    });
    if (router.canDismiss()) router.dismissAll();
    router.replace('/home');
  }

  const seenEcho: Record<string, string> = {
    'Mới tuần trước': 'Vậy là vòng tay vẫn còn ấm.',
    'Vài tháng rồi': 'Vài tháng, đủ để nhà có thêm bao chuyện chưa kể.',
    'Hơn một năm': parent ? 'Hơn một năm. Chắc con cũng đang đếm ngày về.' : 'Hơn một năm. Chắc ở nhà đã đếm qua mấy cái Tết.',
    'Ở cùng nhà mà ít nói chuyện': 'Gần mà xa. Mình bắt đầu lại từ một câu hỏi nhỏ nhé.',
  };
  const loveEcho: Record<string, string> = parent ? {
    'Nói thường xuyên': 'Con may mắn lắm đấy.',
    'Thỉnh thoảng': 'Thỉnh thoảng thôi cũng đủ ấm cả tuần.',
    'Chưa nói thành lời bao giờ': 'Bố mẹ nhiều khi thương mà không nói. Con vẫn biết mà.',
  } : {
    'Nói thường xuyên': 'Bố mẹ chắc vui lắm mỗi lần nghe.',
    'Thỉnh thoảng': 'Lần tới, nói thêm một lần nữa nhé.',
    'Chưa nói thành lời bao giờ': 'Không sao. Có những câu cần thời gian. Homeletter sẽ giúp bạn.',
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Mesh vivid={step === 'hello'} />
    <Screen edges={['top', 'bottom']} scroll={false} bg="transparent">
      {step === 'hello' ? <Hello onStart={next} /> : <>
      <View style={styles.top}>
        {idx > 0 ? (
          <Tap onPress={back} label="Quay lại" scaleTo={0.9}>
            <View style={styles.back}><Ionicons name="chevron-back" size={22} color={colors.ink} /></View>
          </Tap>
        ) : <View style={styles.back} />}
        <View style={styles.track}><View style={[styles.fill, { width: `${((idx + 1) / STEPS.length) * 100}%` }]} /></View>
        <View style={styles.back} />
      </View>

      {step === 'who' && (
        <Ask key="who" title="Bạn là ai trong gia đình?">
          {([['bo', 'Là bố'], ['me', 'Là mẹ'], ['con', 'Là con']] as const).map(([k, label]) => (
            <Option key={k} label={label} on={who === k} onPress={() => { setWho(k); setKid(''); next(); }} />
          ))}
        </Ask>
      )}

      {step === 'kid' && (
        <Ask key="kid" title={parent ? `Con của ${self.toLowerCase()} là trai hay gái?` : 'Bạn là con trai hay con gái của bố mẹ?'}>
          {(parent ? ['Con trai', 'Con gái', 'Cả trai lẫn gái'] : ['Con trai', 'Con gái']).map((k) => (
            <Option key={k} label={k} on={kid === k} onPress={() => { setKid(k); next(); }} />
          ))}
        </Ask>
      )}

      {step === 'birthday' && (
        <Ask key="birthday" title={`${self} sinh ngày nào?`} sub={parent ? `Để ${child} nhớ ngày này.` : 'Để bố mẹ không quên chúc mừng bạn.'}
          footer={<><Button label="Tiếp" disabled={!validDate} onPress={next} /><Skip onPress={next} /></>}>
          <View style={styles.dateRow}>
            <Num value={day} onChange={setDay} placeholder="Ngày" max={2} />
            <T variant="h1" color={colors.faint}>/</T>
            <Num value={month} onChange={setMonth} placeholder="Tháng" max={2} />
          </View>
        </Ask>
      )}

      {step === 'photo' && (
        <Ask key="photo" title={`Một tấm ảnh của ${parent ? self.toLowerCase() : 'bạn'}`}
          sub={parent ? `Để ${child} nhìn thấy ${self.toLowerCase()} mỗi lần mở app.` : 'Ảnh bây giờ cũng được. Bố mẹ sẽ thấy nó đầu tiên mỗi khi mở app.'}
          footer={<><Button label={photo ? 'Tiếp' : 'Chọn ảnh'} onPress={photo ? next : pick} /><Skip onPress={next} /></>}>
          <Tap onPress={pick} label="Chọn ảnh" scaleTo={0.96} style={{ alignSelf: 'center', marginTop: 12 }}>
            {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : (
              <View style={[styles.photo, styles.photoEmpty]}><Ionicons name="camera-outline" size={34} color={colors.muted} /></View>
            )}
          </Tap>
        </Ask>
      )}

      {step === 'age' && (
        <Ask key="age" title={`Năm nay ${self.toLowerCase()} bao nhiêu tuổi rồi?`}
          echo={Number(age) > 0 ? (parent ? `${age} tuổi. Bao nhiêu năm ấy, phần nhiều là để lo cho ${child}.` : `${age} tuổi. Trong mắt bố mẹ, chắc vẫn là đứa trẻ ngày nào.`) : undefined}
          footer={<><Button label="Tiếp" disabled={!(Number(age) > 0)} onPress={next} /><Skip onPress={next} /></>}>
          <View style={styles.dateRow}><Num value={age} onChange={setAge} placeholder="Tuổi" max={3} /></View>
        </Ask>
      )}

      {step === 'seen' && (
        <Ask key="seen" title={parent ? `Bao lâu rồi ${self.toLowerCase()} chưa gặp con?` : 'Bao lâu rồi bạn chưa về nhà?'}
          echo={answers.seen ? seenEcho[answers.seen] : undefined}>
          {Object.keys(seenEcho).map((k) => <Option key={k} label={k} on={answers.seen === k} onPress={() => !answers.seen && choose('seen', k)} />)}
        </Ask>
      )}

      {step === 'hug' && (
        <Ask key="hug" title={parent ? 'Nhớ con thì ôm một cái.' : 'Nhớ bố mẹ thì ôm một cái.'} sub="Giữ ngón tay vào vòng tròn"
          echo={answers.hug ? (parent ? 'Con sẽ biết là có người đang ôm mình từ xa.' : 'Ở nhà sẽ biết là bạn đang nhớ.') : undefined}>
          <Hold onDone={() => choose('hug', 'yes')} />
        </Ask>
      )}

      {step === 'love' && (
        <Ask key="love" title={parent ? `${self} đã bao giờ nói “${self.toLowerCase()} thương con” chưa?` : 'Bạn đã bao giờ nói “con thương bố mẹ” chưa?'}
          echo={answers.love ? loveEcho[answers.love] : undefined}>
          {Object.keys(loveEcho).map((k) => <Option key={k} label={k} on={answers.love === k} onPress={() => !answers.love && choose('love', k)} />)}
        </Ask>
      )}

      {step === 'q1' && (
        <Ask key="q1" title={parent ? `${self} còn nhớ con thích ăn món gì không?` : 'Món gì ở nhà mà bạn nhớ nhất?'}
          echo={(answers.food ?? '').trim().length > 1 ? (parent ? 'Món ấy, chắc đến giờ con vẫn nhớ vị.' : 'Lần tới gọi về, thử hỏi mẹ cách nấu món ấy nhé.') : undefined}
          footer={<><Button label="Tiếp" disabled={!(answers.food ?? '').trim()} onPress={next} /><Skip onPress={next} /></>}>
          <Write value={answers.food ?? ''} onChange={(v) => answer('food', v)} placeholder={parent ? 'Ví dụ: trứng rán, canh chua' : 'Ví dụ: canh chua của mẹ'} />
        </Ask>
      )}

      {step === 'q2' && (
        <Ask key="q2" title={parent ? `Điều ${self.toLowerCase()} muốn nói với ${child} mà chưa nói?` : 'Có điều gì bạn muốn nói với bố mẹ mà chưa nói?'}
          echo={(answers.unsaid ?? '').trim().length > 1 ? (parent ? 'Homeletter sẽ giữ câu ấy, chờ lúc hợp để con được nghe.' : 'Có những câu khó nói thành lời. Homeletter sẽ giữ giúp bạn.') : undefined}
          footer={<><Button label="Tiếp" disabled={!(answers.unsaid ?? '').trim()} onPress={next} /><Skip onPress={next} /></>}>
          <Write value={answers.unsaid ?? ''} onChange={(v) => answer('unsaid', v)} placeholder="Viết ở đây, chỉ mình bạn thấy" multiline />
        </Ask>
      )}

      {step === 'story' && (
        <FadeIn key={`story-${page}`} style={{ flex: 1 }}>
          <Image source={ART[STORY[page].art]} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={{ gap: 14, marginTop: 8 }}>
            {STORY[page].lines.map((l, i) => (
              <T key={l} variant={i === 0 ? 'h2' : 'body'} weight={i === 0 ? 'medium' : 'regular'} color={i === 0 ? colors.ink : colors.inkSoft}
                style={i === 0 ? styles.storyLead : styles.storyLine}>{l}</T>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          {page < STORY.length - 1 ? (
            <Button label="Tiếp" onPress={() => setPage(page + 1)} />
          ) : (
            <>
              <Button label="Vào nhà" icon="home-outline" onPress={enter} />
              <Button label="Mời cả nhà vào" icon="share-outline" variant="ghost" style={{ marginTop: 10 }}
                onPress={() => Share.share({ message: inviteMessage(state.family.name, state.family.inviteCode) })} />
            </>
          )}
        </FadeIn>
      )}
      </>}
    </Screen>
    </View>
  );
}

/** Màn chào: chữ "xin chào" viết tay hiện dần từ trái sang phải, rồi một dòng nhỏ mời chạm. */
function Hello({ onStart }: { onStart: () => void }) {
  // Chạy bằng hẹn giờ thay vì khung hình, để chữ vẫn hiện đủ cả khi máy yếu hoặc tab chạy nền.
  const [p, setP] = useState(0);
  useEffect(() => {
    if (p >= 1) return;
    const t = setTimeout(() => setP(Math.min(1, p + 0.025)), p === 0 ? 500 : 40);
    return () => clearTimeout(t);
  }, [p]);
  const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  return (
    <Pressable onPress={onStart} accessibilityRole="button" accessibilityLabel="Xin chào. Chạm để bắt đầu" style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* Khung cố định, mở dần từ trái sang để chữ như đang được viết ra. */}
        <View style={{ width: HELLO_W }}>
          <View style={{ width: HELLO_W * eased, overflow: 'hidden' }}>
            <Text style={[styles.hello, { width: HELLO_W }]} numberOfLines={1}>xin chào</Text>
          </View>
        </View>
      </View>
      <View style={{ alignItems: 'center', paddingBottom: 28, minHeight: 52 }}>
        {p >= 1 && <FadeIn><T variant="body" style={styles.hint}>Chạm để bắt đầu</T></FadeIn>}
      </View>
    </Pressable>
  );
}

/** Một câu hỏi: chữ to, nhiều khoảng trắng, các lựa chọn bên dưới, lời đáp nhẹ khi đã chọn. */
function Ask({ title, sub, echo, footer, children }: { title: string; sub?: string; echo?: string; footer?: React.ReactNode; children: React.ReactNode }) {
  // Câu hỏi hiện từng chữ như đang gõ, gõ xong thì các đáp án mới hiện lên.
  const [n, setN] = useState(0);
  const typed = n >= title.length;
  useEffect(() => {
    if (typed) return;
    const t = setTimeout(() => {
      setN(n + 1);
      if (title[n] !== ' ' && n % 2 === 0) keySound();
    }, n === 0 ? 350 : 55);
    return () => clearTimeout(t);
  }, [n, typed]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View>
          <T variant="h1" center style={[styles.question, { opacity: 0 }]}>{title}</T>
          <T variant="h1" center style={[styles.question, StyleSheet.absoluteFill]}>{title.slice(0, n)}</T>
        </View>
        {typed && sub && <FadeIn><T variant="body" center style={styles.sub}>{sub}</T></FadeIn>}
        <View style={{ gap: 12, marginTop: 36, minHeight: 60 }}>
          {typed && (Array.isArray(children) ? children : [children]).map((c, i) => <FadeIn key={i} delay={120 + i * 110}>{c}</FadeIn>)}
        </View>
        <View style={{ minHeight: 84, justifyContent: 'center' }}>
          {echo && <FadeIn key={echo}><T variant="body" center style={styles.echo}>{echo}</T></FadeIn>}
        </View>
      </View>
      {typed && footer}
    </View>
  );
}

function Option({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Tap onPress={() => { tapSound(); onPress(); }} label={label} selected={on} scaleTo={0.97}>
      <View style={[styles.option, on && styles.optionOn]}>
        <T variant="body" center color={on ? colors.white : colors.ink} style={styles.optionText}>{label}</T>
      </View>
    </Tap>
  );
}

function Num({ value, onChange, placeholder, max }: { value: string; onChange: (v: string) => void; placeholder: string; max: number }) {
  return (
    <TextInput value={value} onChangeText={(v) => onChange(v.replace(/\D/g, ''))} placeholder={placeholder} placeholderTextColor={colors.faint}
      keyboardType="number-pad" maxLength={max} accessibilityLabel={placeholder} style={styles.num} />
  );
}

/** Giữ ngón tay để "ôm": vòng tròn đầy dần trong khoảng 1,6 giây, rung nhẹ theo từng nhịp. */
function Hold({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    if (p >= 1) return;
    if (!holding) { if (p > 0) { const t = setTimeout(() => setP(Math.max(0, p - 0.08)), 30); return () => clearTimeout(t); } return; }
    const t = setTimeout(() => {
      const np = Math.min(1, p + 0.02);
      if (Math.floor(np * 4) > Math.floor(p * 4)) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setP(np);
      if (np >= 1) { tapSound(); onDone(); }
    }, 32);
    return () => clearTimeout(t);
  }, [p, holding]);
  return (
    <Pressable onPressIn={() => setHolding(true)} onPressOut={() => setHolding(false)} accessibilityRole="button" accessibilityLabel="Giữ để ôm"
      style={{ alignSelf: 'center' }}>
      <View style={styles.hold}>
        <View style={[styles.holdFill, { transform: [{ scale: 0.25 + p * 0.75 }], opacity: 0.25 + p * 0.75 }]} />
        <Ionicons name={p >= 1 ? 'heart' : 'heart-outline'} size={40} color={p >= 1 ? colors.white : colors.primary} />
      </View>
    </Pressable>
  );
}

function Write({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean }) {
  return (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.placeholder} multiline={multiline}
      maxLength={multiline ? 200 : 60} accessibilityLabel={placeholder} style={[styles.write, multiline && { minHeight: 120, textAlignVertical: 'top' }]} />
  );
}

function Skip({ onPress }: { onPress: () => void }) {
  return (
    <Tap onPress={onPress} label="Để sau" scaleTo={0.95} style={{ alignSelf: 'center', marginTop: 6 }}>
      <View style={{ minHeight: 44, justifyContent: 'center' }}><T variant="small" weight="medium" color={colors.muted}>Để sau</T></View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.toneDeep, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.ink },
  hello: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 56, lineHeight: 76, letterSpacing: -1.5, color: '#4A3B2E' },
  hint: { fontFamily: fonts.regular, fontSize: 16, color: '#7A6754' },
  question: { fontFamily: fonts.regular, fontSize: 30, lineHeight: 42, letterSpacing: -0.3, color: '#2B2723' },
  sub: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 27, color: colors.muted, marginTop: 12 },
  echo: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 28, color: colors.accentText, paddingHorizontal: 8 },
  option: {
    alignSelf: 'center', width: '82%', maxWidth: 360, minHeight: 56, justifyContent: 'center', paddingHorizontal: 20,
    borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(43,39,35,0.14)', backgroundColor: 'rgba(255,255,255,0.55)',
  },
  hold: { width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(154,90,68,0.35)', backgroundColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  holdFill: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: colors.primary },
  write: {
    alignSelf: 'center', width: '86%', maxWidth: 380, minHeight: 56, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(43,39,35,0.14)',
    backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 20, paddingVertical: 16, fontFamily: fonts.regular, fontSize: 17, lineHeight: 26, color: colors.ink, textAlign: 'center',
  },
  optionOn: { backgroundColor: '#2B2723', borderColor: '#2B2723' },
  optionText: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 26 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  num: {
    width: 110, height: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white,
    textAlign: 'center', fontFamily: fonts.medium, fontSize: 28, color: colors.ink,
  },
  photo: { width: 168, height: 168, borderRadius: 84 },
  photoEmpty: { borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  art: { width: '100%', height: 260, marginTop: 20 },
  storyLead: { fontFamily: fonts.regular, fontSize: 25, lineHeight: 36, color: '#2B2723' },
  storyLine: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 28, color: colors.inkSoft },
});
