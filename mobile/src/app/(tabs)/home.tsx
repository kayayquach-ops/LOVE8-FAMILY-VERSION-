import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EventRow, MemberStrip, NudgeCard, PostCard, StoryCard } from '@/components/Feed';
import { Avatar, Card, IconButton, Screen, SectionHeader, T } from '@/components/ui';
import { localTimeFor, longDate } from '@/lib/format';
import { formatLunar } from '@/lib/lunar';
import { daysAway, daysToTet, lunarToday, me, member, nudges, upcoming, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadow } from '@/theme';
import ParentHome from '@/components/ParentHome';

export default function Home() {
  const { state } = useApp();
  if (state.settings.parentMode) return <ParentHome />;

  const self = me(state);
  const today = new Date();
  const lunar = lunarToday(today);
  const away = daysAway(self);
  const home = state.family.members.find((m) => m.country === 'VN' && m.id !== self.id);
  const feed = state.posts.slice(0, 6);
  const nudge = nudges(state)[0];
  const events = upcoming(state).slice(0, 3);
  const latestStory = visibleStories(state)[0];
  const waiting = state.questions.filter((q) => q.toId === state.meId && q.status !== 'answered');

  return (
    <Screen>
      <View style={styles.header}>
        <Avatar name={self.name} uri={self.avatarUri} size={42} onPress={() => router.push('/family')} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <IconButton icon="phone-portrait-outline" onPress={() => router.push('/widget')} />
          <IconButton icon="notifications-outline" badge={!!nudge} onPress={() => router.push('/notifications')} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 }}>
        <Ionicons name="location" size={13} color={colors.muted} />
        <T variant="caption" color={colors.muted}>
          {self.city} · {longDate(today)} · {formatLunar(lunar)}
        </T>
      </View>
      <T variant="h1" weight="regular" style={{ marginTop: 4 }}>
        <T variant="h1">Hôm nay</T> nhà mình thế nào?
      </T>

      <View style={{ marginTop: 18 }}>
        <MemberStrip />
      </View>

      <View style={[styles.counter, shadow.card]}>
        <Counter value={away ?? 0} label="ngày xa nhà" />
        <View style={styles.vline} />
        <Counter value={daysToTet(today)} label={`ngày nữa là Tết`} />
        <View style={styles.vline} />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <T variant="h2" color={colors.white}>{home ? localTimeFor(home.country, today) : '--:--'}</T>
          <T variant="caption" color={colors.white} style={{ opacity: 0.85 }}>giờ ở nhà</T>
        </View>
      </View>

      {waiting.length > 0 && (
        <Card style={{ marginTop: 20, flexDirection: 'row', gap: 12, alignItems: 'center' }} onPress={() => router.push('/chat')}>
          <View style={styles.qIcon}><T variant="h3">💬</T></View>
          <View style={{ flex: 1 }}>
            <T variant="small" weight="semibold">{member(state, waiting[0].fromId)?.roleLabel} muốn hỏi bạn</T>
            <T variant="small" color={colors.muted} numberOfLines={2}>“{waiting[0].text}”</T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Card>
      )}

      <SectionHeader title="Ảnh hôm nay" action="Xem tất cả" onAction={() => router.push('/feed')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 20, paddingBottom: 6 }}>
        {feed.map((p) => <PostCard key={p.id} post={p} width={210} />)}
      </ScrollView>

      {nudge && (
        <>
          <SectionHeader title="Nhắc nhẹ" />
          <NudgeCard nudge={nudge} />
        </>
      )}

      <SectionHeader title="Sắp tới" action="Mở lịch" onAction={() => router.push('/calendar')} />
      <Card style={{ paddingVertical: 4 }}>
        {events.map((e) => <EventRow key={e.event.id} item={e} />)}
      </Card>

      {latestStory && (
        <>
          <SectionHeader title="Trang ký ức mới" action="Sổ ký ức" onAction={() => router.push('/memories')} />
          <StoryCard story={latestStory} />
        </>
      )}

      <SectionHeader title="Khám phá" />
      <View style={styles.grid}>
        <Shortcut emoji="🍲" title="Món của mẹ" onPress={() => router.push('/recipes')} />
        <Shortcut emoji="⏳" title="Hộp thời gian" onPress={() => router.push('/capsules')} />
        <Shortcut emoji="📕" title="Sách Tết" onPress={() => router.push('/book')} />
        <Shortcut emoji="❓" title="Hỏi bố mẹ" onPress={() => router.push('/ask')} />
      </View>
    </Screen>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <T variant="h2" color={colors.white}>{value}</T>
      <T variant="caption" color={colors.white} style={{ opacity: 0.85 }} center>{label}</T>
    </View>
  );
}

function Shortcut({ emoji, title, onPress }: { emoji: string; title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.shortcut, shadow.soft]}>
      <T variant="h1">{emoji}</T>
      <T variant="small" weight="semibold">{title}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  counter: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 16, paddingHorizontal: 8, marginTop: 20,
  },
  vline: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.35)' },
  qIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shortcut: {
    width: '47.8%', backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 8,
  },
});
