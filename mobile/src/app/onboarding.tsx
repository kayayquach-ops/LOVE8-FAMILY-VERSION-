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
type Step = 'hello' | 'who' | 'kid' | 'birthday' | 'photo' | 'age' | 'seen' | 'q1' | 'q2' | 'story';
const HELLO_W = 320;
const STEPS: Step[] = ['hello', 'who', 'kid', 'birthday', 'photo', 'age', 'seen', 'q1', 'q2', 'story'];

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
  const child = kid === 'Con gái' ? 'con gái' : kid === 'Con trai' ? 'con trai' : 'các con';
  const idx = STEPS.indexOf(step);
  const next = () => { tapSound(); setStep(STEPS[idx + 1]); };
  const back = () => (step === 'story' && page > 0 ? setPage(page - 1) : idx > 0 && setStep(STEPS[idx - 1]));
  const answer = (k: string, v: string) => setAnswers({ ...answers, [k]: v });

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
    'Lâu đến mức không nhớ nữa': 'Không sao. Mình bắt đầu lại từ hôm nay.',
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
        <Ask key="kid" title={parent ? `${self} đang nhớ con trai hay con gái?` : 'Bạn là con trai hay con gái của bố mẹ?'}>
          {(parent ? ['Con trai', 'Con gái', 'Cả hai đứa'] : ['Con trai', 'Con gái']).map((k) => (
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
        <Ask key="seen" title={parent ? `Lần cuối ${self.toLowerCase()} được ôm ${child} là khi nào?` : 'Lần cuối bạn được ôm bố mẹ là khi nào?'}
          echo={answers.seen ? seenEcho[answers.seen] : undefined}
          footer={answers.seen ? <Button label="Tiếp" onPress={next} /> : undefined}>
          {Object.keys(seenEcho).map((k) => <Option key={k} label={k} on={answers.seen === k} onPress={() => answer('seen', k)} />)}
        </Ask>
      )}

      {step === 'q1' && (
        <Ask key="q1" title={parent ? `Hồi bé, ${child} thích ăn món gì nhất?` : 'Món gì ở nhà mà bạn nhớ nhất?'}
          echo={answers.food ? (parent ? 'Món ấy, chắc đến giờ con vẫn nhớ vị.' : `Lần tới gọi về, thử hỏi mẹ cách nấu ${answers.food.toLowerCase()} nhé.`) : undefined}
          footer={answers.food ? <Button label="Tiếp" onPress={next} /> : undefined}>
          {(parent ? ['Trứng rán', 'Canh rau ngót', 'Chè đỗ đen', 'Bánh mì buổi sáng'] : ['Canh chua', 'Cá kho', 'Bát cháo hành lúc ốm', 'Cơm rang buổi sáng']).map((k) => (
            <Option key={k} label={k} on={answers.food === k} onPress={() => answer('food', k)} />
          ))}
        </Ask>
      )}

      {step === 'q2' && (
        <Ask key="q2" title={parent ? `Điều ${self.toLowerCase()} muốn nói với ${child} mà chưa nói?` : 'Lần gần nhất bạn nói “con nhớ bố mẹ” là khi nào?'}
          echo={answers.unsaid ? (parent ? 'Homeletter sẽ giữ câu ấy, chờ lúc hợp để con được nghe.' : 'Có những câu khó nói thành lời. Đôi khi một tấm ảnh nói thay được.') : undefined}
          footer={answers.unsaid ? <Button label="Tiếp" onPress={next} /> : undefined}>
          {(parent ? [`${self} tự hào về con`, 'Nhớ ăn uống cho đủ', 'Mệt thì cứ về nhà'] : ['Hôm qua', 'Lâu lắm rồi', 'Chưa bao giờ nói thành lời']).map((k) => (
            <Option key={k} label={k} on={answers.unsaid === k} onPress={() => answer('unsaid', k)} />
          ))}
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
