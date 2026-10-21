import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, BackHeader, Button, Chip, Field, Screen, SectionHeader, T } from '@/components/ui';
import { QUESTION_BANK } from '@/data/questions';
import { relativeTime } from '@/lib/format';
import { member, others } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const STATUS = {
  pending: { label: 'Chờ Thư hỏi', color: colors.muted },
  asked: { label: 'Đã hỏi', color: colors.inkSoft },
  answered: { label: 'Đã trả lời', color: colors.green },
} as const;

// "Câu hỏi con muốn hỏi": gửi điều mình ngại hỏi trực tiếp, Thư hỏi khéo giúp trong cuộc gọi tới.
export default function Ask() {
  const params = useLocalSearchParams<{ text?: string }>();
  const { state, dispatch } = useApp();
  const people = others(state);
  const [to, setTo] = useState(people.find((p) => p.role === 'me')?.id ?? people[0]?.id);
  const [chapter, setChapter] = useState('tinh-yeu');
  const [text, setText] = useState(params.text?.replace('*', '') ?? '');
  const [sent, setSent] = useState(false);
  const target = member(state, to);
  const mine = state.questions.filter((q) => q.fromId === state.meId);

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader title="Hỏi người thân" />
      <T variant="body" color={colors.inkSoft}>
        Câu hỏi bạn ngại hỏi trực tiếp? Thư sẽ hỏi khéo trong cuộc gọi tới, rồi gửi lại cho bạn câu trả lời bằng chính giọng của họ.
      </T>

      <SectionHeader title="Hỏi ai?" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 16, paddingHorizontal: 20 }}>
        {people.map((p) => (
          <Pressable key={p.id} onPress={() => setTo(p.id)} accessibilityRole="button" accessibilityState={{ selected: to === p.id }}
            style={{ alignItems: 'center', gap: 6 }}>
            <Avatar name={p.name} uri={p.avatarUri} size={56} ring={to === p.id} ringColor={colors.ink} />
            <T variant="small" weight={to === p.id ? 'semibold' : 'regular'} color={to === p.id ? colors.ink : colors.muted}>{p.roleLabel}</T>
          </Pressable>
        ))}
      </ScrollView>

      <SectionHeader title="Gợi ý theo chủ đề" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingHorizontal: 20 }}>
        {state.chapters.map((c) => (
          <Chip key={c.id} label={c.title} active={chapter === c.id} onPress={() => setChapter(c.id)} />
        ))}
      </ScrollView>
      {(QUESTION_BANK[chapter] ?? []).slice(0, 4).map((q) => {
        const on = text === q.replace('*', '');
        return (
          <Pressable key={q} onPress={() => setText(q.replace('*', ''))} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[styles.idea, on && { backgroundColor: colors.toneDeep }]}>
            <T variant="body" style={{ flex: 1 }}>{q.replace('*', '')}</T>
            {on && <T variant="small" weight="semibold">Đã chọn</T>}
          </Pressable>
        );
      })}

      <View style={{ marginTop: 16 }}>
        <Field label={`Câu hỏi cho ${target?.roleLabel.toLowerCase() ?? ''}`} value={text} onChangeText={setText} multiline placeholder="Viết bằng lời của bạn..." />
      </View>
      <Button
        label={sent ? 'Đã gửi cho Thư' : 'Nhờ Thư hỏi giúp'} icon={sent ? 'checkmark' : 'paper-plane-outline'} disabled={!text.trim() || !to || sent}
        style={{ marginTop: 18 }}
        onPress={() => { dispatch({ type: 'addQuestion', toId: to!, text: text.trim() }); setSent(true); setTimeout(() => { setSent(false); setText(''); }, 1500); }}
      />

      {mine.length > 0 && (
        <>
          <SectionHeader title="Câu hỏi bạn đã gửi" />
          {mine.map((q) => {
            const s = STATUS[q.status];
            return (
              <Pressable key={q.id} onPress={() => q.storyId && router.push(`/story/${q.storyId}`)} accessibilityRole="button" style={styles.sent}>
                <View style={{ flex: 1, gap: 4 }}>
                  <T variant="body" weight="medium">{q.text}</T>
                  <T variant="small" color={colors.muted}>Gửi {member(state, q.toId)?.roleLabel.toLowerCase()}, {relativeTime(q.createdAt)}</T>
                </View>
                <T variant="small" weight="semibold" color={s.color}>{s.label}</T>
              </Pressable>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  idea: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tone, borderRadius: radius.md, padding: 14, minHeight: 52, marginBottom: 8 },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
});
