import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { FactKind, Question } from '@/data/types';
import { localTimeFor } from '@/lib/format';
import { callName, isMinor, lettersFrom, member, nextCallLabel } from '@/lib/selectors';
import { gentleAsk, hiddenSuggestions, messageSuggestions, planCall, type CallStep } from '@/services/ai';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';
import { FilmCard, LetterCard } from './Feed';
import { Ionicons } from './Icon';
import { Avatar, Chip, FadeIn, GradientButton, memberTone, PhotoTile, SectionHeader, T, Tap, type IconName } from './ui';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const FACTS: Record<FactKind, { icon: IconName; label: (name: string) => string }> = {
  'thich': { icon: 'heart', label: (n) => `${n} thích` },
  'lo': { icon: 'cloudy', label: (n) => `${n} lo` },
  'tu-hao': { icon: 'ribbon', label: (n) => `${n} tự hào` },
  'mong': { icon: 'star', label: (n) => `${n} mong` },
  'ky-niem': { icon: 'time', label: () => 'Kỷ niệm' },
};

const STEP_ICON: Record<CallStep['kind'], IconName> = {
  opener: 'mic', checkin: 'image', message: 'chatbubble-ellipses', hidden: 'lock-closed', followup: 'return-down-forward',
  theme: 'book', mood: 'leaf', closing: 'sunny', handoff: 'call',
};

