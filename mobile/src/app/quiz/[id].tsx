import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@/components/Icon';
import { Avatar, BackHeader, Button, Empty, FadeIn, Screen, Steps, T, Tap } from '@/components/ui';
import { callName, lettersFrom, member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

// Đố vui "Bạn hiểu mẹ đến đâu?": câu đố làm từ chính lời mẹ kể. Sai câu nào thì có cớ gọi hỏi mẹ chuyện đó.
export default function Quiz() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useApp();
  const parent = state.settings.parentMode;
  const target = member(state, id ?? '');
  const items = lettersFrom(state, id ?? '').flatMap((l) => (l.quiz ?? []).map((q) => ({ ...q, letter: l })));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  if (!target || !items.length) return <Screen><BackHeader /><Empty icon="help-circle-outline" title="Chưa có câu đố" /></Screen>;
  const name = callName(target);

  if (i >= items.length) {
    return (
      <Screen edges={['top', 'bottom']}>
        <BackHeader title="Đố vui" />
        <FadeIn style={{ alignItems: 'center', gap: 14, marginTop: 40 }}>
          <Avatar name={target.name} uri={target.avatarUri} size={96} />
          <T variant="display" center>{parent ? 'Xong rồi' : `Bạn đúng ${score}/${items.length}`}</T>
          <T variant="body" color={colors.inkSoft} center>
            {parent ? `Gọi ${name} một cuộc nhé.` : score === items.length ? `Bạn hiểu ${name} lắm đấy.` : `Câu nào sai là một chuyện mới để hỏi ${name}.`}
          </T>
        </FadeIn>
        <View style={{ gap: 10, marginTop: 32 }}>
          <Button label={`Gọi video ${name}`} icon="videocam" variant="dark" onPress={() => router.replace({ pathname: '/room', params: { with: target.id } })} />
          <Button label="Chơi lại" variant="ghost" onPress={() => { setI(0); setScore(0); setPicked(null); }} />
        </View>
      </Screen>
    );
  }

  const q = items[i];
  const answered = picked !== null;
  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader title={`Bạn hiểu ${name} đến đâu?`} />
      <Steps current={i + 1} total={items.length} />
      <FadeIn key={i}>
        <T variant="display">{q.q}</T>
        <View style={{ gap: 10, marginTop: 24 }}>
          {q.options.map((o, k) => {
            const right = answered && k === q.answer;
            const wrong = answered && k === picked && k !== q.answer;
            return (
              <Tap key={o} disabled={answered} label={o} scaleTo={0.97}
                onPress={() => { setPicked(k); if (k === q.answer) setScore(score + 1); }}>
                <View style={[styles.option, right && { backgroundColor: colors.green }, wrong && { backgroundColor: colors.primaryDark }]}>
                  <T variant="h3" color={right ? colors.white : colors.ink} style={{ flex: 1 }}>{o}</T>
                  {right && <Ionicons name="checkmark-circle" size={24} color={colors.white} />}
                  {wrong && <Ionicons name="close-circle" size={24} color={colors.white} />}
                </View>
              </Tap>
            );
          })}
        </View>
        {answered && (
          <View style={styles.reveal}>
            <T variant="small" weight="semibold" color={colors.accentText}>{name.charAt(0).toUpperCase() + name.slice(1)} kể</T>
            <T variant="body">“{q.letter.quote}”</T>
            <Tap onPress={() => router.push(`/letter/${q.letter.id}`)} label="Nghe lại" scaleTo={0.96}>
              <T variant="small" weight="semibold" color={colors.accentText}>Nghe lại đoạn này</T>
            </Tap>
          </View>
        )}
      </FadeIn>
      <View style={{ flex: 1 }} />
      {answered && <Button label={i === items.length - 1 ? 'Xem kết quả' : 'Câu tiếp'} onPress={() => { setI(i + 1); setPicked(null); }} style={{ marginTop: 24 }} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, borderRadius: radius.lg, paddingHorizontal: 20, backgroundColor: colors.tone },
  reveal: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16, gap: 6, marginTop: 16 },
});
