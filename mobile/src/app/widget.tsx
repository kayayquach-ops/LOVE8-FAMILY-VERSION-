import { Ionicons } from '@/components/Icon';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackHeader, memberTone, PhotoTile, Screen, SectionHeader, T } from '@/components/ui';
import { relativeTime, weekday } from '@/lib/format';
import { daysToTet, member, others, postedToday } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// Xem trước widget ngoài màn hình chính. Widget thật cần bản build riêng (không chạy trong Expo Go):
// iOS dùng WidgetKit (Swift), Android dùng App Widget. Bấm widget sẽ mở thẳng màn hình chụp nhanh.
export default function WidgetPreview() {
  const { state } = useApp();
  const latest = state.posts.find((p) => p.authorId !== state.meId);
  const author = latest ? member(state, latest.authorId) : undefined;

  return (
    <Screen>
      <BackHeader title="Widget màn hình chính" />
      <View style={styles.phone}>
        <T variant="display" color={colors.white} center style={{ marginTop: 20, fontSize: 44, lineHeight: 52 }}>09:41</T>
        <T variant="small" color="rgba(255,255,255,0.85)" center>{weekday(new Date())}, {new Date().getDate()} tháng {new Date().getMonth() + 1}</T>

        <View style={styles.row}>
          <Pressable onPress={() => router.push(latest ? `/post/${latest.id}` : '/feed')} style={styles.small}>
            {latest && (
              <PhotoTile seed={latest.id} tone={memberTone(state.family.members, latest.authorId)} uri={latest.photoUri} height={150} radiusSize={20}>
                <View style={{ position: 'absolute', left: 12, right: 12, top: 12, bottom: 12, justifyContent: 'space-between' }}>
                  <T variant="small" serif color={colors.white} numberOfLines={4}>{latest.caption}</T>
                  <T variant="caption" weight="semibold" color={colors.white}>{author?.roleLabel}, {relativeTime(latest.createdAt)}</T>
                </View>
              </PhotoTile>
            )}
          </Pressable>
          <Pressable onPress={() => router.push('/capture')} style={[styles.small, styles.white]}>
            <T variant="caption" color={colors.inkSoft}>Ăn cơm chưa?</T>
            <View style={styles.shoot}><Ionicons name="camera" size={30} color={colors.white} /></View>
            <T variant="caption" weight="semibold" center>Chạm để chụp</T>
          </Pressable>
        </View>

        <View style={[styles.medium, styles.white]}>
          <View style={{ flex: 1, gap: 8 }}>
            <T variant="small" weight="semibold">Nhà mình hôm nay</T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {others(state).map((m) => (
                <View key={m.id} style={{ alignItems: 'center', gap: 2 }}>
                  <View style={[styles.dot, { backgroundColor: postedToday(state, m.id) ? colors.green : colors.line }]} />
                  <T variant="caption" style={{ fontSize: 12 }}>{m.roleLabel}</T>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.vline} />
          <View style={{ alignItems: 'center', paddingLeft: 12 }}>
            <T variant="h1" color={colors.primary}>{daysToTet()}</T>
            <T variant="caption" color={colors.inkSoft}>ngày nữa Tết</T>
          </View>
        </View>
      </View>

      <SectionHeader title="Cách thêm widget" />
      <Step n={1} text="Giữ ngón tay lên màn hình chính đến khi các biểu tượng rung." />
      <Step n={2} text="Bấm dấu + (iPhone) hoặc chọn Tiện ích (Android), tìm “Homeletter”." />
      <Step n={3} text="Chọn widget ảnh, widget chụp nhanh, hoặc widget “Nhà mình hôm nay”." />
      <T variant="small" color={colors.muted} style={{ marginTop: 8 }}>
        Chấm xanh nghĩa là người đó đã gửi ảnh hôm nay. App không chia sẻ vị trí của ai.
      </T>
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 }}>
      <T variant="h2" weight="bold" style={{ width: 22 }}>{n}</T>
      <T variant="body" style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  phone: { borderRadius: 36, padding: 18, paddingBottom: 24, borderWidth: 6, borderColor: colors.ink, backgroundColor: '#2E4874' },
  row: { flexDirection: 'row', gap: 14, marginTop: 26 },
  small: { flex: 1, height: 150, borderRadius: 22, overflow: 'hidden' },
  white: { backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 },
  shoot: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  medium: { flexDirection: 'row', alignItems: 'center', borderRadius: 22, marginTop: 14, padding: 16 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  vline: { width: 1, height: 44, backgroundColor: colors.line },
});
