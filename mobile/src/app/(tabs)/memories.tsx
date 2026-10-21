import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { StoryCard } from '@/components/Feed';
import { Ionicons } from '@/components/Icon';
import { Chip, FadeIn, IconButton, ListRow, PhotoTile, Screen, SectionHeader, T, Tap } from '@/components/ui';
import type { Story } from '@/data/types';
import { duration } from '@/lib/format';
import { member, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, familyTones, fonts, radius } from '@/theme';

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
      <T variant="body" color={colors.muted} style={{ marginTop: 4 }}>
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
            <FadeIn style={{ marginTop: 18 }}>
              <StoryCard story={latest} />
            </FadeIn>
          )}

          <SectionHeader title="Mục lục" />
          <View style={styles.grid}>
            {state.chapters.map((c, i) => {
              const n = all.filter((s) => s.chapterId === c.id).length;
              return (
                <FadeIn key={c.id} delay={i * 50} style={{ width: '48.5%' }}>
                  <Tap onPress={() => router.push(`/chapter/${c.id}`)} label={c.title} scaleTo={0.96}>
                    <PhotoTile seed={c.id} tone={n ? familyTones[(i + 1) % familyTones.length] : colors.toneDeep} height={i % 3 === 0 ? 132 : 112}>
                      <View style={styles.chapterInner}>
                        <T variant="caption" weight="regular" color="rgba(255,255,255,0.85)">{n ? `${n} trang` : 'Chưa có trang'}</T>
                        <T variant="h3" color={colors.white} numberOfLines={2}>{c.title}</T>
                      </View>
                    </PhotoTile>
                  </Tap>
                </FadeIn>
              );
            })}
          </View>

          <SectionHeader title="Theo dòng đời" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Chip label="Cả nhà" active={teller === 'all'} onPress={() => setTeller('all')} />
            {tellers.map((t) => (
              <Chip key={t} label={member(state, t)?.roleLabel ?? t} active={teller === t} onPress={() => setTeller(t)} />
            ))}
          </ScrollView>
          <View style={{ gap: 8 }}>
            {timeline.map((s) => <StoryLine key={s.id} story={s} />)}
          </View>

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
    <Tap onPress={() => router.push(`/story/${story.id}`)} label={story.title} scaleTo={0.98}>
      <View style={styles.line}>
        <T variant="h2" style={{ width: 66 }}>{story.year ?? '—'}</T>
        <View style={{ flex: 1 }}>
          <T variant="body" weight="semibold" numberOfLines={2}>{story.title}</T>
          <T variant="small" color={colors.muted}>{teller?.roleLabel} kể, {duration(story.durationSec)}</T>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.faint} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tone, borderRadius: radius.pill,
    paddingHorizontal: 18, height: 54, marginTop: 16,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, height: 54 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  chapterInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 14, justifyContent: 'space-between' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.tone, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 16 },
});
