import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { StoryCard } from '@/components/Feed';
import { Chip, IconButton, ListRow, Screen, SectionHeader, T } from '@/components/ui';
import type { Story } from '@/data/types';
import { duration } from '@/lib/format';
import { member, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

export default function Memories() {
  const { state } = useApp();
  const [teller, setTeller] = useState<string>('all');
  const [query, setQuery] = useState('');
  const all = visibleStories(state);
  const tellers = [...new Set(all.map((s) => s.tellerId))];
  const q = query.trim().toLowerCase();
  const found = all.filter((s) => s.title.toLowerCase().includes(q) || s.transcript.toLowerCase().includes(q) || String(s.year ?? '').includes(q));
  const minutes = Math.round(all.reduce((n, s) => n + s.durationSec, 0) / 60);
  const latest = all[0];
  // Dòng đời: xếp theo năm, chuyện không rõ năm (lời dặn) để cuối.
  const timeline = all
    .filter((s) => teller === 'all' || s.tellerId === teller)
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

  return (
    <Screen>
      <View style={styles.header}>
        <T variant="display" style={{ flex: 1 }}>Sổ ký ức</T>
        <IconButton icon="help-circle-outline" label="Nhờ Thư hỏi bố mẹ" onPress={() => router.push('/ask')} />
      </View>
      <T variant="body" color={colors.inkSoft} style={{ marginTop: 6 }}>
        {all.length} trang, {minutes} phút giọng kể của {tellers.length} người trong nhà.
      </T>

      <View style={styles.search}>
        <Ionicons name="search" size={19} color={colors.muted} />
        <TextInput
          value={query} onChangeText={setQuery} placeholder="Tìm trong lời kể: nhà máy dệt, 1996..."
          placeholderTextColor={colors.placeholder} style={styles.searchInput} accessibilityLabel="Tìm trong Sổ ký ức"
        />
        {q ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Xoá tìm kiếm">
            <Ionicons name="close-circle" size={19} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {q ? (
        <>
          <SectionHeader title={found.length ? `${found.length} trang có “${query.trim()}”` : 'Chưa có trang nào'} />
          {found.map((s) => <StoryLine key={s.id} story={s} />)}
        </>
      ) : (
        <>
          {latest && (
            <>
              <SectionHeader title="Mới kể" />
              <StoryCard story={latest} />
            </>
          )}

          <SectionHeader title="Mục lục" />
          {state.chapters.map((c) => {
            const n = all.filter((s) => s.chapterId === c.id).length;
            return (
              <Pressable key={c.id} onPress={() => router.push(`/chapter/${c.id}`)} accessibilityRole="button"
                style={({ pressed }) => [styles.chapter, pressed && { backgroundColor: colors.tone }]}>
                <View style={{ flex: 1 }}>
                  <T variant="h3" serif weight="semibold" style={{ fontSize: 19, lineHeight: 25 }}>{c.title}</T>
                  <T variant="small" color={colors.muted} numberOfLines={1}>{c.description}</T>
                </View>
                <T variant="small" weight={n ? 'semibold' : 'regular'} color={n ? colors.ink : colors.muted}>
                  {n ? `${n} trang` : 'Chưa có'}
                </T>
              </Pressable>
            );
          })}

          <SectionHeader title="Theo dòng đời" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}>
            <Chip label="Cả nhà" active={teller === 'all'} onPress={() => setTeller('all')} />
            {tellers.map((t) => (
              <Chip key={t} label={member(state, t)?.roleLabel ?? t} active={teller === t} onPress={() => setTeller(t)} />
            ))}
          </ScrollView>
          {timeline.map((s) => <StoryLine key={s.id} story={s} />)}

          <SectionHeader title="Từ sổ ký ức" />
          <ListRow icon="film-outline" label="Làm clip câu chuyện" onPress={() => latest && router.push(`/clip/${latest.id}`)} />
          <ListRow icon="book-outline" label="In Sách Tết" onPress={() => router.push('/book')} />
          <ListRow icon="restaurant-outline" label="Món của mẹ" onPress={() => router.push('/recipes')} />
          <ListRow icon="help-circle-outline" label="Nhờ Thư hỏi bố mẹ" onPress={() => router.push('/ask')} />
        </>
      )}
    </Screen>
  );
}

/** Một dòng trong dòng đời: năm bên trái, tên chuyện và người kể bên phải. */
function StoryLine({ story }: { story: Story }) {
  const { state } = useApp();
  const teller = member(state, story.tellerId);
  return (
    <Pressable onPress={() => router.push(`/story/${story.id}`)} accessibilityRole="button"
      style={({ pressed }) => [styles.line, pressed && { backgroundColor: colors.tone }]}>
      <T variant="h2" weight="bold" style={{ width: 64, fontSize: 20 }}>{story.year ?? '—'}</T>
      <View style={{ flex: 1 }}>
        <T variant="body" weight="semibold" numberOfLines={2}>{story.title}</T>
        <T variant="small" color={colors.muted}>{teller?.roleLabel} kể, {duration(story.durationSec)}</T>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tone, borderRadius: radius.md,
    paddingHorizontal: 16, height: 52, marginTop: 18,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, height: 52 },
  chapter: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 4, borderRadius: radius.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: radius.md },
});
