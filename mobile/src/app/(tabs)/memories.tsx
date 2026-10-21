import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { StoryCard } from '@/components/Feed';
import { Avatar, Chip, IconButton, Screen, SectionHeader, T } from '@/components/ui';
import { member, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius, shadow } from '@/theme';

export default function Memories() {
  const { state } = useApp();
  const [teller, setTeller] = useState<string>('all');
  const [query, setQuery] = useState('');
  const all = visibleStories(state);
  const tellers = [...new Set(all.map((s) => s.tellerId))];
  const q = query.trim().toLowerCase();
  const stories = all.filter(
    (s) => (teller === 'all' || s.tellerId === teller) &&
      (!q || s.title.toLowerCase().includes(q) || s.transcript.toLowerCase().includes(q)),
  );
  const minutes = Math.round(all.reduce((n, s) => n + s.durationSec, 0) / 60);
  const years = [...new Set(all.map((s) => s.year).filter((y): y is number => !!y))].sort();

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="help-circle-outline" onPress={() => router.push('/ask')} />
        <Avatar name={state.family.name} emoji="🏠" size={40} onPress={() => router.push('/family')} />
      </View>
      <T variant="h1" weight="regular" style={{ marginTop: 12 }}>
        <T variant="h1">Sổ ký ức</T> của {state.family.name.toLowerCase()}
      </T>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query} onChangeText={setQuery} placeholder="Tìm: “nhà máy dệt”, “ngày cưới”..."
          placeholderTextColor={colors.faint} style={styles.searchInput}
        />
      </View>

      <View style={[styles.stats, shadow.soft]}>
        <Stat n={all.length} label="trang" />
        <Stat n={minutes} label="phút giọng kể" />
        <Stat n={tellers.length} label="người kể" />
      </View>

      <View style={styles.actions}>
        <Action icon="help-buoy" label="Hỏi bố mẹ" onPress={() => router.push('/ask')} />
        <Action icon="film" label="Clip câu chuyện" onPress={() => all[0] && router.push(`/clip/${all[0].id}`)} />
        <Action icon="book" label="Sách Tết" onPress={() => router.push('/book')} />
        <Action icon="restaurant" label="Món của mẹ" onPress={() => router.push('/recipes')} />
      </View>

      <SectionHeader title="Theo chương" />
      <View style={{ gap: 2 }}>
        {state.chapters.map((c) => {
          const inChapter = all.filter((s) => s.chapterId === c.id);
          const people = [...new Set(inChapter.map((s) => s.tellerId))];
          return (
            <Pressable key={c.id} onPress={() => router.push(`/chapter/${c.id}`)} style={styles.chapter}>
              <View style={styles.chapterThumb}><T variant="h1">{c.emoji}</T></View>
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="body" weight="semibold">{c.title}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {people.slice(0, 3).map((pid, i) => {
                      const m = member(state, pid);
                      return (
                        <View key={pid} style={{ marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: colors.white, borderRadius: 14 }}>
                          <Avatar name={m?.name ?? '?'} uri={m?.avatarUri} size={22} />
                        </View>
                      );
                    })}
                  </View>
                  <T variant="caption" color={colors.muted}>
                    {inChapter.length ? `${inChapter.length} trang` : 'Chưa có trang nào, gửi câu hỏi đầu tiên'}
                  </T>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
          );
        })}
      </View>

      {years.length > 0 && (
        <>
          <SectionHeader title="Dòng đời" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingRight: 20 }}>
            {years.map((y, i) => (
              <View key={y} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable onPress={() => setQuery(String(y))} style={styles.year}>
                  <T variant="small" weight="bold">{y}</T>
                  <T variant="caption" color={colors.muted}>{all.filter((s) => s.year === y).map((s) => s.emoji).join(' ')}</T>
                </Pressable>
                {i < years.length - 1 && <View style={styles.yearLine} />}
              </View>
            ))}
          </ScrollView>
        </>
      )}

      <SectionHeader title="Tất cả câu chuyện" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        <Chip label="Cả nhà" active={teller === 'all'} onPress={() => setTeller('all')} />
        {tellers.map((t) => (
          <Chip key={t} label={member(state, t)?.roleLabel ?? t} active={teller === t} onPress={() => setTeller(t)} />
        ))}
      </ScrollView>
      <View style={styles.grid}>
        {stories.map((s) => (
          <View key={s.id} style={{ width: '48%' }}>
            <StoryCard story={s} compact />
          </View>
        ))}
      </View>
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <T variant="h2" color={colors.primary}>{n}</T>
      <T variant="caption" color={colors.muted}>{label}</T>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: 'help-buoy' | 'film' | 'book' | 'restaurant'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <View style={styles.actionIcon}><Ionicons name={icon} size={22} color={colors.primary} /></View>
      <T variant="caption" center>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.field, borderRadius: radius.pill,
    paddingHorizontal: 16, height: 48, marginTop: 16,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  stats: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 14, marginTop: 16 },
  actions: { flexDirection: 'row', marginTop: 20 },
  actionIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  chapter: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  chapterThumb: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  year: { alignItems: 'center', backgroundColor: colors.field, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  yearLine: { width: 24, height: 2, backgroundColor: colors.primarySoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
});
