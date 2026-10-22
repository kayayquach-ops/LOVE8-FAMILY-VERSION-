import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import type { FactKind, Question } from '@/data/types';
import { localTimeFor } from '@/lib/format';
import { callName, isMinor, lettersFrom, member } from '@/lib/selectors';
import { gentleAsk } from '@/services/ai';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';
import { FilmCard, LetterCard } from './Feed';
import { Ionicons } from './Icon';
import { Avatar, FadeIn, GradientButton, memberTone, PhotoTile, SectionHeader, T, Tap, type IconName } from './ui';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const FACTS: Record<FactKind, { icon: IconName; label: (name: string) => string }> = {
  'thich': { icon: 'heart', label: (n) => `${n} thích` },
  'lo': { icon: 'cloudy', label: (n) => `${n} lo` },
  'tu-hao': { icon: 'ribbon', label: (n) => `${n} tự hào` },
  'mong': { icon: 'star', label: (n) => `${n} mong` },
  'ky-niem': { icon: 'time', label: () => 'Kỷ niệm' },
};

/** Trang "Hiểu về một người": gọi, nhắn, hỏi khéo, vài điều đã hiểu, và phần xem thêm. */
export function PersonView({ id }: { id: string }) {
  const { state } = useApp();
  const [more, setMore] = useState(false);
  const target = member(state, id);
  if (!target) return null;
  const name = cap(callName(target));
  const tone = memberTone(state.family.members, id) ?? colors.primary;
  const letters = lettersFrom(state, id);
  // Chỉ vài điều gần nhất, bấm vào để nghe lại đúng đoạn đó.
  const facts = letters.flatMap((l) => l.facts.map((f) => ({ ...f, letterId: l.id }))).slice(0, 4);
  const quizCount = letters.reduce((n, l) => n + (l.quiz?.length ?? 0), 0);
  const films = state.films.filter((f) => f.speakerId === id);
  const hasMore = quizCount > 0 || letters.length > 0 || films.length > 0;

  return (
    <View>
      <FadeIn>
        <PhotoTile seed={`hero-${id}`} tone={tone} autoHeight>
          <View style={{ padding: 20, gap: 14 }}>
            <View style={styles.row}>
              <Avatar name={target.name} uri={target.avatarUri} size={64} />
              <View style={{ flex: 1 }}>
                <T variant="display" color={colors.white}>{name}</T>
                <T variant="small" color="rgba(255,255,255,0.9)">{target.city}, bây giờ là {localTimeFor(target.country)}</T>
              </View>
            </View>
            <View style={styles.row}>
              <Tap onPress={() => router.push({ pathname: '/room', params: { with: id } })} label={`Gọi video ${callName(target)}`} scaleTo={0.95} style={{ flex: 1 }}>
                <View style={[styles.pillButton, { backgroundColor: colors.white }]}>
                  <Ionicons name="videocam" size={18} color={colors.ink} />
                  <T variant="small" weight="semibold" color={colors.ink}>Gọi video</T>
                </View>
              </Tap>
              <Tap onPress={() => router.push({ pathname: '/chat', params: { voice: '1', to: id } })} label={`Gửi lời nhắn bằng giọng cho ${callName(target)}`} scaleTo={0.95} style={{ flex: 1 }}>
                <View style={[styles.pillButton, { backgroundColor: 'rgba(0,0,0,0.28)' }]}>
                  <Ionicons name="mic" size={18} color={colors.white} />
                  <T variant="small" weight="semibold" color={colors.white}>Gửi lời nhắn bằng giọng</T>
                </View>
              </Tap>
            </View>
          </View>
        </PhotoTile>
      </FadeIn>

      <AskBox targetId={id} />

      <SectionHeader title="Điều đã hiểu" />
      {facts.length ? (
        <View style={styles.card}>
          {facts.map((f) => (
            <Tap key={f.text} onPress={() => router.push(`/letter/${f.letterId}`)} label={f.text} scaleTo={0.98}>
              <View style={styles.fact}>
                <Ionicons name={FACTS[f.kind].icon} size={17} color={colors.accentText} style={{ marginTop: 3 }} />
                <View style={{ flex: 1 }}>
                  <T variant="small" weight="semibold" color={colors.accentText}>{FACTS[f.kind].label(name)}</T>
                  <T variant="body">{f.text}</T>
                </View>
              </View>
            </Tap>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <T variant="body" color={colors.inkSoft}>Chưa có gì ở đây. Gọi {callName(target)} một cuộc, điều {callName(target)} kể sẽ hiện lại cho bạn.</T>
        </View>
      )}

      {hasMore && (
        <>
          <Tap onPress={() => setMore(!more)} label="Xem thêm" scaleTo={0.98} style={{ marginTop: 20 }}>
            <View style={[styles.row, { minHeight: 48 }]}>
              <T variant="body" weight="semibold" color={colors.accentText} style={{ flex: 1 }}>Xem thêm</T>
              <Ionicons name={more ? 'chevron-up' : 'chevron-down'} size={18} color={colors.accentText} />
            </View>
          </Tap>
          {more && (
            <View style={{ gap: 10 }}>
              {quizCount > 0 && (
                <Tap onPress={() => router.push(`/quiz/${id}`)} label="Chơi đố vui" scaleTo={0.98}>
                  <View style={[styles.card, styles.row]}>
                    <View style={[styles.quizIcon, { backgroundColor: tone }]}><Ionicons name="help" size={26} color={colors.white} /></View>
                    <View style={{ flex: 1 }}>
                      <T variant="h3">Bạn hiểu {callName(target)} đến đâu?</T>
                      <T variant="small" color={colors.muted}>{quizCount} câu đố</T>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                  </View>
                </Tap>
              )}
              {letters.map((l) => <LetterCard key={l.id} letter={l} compact />)}
              {films.map((f) => <FilmCard key={f.id} film={f} />)}
            </View>
          )}
        </>
      )}
    </View>
  );
}

/** Một ô hỏi: gõ điều muốn biết; bật "Giấu tên" thì Homeletter hỏi vòng, tắt thì nhắn hộ có tên. */
function AskBox({ targetId }: { targetId: string }) {
  const { state, dispatch } = useApp();
  const target = member(state, targetId)!;
  const self = member(state, state.meId)!;
  const minor = isMinor(target);
  const [hidden, setHidden] = useState(!minor);
  const [text, setText] = useState('');
  const mine = state.questions.filter((q) => q.fromId === state.meId && q.toId === targetId && q.status === 'pending');
  const kind: Question['kind'] = hidden && !minor ? 'hidden' : 'message';

  async function add() {
    const t = text.trim();
    if (!t) return;
    setText('');
    const gentle = kind === 'hidden' ? await gentleAsk(t, self, target) : undefined;
    dispatch({ type: 'addQuestion', toId: targetId, text: t, kind, gentle });
  }

  return (
    <View style={[styles.card, { marginTop: 12, gap: 12 }]}>
      <View style={styles.inputRow}>
        <TextInput value={text} onChangeText={setText} placeholder={`Muốn hỏi ${callName(target)} điều gì?`}
          placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Nội dung" onSubmitEditing={add} />
        <GradientButton icon="add" size={48} label="Thêm" onPress={add} />
      </View>
      {!minor && (
        <View style={styles.row}>
          <T variant="body" weight="medium" style={{ flex: 1 }}>Giấu tên</T>
          <Switch value={hidden} onValueChange={setHidden} trackColor={{ true: colors.ink, false: colors.toneDeep }} thumbColor={colors.white}
            accessibilityLabel="Giấu tên" {...({ activeThumbColor: colors.white } as object)} />
        </View>
      )}
      {mine.map((q) => (
        <View key={q.id} style={styles.item}>
          <Ionicons name={q.kind === 'hidden' ? 'lock-closed' : 'chatbubble-ellipses'} size={16} color={colors.accentText} style={{ marginTop: 3 }} />
          <T variant="body" style={{ flex: 1 }}>{q.text}</T>
          <Tap onPress={() => dispatch({ type: 'removeQuestion', id: q.id })} label="Bỏ" scaleTo={0.85}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Tap>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, gap: 16 },
  pillButton: { height: 48, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  fact: { flexDirection: 'row', gap: 10 },
  quizIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, height: 50, borderRadius: radius.pill, backgroundColor: colors.toneDeep, paddingHorizontal: 18,
    fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
  },
  item: { flexDirection: 'row', gap: 10, backgroundColor: colors.toneDeep, borderRadius: radius.md, padding: 14 },
});
