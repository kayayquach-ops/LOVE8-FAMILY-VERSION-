import { Ionicons } from '@expo/vector-icons';
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
      <BackHeader title={chapter?.title} />
      <View style={styles.hero}>
        <T variant="display">{chapter?.emoji}</T>
        <T variant="small" color={colors.muted} center>{chapter?.description}</T>
      </View>
      <View style={{ gap: 14 }}>
        {stories.length === 0 && <Empty icon="book-outline" title="Chương này còn trống" text="Gửi một câu hỏi bên dưới, Thư sẽ hỏi giúp bạn." />}
        {stories.map((s) => <StoryCard key={s.id} story={s} />)}
      </View>
      <SectionHeader title="Gợi ý câu hỏi" />
      {ideas.slice(0, 5).map((q) => (
        <Pressable key={q} onPress={() => router.push({ pathname: '/ask', params: { text: q } })} style={styles.idea}>
          <T variant="small" style={{ flex: 1 }}>{q.replace('*', '')}</T>
          <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingVertical: 18 },
  idea: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primaryTint,
    borderRadius: radius.md, padding: 14, marginBottom: 8,
  },
});
