import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, BackHeader, Screen, SectionHeader, T } from '@/components/ui';
import { inDaysLabel, relativeTime } from '@/lib/format';
import { member, nudges, upcoming } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

type Item = { key: string; avatar: string; uri?: string; text: string; time: string; href: string; ts: number };

export default function Notifications() {
  const { state } = useApp();
  const items: Item[] = [];
  for (const p of state.posts.filter((p) => p.authorId !== state.meId).slice(0, 6)) {
    const a = member(state, p.authorId);
    items.push({ key: p.id, avatar: a?.name ?? '?', uri: a?.avatarUri, text: `${a?.roleLabel} gửi ảnh: “${p.caption}”`, time: relativeTime(p.createdAt), href: `/post/${p.id}`, ts: Date.parse(p.createdAt) });
  }
  for (const s of state.stories.slice(0, 4)) {
    const a = member(state, s.tellerId);
    items.push({ key: s.id, avatar: a?.name ?? '?', uri: a?.avatarUri, text: `Trang ký ức mới: “${s.title}” (${a?.roleLabel} kể)`, time: relativeTime(s.createdAt), href: `/story/${s.id}`, ts: Date.parse(s.createdAt) });
  }
  items.sort((a, b) => b.ts - a.ts);
  const soon = upcoming(state).filter((e) => e.inDays <= e.event.remindDaysBefore);
  const remind = nudges(state);

  return (
    <Screen>
      <BackHeader title="Thông báo" />
      {(soon.length > 0 || remind.length > 0) && (
        <>
          <SectionHeader title="Cần để ý" />
          {soon.map((e) => (
            <Pressable key={e.event.id} onPress={() => router.push('/calendar')} style={[styles.row, styles.hot]}>
              <Avatar name={e.event.title} icon={e.event.kind === 'gio' ? 'flower-outline' : 'gift-outline'} size={44} />
              <View style={{ flex: 1 }}>
                <T variant="body" weight="semibold">{e.event.title}</T>
                <T variant="small" color={colors.muted}>{inDaysLabel(e.inDays)}. Đặt quà hoặc hẹn giờ gọi về.</T>
              </View>
            </Pressable>
          ))}
          {remind.map((n) => (
            <Pressable key={n.member.id} onPress={() => router.push(`/member/${n.member.id}`)} style={[styles.row, styles.hot]}>
              <Avatar name={n.member.name} uri={n.member.avatarUri} size={44} />
              <View style={{ flex: 1 }}>
                <T variant="body" weight="semibold">{n.days} ngày chưa gọi cho {n.member.roleLabel.toLowerCase()}</T>
                <T variant="small" color={colors.muted}>{n.starter}</T>
              </View>
            </Pressable>
          ))}
        </>
      )}
      <SectionHeader title="Mới nhất" />
      {items.map((i) => (
        <Pressable key={i.key} onPress={() => router.push(i.href as never)} style={styles.row}>
          <Avatar name={i.avatar} uri={i.uri} size={44} />
          <View style={{ flex: 1 }}>
            <T variant="body">{i.text}</T>
            <T variant="small" color={colors.muted}>{i.time}</T>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  hot: { backgroundColor: colors.tone, borderRadius: radius.lg, paddingHorizontal: 14, marginBottom: 8 },
});
