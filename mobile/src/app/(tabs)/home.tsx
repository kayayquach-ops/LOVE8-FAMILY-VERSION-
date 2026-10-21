import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EventRow, FamilyToday, NudgeCard, PostCard, StoryCard } from '@/components/Feed';
import ParentHome from '@/components/ParentHome';
import { Avatar, IconButton, ListRow, Screen, SectionHeader, T } from '@/components/ui';
import { localTimeFor, lunarMonthName, weekday } from '@/lib/format';
import { canChiYear } from '@/lib/lunar';
import { daysAway, daysToTet, lunarToday, me, member, nudges, upcoming, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

export default function Home() {
  const { state } = useApp();
  if (state.settings.parentMode) return <ParentHome />;

  const self = me(state);
  const today = new Date();
  const lunar = lunarToday(today);
  const away = daysAway(self);
  const tet = daysToTet(today);
  const home = state.family.members.find((m) => m.country === 'VN' && m.id !== self.id);
  const feed = state.posts.slice(0, 6);
  const nudge = nudges(state)[0];
  const events = upcoming(state).slice(0, 3);
  const latestStory = visibleStories(state)[0];
  const waiting = state.questions.filter((q) => q.toId === state.meId && q.status !== 'answered');
  // Như tờ lịch bóc: Chủ nhật và mùng một Tết in màu đỏ.
  const red = today.getDay() === 0 || (lunar.month === 1 && lunar.day <= 3);

  return (
    <Screen>
      <View style={styles.header}>
        <Avatar name={self.name} uri={self.avatarUri} size={44} onPress={() => router.push('/family')} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <IconButton icon="phone-portrait-outline" label="Xem widget" onPress={() => router.push('/widget')} />
          <IconButton icon="notifications-outline" label="Thông báo" badge={!!nudge} onPress={() => router.push('/notifications')} />
        </View>
      </View>

      <View style={styles.leaf} accessibilityRole="header">
        <View style={styles.leafTop}>
          <T variant="h3" weight="semibold" color={red ? colors.primary : colors.ink}>{weekday(today)}</T>
          <T variant="h3" weight="semibold">Tháng {today.getMonth() + 1}, {today.getFullYear()}</T>
        </View>
        <View style={styles.leafBody}>
          <T serif weight="bold" color={red ? colors.primary : colors.ink} style={styles.bigDay}>{today.getDate()}</T>
          {/* Như ô âm lịch ở góc tờ lịch bóc. */}
          <View style={styles.lunarBox} accessibilityLabel={`Âm lịch: ngày ${lunar.day} ${lunarMonthName(lunar.month, lunar.leap)}, năm ${canChiYear(lunar.year)}`}>
            <T variant="small" weight="medium" color={colors.lunar}>Âm lịch</T>
            <T serif weight="bold" color={colors.lunar} style={{ fontSize: 52, lineHeight: 58 }}>{lunar.day}</T>
            <T variant="small" weight="semibold" color={colors.lunar}>{lunarMonthName(lunar.month, lunar.leap)}</T>
            <T variant="small" color={colors.lunar}>năm {canChiYear(lunar.year)}</T>
          </View>
        </View>
      </View>

      <View style={styles.clocks}>
        <View style={{ flexDirection: 'row' }}>
          <Clock label={home ? `Ở nhà, ${home.city}` : 'Ở nhà'} time={home ? localTimeFor(home.country, today) : '--:--'} />
          <Clock label={`Bạn ở ${self.city}`} time={localTimeFor(self.country, today)} />
        </View>
        <T variant="body" color={colors.inkSoft} style={{ marginTop: 12 }}>
          Còn <T variant="body" weight="semibold">{tet} ngày</T> nữa là Tết.
          {away !== undefined ? <> Bạn đã xa nhà <T variant="body" weight="semibold">{away} ngày</T>.</> : null}
        </T>
      </View>

      {waiting.length > 0 && (
        <Pressable onPress={() => router.push('/chat')} accessibilityRole="button" style={({ pressed }) => [styles.letter, pressed && { backgroundColor: colors.toneDeep }]}>
          <T variant="small" weight="semibold" color={colors.inkSoft}>{member(state, waiting[0].fromId)?.roleLabel} muốn hỏi bạn</T>
          <T variant="h2" weight="regular" style={{ fontSize: 20, lineHeight: 27 }}>“{waiting[0].text}”</T>
          <T variant="small" weight="semibold" color={colors.primary}>Kể cho Thư nghe</T>
        </Pressable>
      )}

      <SectionHeader title="Cả nhà hôm nay" />
      <FamilyToday />

      <SectionHeader title="Tin mới" action="Xem tất cả" onAction={() => router.push('/feed')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
        {feed.map((p) => <PostCard key={p.id} post={p} width={240} />)}
      </ScrollView>

      {nudge && (
        <>
          <SectionHeader title="Nhắc nhẹ" />
          <NudgeCard nudge={nudge} />
        </>
      )}

      <SectionHeader title="Sắp tới" action="Mở lịch" onAction={() => router.push('/calendar')} />
      {events.map((e) => <EventRow key={e.event.id} item={e} />)}

      {latestStory && (
        <>
          <SectionHeader title="Trang ký ức mới" action="Sổ ký ức" onAction={() => router.push('/memories')} />
          <StoryCard story={latestStory} />
        </>
      )}

      <SectionHeader title="Làm thêm" />
      <ListRow icon="restaurant-outline" label="Món của mẹ" onPress={() => router.push('/recipes')} />
      <ListRow icon="hourglass-outline" label="Hộp thời gian" onPress={() => router.push('/capsules')} />
      <ListRow icon="book-outline" label="Sách Tết" onPress={() => router.push('/book')} />
      <ListRow icon="help-circle-outline" label="Nhờ Thư hỏi bố mẹ" onPress={() => router.push('/ask')} />
    </Screen>
  );
}

function Clock({ label, time }: { label: string; time: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="small" color={colors.muted} numberOfLines={1}>{label}</T>
      <T variant="h1" weight="semibold" style={{ fontSize: 30, lineHeight: 36 }}>{time}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  leaf: { marginTop: 20 },
  leafTop: { flexDirection: 'row', justifyContent: 'space-between' },
  leafBody: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  bigDay: { fontSize: 136, lineHeight: 140, letterSpacing: -5, marginTop: 2, marginLeft: -6 },
  lunarBox: { alignItems: 'flex-end', paddingBottom: 14 },
  clocks: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, marginTop: 20 },
  letter: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, gap: 8, marginTop: 12 },
});
