import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { PostCard, StoryCard } from '@/components/Feed';
import { Avatar, BackHeader, Card, Empty, Screen, SectionHeader, T } from '@/components/ui';
import { inDaysLabel, localTimeFor, relativeTime } from '@/lib/format';
import { canChiYear, daysBetween, nextSolarAnniversary, nextSolarForLunar, zodiacEmoji } from '@/lib/lunar';
import { daysAway, daysSinceCall, member, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadow } from '@/theme';

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
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar name={m.name} uri={m.avatarUri} size={96} ring />
        <T variant="h2">{m.name}</T>
        <T variant="small" color={colors.muted}>{m.roleLabel} · {m.city} · bây giờ {localTimeFor(m.country)}</T>
        <T variant="caption" color={colors.muted}>Hoạt động {relativeTime(m.lastActiveAt)}</T>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={callZalo} style={[styles.action, { backgroundColor: colors.primary }]}>
          <Ionicons name="videocam" size={18} color={colors.white} />
          <T variant="small" weight="semibold" color={colors.white}>Gọi qua Zalo</T>
        </Pressable>
        <Pressable onPress={() => dispatch({ type: 'markCalled', memberId: m.id })} style={[styles.action, { backgroundColor: colors.field }]}>
          <Ionicons name="checkmark-done" size={18} color={colors.ink} />
          <T variant="small" weight="semibold">{since === 0 ? 'Hôm nay đã gọi' : 'Đánh dấu đã gọi'}</T>
        </Pressable>
      </View>

      <View style={[styles.facts, shadow.soft]}>
        <Fact label="Lần gọi gần nhất" value={since >= 99 ? 'Chưa có' : since === 0 ? 'Hôm nay' : `${since} ngày trước`} />
        {b && nextBirthday && (
          <Fact
            label={`Sinh nhật (${b.calendar === 'lunar' ? 'âm' : 'dương'} ${b.day}/${b.month})`}
            value={inDaysLabel(daysBetween(new Date(), nextBirthday))}
          />
        )}
        {b?.year && <Fact label="Tuổi" value={`${canChiYear(b.year)} ${zodiacEmoji(b.year)}`} />}
        {away !== undefined && <Fact label="Đã xa nhà" value={`${away} ngày`} />}
      </View>

      <Card onPress={() => router.push('/ask')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <T variant="h2">❓</T>
        <T variant="body" weight="semibold" style={{ flex: 1 }}>Nhờ Thư hỏi {m.roleLabel.toLowerCase()} một câu</T>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </Card>

      {posts.length > 0 && (
        <>
          <SectionHeader title="Ảnh gần đây" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {posts.map((p) => <PostCard key={p.id} post={p} width={180} />)}
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
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
      <T variant="small" color={colors.muted}>{label}</T>
      <T variant="small" weight="semibold">{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  action: { flex: 1, height: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  facts: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 8, marginTop: 16 },
});