/** Trang "Hiểu về một người": cuộc gọi tới của Homeletter, điều đã hiểu, đố vui, thư và video. */
export function PersonView({ id }: { id: string }) {
  const { state } = useApp();
  const target = member(state, id);
  if (!target) return null;
  const name = cap(callName(target));
  const letters = lettersFrom(state, id);
  const facts = letters.flatMap((l) => l.facts.map((f) => ({ ...f, letterId: l.id })));
  const quizCount = letters.reduce((n, l) => n + (l.quiz?.length ?? 0), 0);
  const films = state.films.filter((f) => f.speakerId === id);

  return (
    <View>
      <FadeIn>
        <PhotoTile seed={`hero-${id}`} tone={memberTone(state.family.members, id)} autoHeight>
          <View style={{ padding: 20, gap: 14 }}>
            <View style={styles.row}>
              <Avatar name={target.name} uri={target.avatarUri} size={64} />
              <View style={{ flex: 1 }}>
                <T variant="display" color={colors.white}>Hiểu {callName(target)} hơn</T>
                <T variant="small" color="rgba(255,255,255,0.9)">{target.city}, bây giờ là {localTimeFor(target.country)}</T>
              </View>
            </View>
            <View style={styles.row}>
              <Tap onPress={() => router.push({ pathname: '/room', params: { with: id } })} label={`Gọi video ${callName(target)}`} scaleTo={0.95} style={{ flex: 1 }}>
                <View style={[styles.pillButton, { backgroundColor: colors.white }]}>
                  <Ionicons name="videocam" size={18} color={colors.black} />
                  <T variant="small" weight="semibold" color={colors.black}>Gọi video</T>
                </View>
              </Tap>
              <Tap onPress={() => router.push({ pathname: '/chat', params: { voice: '1', to: id } })} label={`Ghi âm gửi ${callName(target)}`} scaleTo={0.95} style={{ flex: 1 }}>
                <View style={[styles.pillButton, { backgroundColor: 'rgba(0,0,0,0.28)' }]}>
                  <Ionicons name="mic" size={18} color={colors.white} />
                  <T variant="small" weight="semibold" color={colors.white}>Gửi lời nhắn</T>
                </View>
              </Tap>
            </View>
          </View>
        </PhotoTile>
      </FadeIn>

      <NextCall targetId={id} />

      <SectionHeader title={`Điều bạn đã hiểu về ${callName(target)}`} />
      {facts.length ? (
        <View style={styles.card}>
          {(Object.keys(FACTS) as FactKind[]).map((kind) => {
            const list = facts.filter((f) => f.kind === kind);
            if (!list.length) return null;
            return (
              <View key={kind} style={{ gap: 8 }}>
                <View style={styles.row}>
                  <Ionicons name={FACTS[kind].icon} size={17} color={colors.accentText} />
                  <T variant="small" weight="semibold" color={colors.accentText}>{FACTS[kind].label(name)}</T>
                </View>
                {list.map((f) => (
                  <Tap key={f.text} onPress={() => router.push(`/letter/${f.letterId}`)} label={f.text} scaleTo={0.98}>
                    <T variant="body">{f.text}</T>
                  </Tap>
                ))}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.card}>
          <T variant="body" color={colors.inkSoft}>Sau cuộc gọi đầu tiên, những điều bạn hiểu thêm về {callName(target)} sẽ hiện ở đây.</T>
        </View>
      )}

      {quizCount > 0 && (
        <Tap onPress={() => router.push(`/quiz/${id}`)} label="Chơi đố vui" scaleTo={0.98} style={{ marginTop: 12 }}>
          <View style={[styles.card, styles.row]}>
            <View style={styles.quizIcon}><Ionicons name="help" size={26} color={colors.white} /></View>
            <View style={{ flex: 1 }}>
              <T variant="h3">Bạn hiểu {callName(target)} đến đâu?</T>
              <T variant="small" color={colors.muted}>{quizCount} câu đố từ chính lời {callName(target)} kể</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </View>
        </Tap>
      )}

      {letters.length > 0 && (
        <>
          <SectionHeader title={`Homeletter từ ${callName(target)}`} />
          <View style={{ gap: 10 }}>{letters.map((l) => <LetterCard key={l.id} letter={l} compact />)}</View>
        </>
      )}
      {films.length > 0 && (
        <>
          <SectionHeader title="Video từ kho nhà mình" />
          <View style={{ gap: 10 }}>{films.map((f) => <FilmCard key={f.id} film={f} />)}</View>
        </>
      )}
    </View>
  );
}

/** Cuộc gọi tới: mình gửi gắm lời nào, hỏi khéo điều gì, và xem trước Homeletter sẽ hỏi gì, vì sao. */
function NextCall({ targetId }: { targetId: string }) {
  const { state, dispatch } = useApp();
  const target = member(state, targetId)!;
  const self = member(state, state.meId)!;
  const minor = isMinor(target);
  const [kind, setKind] = useState<Question['kind']>(minor ? 'message' : 'hidden');
  const [text, setText] = useState('');
  const [showPlan, setShowPlan] = useState(false);
  const mine = state.questions.filter((q) => q.fromId === state.meId && q.toId === targetId && q.status === 'pending');
  const suggestions = kind === 'hidden' ? hiddenSuggestions(target) : messageSuggestions(target);

  async function add(body: string) {
    const t = body.trim();
    if (!t) return;
    setText('');
    const gentle = kind === 'hidden' ? await gentleAsk(t, self, target) : undefined;
    dispatch({ type: 'addQuestion', toId: targetId, text: t, kind, gentle });
  }

  return (
    <View style={[styles.card, { marginTop: 12, gap: 14 }]}>
      <View style={styles.row}>
        <View style={styles.callIcon}><Ionicons name="call" size={20} color={colors.white} /></View>
        <View style={{ flex: 1 }}>
          <T variant="h3">Homeletter gọi {callName(target)}</T>
          <T variant="small" color={colors.muted}>{nextCallLabel(state)} giờ của {callName(target)}, khoảng 10 phút</T>
        </View>
      </View>

      <View style={styles.segment}>
        {(['hidden', 'message'] as const).map((k) => {
          const on = kind === k;
          const off = k === 'hidden' && minor;
          return (
            <Tap key={k} role="tab" selected={on} disabled={off} onPress={() => setKind(k)} scaleTo={0.96} style={{ flex: 1 }}
              label={k === 'hidden' ? 'Hỏi khéo, giấu tên' : 'Nhắn hộ, nói rõ tên'}>
              <View style={[styles.segItem, on && { backgroundColor: colors.white }, off && { opacity: 0.4 }]}>
                <Ionicons name={k === 'hidden' ? 'lock-closed' : 'chatbubble-ellipses'} size={15} color={on ? colors.black : colors.inkSoft} />
                <T variant="small" weight="semibold" color={on ? colors.black : colors.inkSoft}>{k === 'hidden' ? 'Hỏi khéo' : 'Nhắn hộ'}</T>
              </View>
            </Tap>
          );
        })}
      </View>
      <T variant="small" color={colors.inkSoft}>
        {kind === 'hidden'
          ? `Điều bạn muốn biết. Homeletter hỏi vòng qua kỷ niệm để ${callName(target)} tự kể, không nói ai hỏi.`
          : `Lời bạn muốn gửi. Homeletter nói rõ là của bạn.`}
        {minor ? ` ${target.roleLabel} chưa đủ 18 tuổi nên Homeletter không nhận câu hỏi giấu kín.` : ''}
      </T>
      <View style={styles.inputRow}>
        <TextInput value={text} onChangeText={setText} placeholder={kind === 'hidden' ? `Bạn muốn biết điều gì về ${callName(target)}?` : `Nhắn ${callName(target)}...`}
          placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Nội dung" onSubmitEditing={() => add(text)} />
        <GradientButton icon="add" size={48} label="Thêm" onPress={() => add(text)} />
      </View>
      <View style={styles.chips}>
        {suggestions.map((s) => <Chip key={s} label={s} onPress={() => add(s)} />)}
      </View>

      {mine.length > 0 && (
        <View style={{ gap: 8 }}>
          {mine.map((q) => (
            <View key={q.id} style={styles.item}>
              <Ionicons name={q.kind === 'hidden' ? 'lock-closed' : 'chatbubble-ellipses'} size={16} color={colors.accentText} style={{ marginTop: 3 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="body">{q.text}</T>
                {q.kind === 'hidden' && (
                  <T variant="small" color={colors.muted}>{q.gentle ? `Homeletter sẽ hỏi: “${q.gentle}”` : 'Homeletter sẽ hỏi khéo, không nói ai hỏi'}</T>
                )}
              </View>
              <Tap onPress={() => dispatch({ type: 'removeQuestion', id: q.id })} label="Bỏ" scaleTo={0.85}>
                <Ionicons name="close" size={20} color={colors.muted} />
              </Tap>
            </View>
          ))}
        </View>
      )}

      <Tap onPress={() => setShowPlan(!showPlan)} label="Xem Homeletter sẽ hỏi gì" scaleTo={0.98}>
        <View style={[styles.row, { minHeight: 44 }]}>
          <T variant="small" weight="semibold" color={colors.accentText} style={{ flex: 1 }}>
            {showPlan ? 'Ẩn kế hoạch cuộc gọi' : 'Xem Homeletter sẽ hỏi gì, và vì sao'}
          </T>
          <Ionicons name={showPlan ? 'chevron-up' : 'chevron-down'} size={18} color={colors.accentText} />
        </View>
      </Tap>
      {showPlan && <CallPlan targetId={targetId} />}
    </View>
  );
}

export function CallPlan({ targetId }: { targetId: string }) {
  const { state } = useApp();
  const steps = planCall(state, targetId);
  return (
    <View style={{ gap: 12 }}>
      {steps.map((s, i) => (
        <View key={i} style={styles.step}>
          <View style={styles.stepIcon}><Ionicons name={STEP_ICON[s.kind]} size={15} color={colors.ink} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <T variant="body" weight={s.mine ? 'semibold' : 'regular'}>{s.text}</T>
            <T variant="small" color={colors.muted}>Vì sao: {s.why}</T>
          </View>
        </View>
      ))}
      <T variant="caption" weight="regular" color={colors.muted}>
        Trong cuộc gọi, Homeletter nghe câu trả lời rồi mới hỏi tiếp. Thấy người kể ngại thì chuyển sang chuyện nhẹ hơn; câu nào cũng bỏ qua được.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, gap: 16 },
  pillButton: { height: 48, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  callIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  quizIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#8A5DA6', alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.toneDeep, borderRadius: radius.pill, padding: 4 },
  segItem: { height: 42, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, height: 50, borderRadius: radius.pill, backgroundColor: colors.toneDeep, paddingHorizontal: 18,
    fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { flexDirection: 'row', gap: 10, backgroundColor: colors.toneDeep, borderRadius: radius.md, padding: 14 },
  step: { flexDirection: 'row', gap: 12 },
  stepIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.toneDeep, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
