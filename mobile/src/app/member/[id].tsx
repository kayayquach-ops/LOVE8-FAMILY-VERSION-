import { Ionicons } from '@/components/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { PostCard, StoryCard } from '@/components/Feed';
import { Avatar, BackHeader, Card, Empty, Screen, SectionHeader, T } from '@/components/ui';
import { inDaysLabel, localTimeFor, relativeTime } from '@/lib/format';
import { canChiYear, daysBetween, nextSolarAnniversary, nextSolarForLunar } from '@/lib/lunar';
import { daysAway, daysSinceCall, member, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useApp();
  const m = member(state, id ?? '');
  if (!m) return <Screen><BackHeader /><Empty icon="person-outline" title="Không tìm thấy người này" /></Screen>;

  const posts = state.posts.filter((p) => p.authorId === m.id).slice(0, 4);
  const stories = visibleStories(state).filter((s) => s.tellerId === m.id);
  const since = daysSinceCall(state, m.id);
  const b = m.birthday;
  const nextBirthday = b ? (b.calendar === 'lunar' ? nextSolarForLunar(b.day, b.month, new Date()) : nextSolarAnniversary(b.day, b.month, new Date())) : undefined;
  const away = daysAway(m);

  function callZalo() {
    // zalo.me/<số điện thoại> mở cuộc trò chuyện Zalo; nếu chưa có số, mở Zalo.
    Linking.openURL(m!.phone ? `https://zalo.me/${m!.phone.replace(/\D/g, '')}` : 'https://zalo.me').catch(() => {});
  }

  return (
    <Screen>
      <BackHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
        <Avatar name={m.name} uri={m.avatarUri} size={84} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="h1">{m.roleLabel}</T>
          <T variant="body" color={colors.inkSoft}>{m.name}</T>
        </View>
      </View>
      <T variant="body" color={colors.inkSoft} style={{ marginTop: 14 }}>
        Đang ở {m.city}, bây giờ là {localTimeFor(m.country)}. Hoạt động {relativeTime(m.lastActiveAt)}.
      </T>

      <View style={styles.actions}>
        <Pressable onPress={callZalo} accessibilityRole="button" style={[styles.action, { backgroundColor: colors.primary }]}>
          <Ionicons name="videocam" size={18} color={colors.white} />
          <T variant="small" weight="semibold" color={colors.white}>Gọi qua Zalo</T>
        </Pressable>
        <Pressable onPress={() => dispatch({ type: 'markCalled', memberId: m.id })} accessibilityRole="button" style={[styles.action, { backgroundColor: colors.tone }]}>
          <Ionicons name="checkmark-done" size={18} color={colors.ink} />
          <T variant="small" weight="semibold">{since === 0 ? 'Hôm nay đã gọi' : 'Đánh dấu đã gọi'}</T>
        </Pressable>
      </View>

      <View style={styles.facts}>
        <Fact label="Lần gọi gần nhất" value={since >= 99 ? 'Chưa có' : since === 0 ? 'Hôm nay' : `${since} ngày trước`} />
        {b && nextBirthday && (
          <Fact
            label={`Sinh nhật (${b.calendar === 'lunar' ? 'âm' : 'dương'} ${b.day}/${b.month})`}
            value={inDaysLabel(daysBetween(new Date(), nextBirthday))}
          />
        )}
        {b?.year && <Fact label="Tuổi" value={canChiYear(b.year)} />}
        {away !== undefined && <Fact label="Đã xa nhà" value={`${away} ngày`} />}
      </View>

      <Card onPress={() => router.push('/ask')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <Ionicons name="help-circle-outline" size={24} color={colors.inkSoft} />
        <T variant="body" weight="semibold" style={{ flex: 1 }}>Nhờ Thư hỏi {m.roleLabel.toLowerCase()} một câu</T>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </Card>

      {posts.length > 0 && (
        <>
          <SectionHeader title="Ảnh gần đây" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
            {posts.map((p) => <PostCard key={p.id} post={p} width={220} />)}
          </ScrollView>
        </>
      )}
      {stories.length > 0 && (
        <>
          <SectionHeader title={`Chuyện ${m.roleLabel.toLowerCase()} kể`} />
          <View style={{ gap: 14 }}>{stories.map((s) => <StoryCard key={s.id} story={s} compact />)}</View>
        </>
      )}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9 }}>
      <T variant="body" color={colors.inkSoft} style={{ flexShrink: 1 }}>{label}</T>
      <T variant="body" weight="semibold">{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  action: { flex: 1, height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  facts: { backgroundColor: colors.tone, borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: 10, marginTop: 16 },
});
