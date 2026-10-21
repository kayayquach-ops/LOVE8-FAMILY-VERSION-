import { Ionicons } from '@/components/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { StoryCard } from '@/components/Feed';
import { BackHeader, Empty, Screen, SectionHeader, T } from '@/components/ui';
import { QUESTION_BANK } from '@/data/questions';
import { visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

export default function ChapterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useApp();
  const chapter = state.chapters.find((c) => c.id === id);
  const stories = visibleStories(state).filter((s) => s.chapterId === id);
  const ideas = QUESTION_BANK[id ?? ''] ?? [];

  return (
    <Screen>
      <BackHeader title="Sổ ký ức" />
      <View style={styles.hero}>
        <T variant="display">{chapter?.title}</T>
        <T variant="body" color={colors.inkSoft}>{chapter?.description}</T>
      </View>
      <View style={{ gap: 14 }}>
        {stories.length === 0 && <Empty icon="book-outline" title="Chương này còn trống" text="Gửi một câu hỏi bên dưới, Thư sẽ hỏi giúp bạn." />}
        {stories.map((s) => <StoryCard key={s.id} story={s} />)}
      </View>
      <SectionHeader title="Gợi ý câu hỏi" />
      {ideas.slice(0, 5).map((q) => (
        <Pressable key={q} onPress={() => router.push({ pathname: '/ask', params: { text: q } })} accessibilityRole="button"
          style={({ pressed }) => [styles.idea, pressed && { backgroundColor: colors.toneDeep }]}>
          <T variant="body" style={{ flex: 1 }}>{q.replace('*', '')}</T>
          <Ionicons name="paper-plane-outline" size={18} color={colors.inkSoft} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6, paddingTop: 8, paddingBottom: 24 },
  idea: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primaryTint,
    borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
});
