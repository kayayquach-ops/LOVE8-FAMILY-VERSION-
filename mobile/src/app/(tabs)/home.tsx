import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventRow, FamilyGrid, NudgeCard, PostCard, StoryCard } from '@/components/Feed';
import ParentHome from '@/components/ParentHome';
import { Ionicons } from '@/components/Icon';
import { AvatarStack, FadeIn, IconButton, ListRow, LogoMark, PhotoTile, Screen, SectionHeader, T, Tap } from '@/components/ui';
import { localTimeFor, lunarMonthName, weekday } from '@/lib/format';
import { canChiYear } from '@/lib/lunar';
import { daysAway, daysToTet, lunarToday, me, member, nudges, postedToday, upcoming, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, familyTones } from '@/theme';

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
  const allNudges = nudges(state);
  const nudge = allNudges[0];
  const events = upcoming(state).slice(0, 3);
  const latestStory = visibleStories(state)[0];
  const waiting = state.questions.filter((q) => q.toId === state.meId && q.status !== 'answered');
  const sentToday = state.family.members.filter((m) => postedToday(state, m.id)).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <View style={styles.header}>
          <LogoMark />
          <IconButton icon="search" label="Tìm trong Sổ ký ức" onPress={() => router.push('/memories')} />
          <View style={{ flex: 1 }} />
          <IconButton icon="phone-portrait-outline" label="Xem widget" onPress={() => router.push('/widget')} />
          <IconButton icon="notifications-outline" label="Thông báo" badge={allNudges.length || undefined} onPress={() => router.push('/notifications')} />
        </View>

        {/* Nhóm avatar xếp chồng và tên nhà, như dòng nhóm của mẫu friendlyhours. */}
        <Tap onPress={() => router.push('/family')} label="Mở gia đình" scaleTo={0.98} style={{ marginTop: 18 }}>
          <View style={styles.familyBar}>
            <AvatarStack people={state.family.members} max={3} size={46} />
            <View style={{ alignItems: 'flex-end', flex: 1 }}>
              <T variant="h3">{state.family.name}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="people-outline" size={15} color={colors.muted} />
                <T variant="small" color={colors.muted} numberOfLines={1}>{sentToday}/{state.family.members.length} người đã gửi hôm nay</T>
              </View>
            </View>
          </View>
        </Tap>

        {/* Tờ lịch hôm nay: thẻ lớn đầu trang như thẻ nổi bật của bản tham khảo. */}
        <FadeIn style={{ marginTop: 14 }}>
          <Tap onPress={() => router.push('/calendar')} label="Mở lịch" scaleTo={0.98}>
            <PhotoTile seed="today" tone={familyTones[4]} height={252}>
              <View style={styles.leaf}>
                <View style={styles.leafTop}>
                  <View>
                    <T variant="h3" color={colors.white}>{weekday(today)}</T>
                    <T variant="small" color="rgba(255,255,255,0.85)">Tháng {today.getMonth() + 1}, {today.getFullYear()}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T variant="small" color="rgba(255,255,255,0.85)">Âm lịch</T>
                    <T variant="h3" color={colors.white}>{lunar.day} {lunarMonthName(lunar.month, lunar.leap)}</T>
                    <T variant="small" color="rgba(255,255,255,0.85)">năm {canChiYear(lunar.year)}</T>
                  </View>
                </View>
                <T variant="display" color={colors.white} style={styles.bigDay}>{today.getDate()}</T>
                <View>
                  <T variant="h2" color={colors.white}>Còn {tet} ngày nữa là Tết</T>
                  <T variant="small" color="rgba(255,255,255,0.92)" numberOfLines={1} style={{ marginTop: 4 }}>
                    {home ? `Ở nhà ${localTimeFor(home.country, today)}, ` : ''}{self.city} {localTimeFor(self.country, today)}
                    {away !== undefined ? `, xa nhà ${away} ngày` : ''}
                  </T>
                </View>
              </View>
            </PhotoTile>
          </Tap>
        </FadeIn>

        {waiting.length > 0 && (
          <FadeIn delay={80} style={{ marginTop: 10 }}>
            <Tap onPress={() => router.push('/chat')} label="Trả lời câu hỏi" scaleTo={0.98}>
              <View style={styles.letter}>
                <T variant="small" color={colors.muted}>{member(state, waiting[0].fromId)?.roleLabel} muốn hỏi bạn</T>
                <T variant="h2">“{waiting[0].text}”</T>
                <T variant="small" weight="semibold" color={colors.accentText}>Kể cho Thư nghe</T>
              </View>
            </Tap>
          </FadeIn>
        )}

        <SectionHeader title="Cả nhà hôm nay" />
        <FamilyGrid />

        <SectionHeader title="Tin mới" action="Xem tất cả" onAction={() => router.push('/feed')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
          {feed.map((p, i) => (
            <FadeIn key={p.id} delay={i * 90}><PostCard post={p} width={286} /></FadeIn>
          ))}
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
      <ActionStack nudgeCount={allNudges.length} nudgeMember={nudge?.member.id} />
    </View>
  );
}

/** Cột nút tròn nổi bên phải, như bản tham khảo: gọi người lâu chưa gọi, gọi video cả nhà, để Thư gọi hỏi chuyện. */
function ActionStack({ nudgeCount, nudgeMember }: { nudgeCount: number; nudgeMember?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.stack, { bottom: Math.max(insets.bottom, 12) + 76 }]}>
      <IconButton icon="call-outline" size={40} label="Gọi người lâu chưa gọi" bg={colors.bg} badge={nudgeCount || undefined}
        onPress={() => router.push(nudgeMember ? `/member/${nudgeMember}` : '/family')} />
      <IconButton icon="videocam-outline" size={40} label="Gọi video cả nhà" bg={colors.bg} onPress={() => router.push('/room')} />
      <IconButton icon="mic-outline" size={40} label="Để Thư gọi hỏi chuyện" bg={colors.bg} onPress={() => router.push('/call')} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  familyBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  leaf: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 20, justifyContent: 'space-between' },
  leafTop: { flexDirection: 'row', justifyContent: 'space-between' },
  bigDay: { fontSize: 104, lineHeight: 104, letterSpacing: -6, marginLeft: -4 },
  letter: { backgroundColor: colors.tone, borderRadius: 28, padding: 20, gap: 8 },
  stack: {
    position: 'absolute', right: 10, gap: 6, padding: 4, borderRadius: 999, backgroundColor: 'rgba(16,16,18,0.92)',
    borderWidth: 1, borderColor: colors.line,
  },
});
