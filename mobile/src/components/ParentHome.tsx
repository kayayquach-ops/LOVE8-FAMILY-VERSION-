import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { lunarMonthName, relativeTime } from '@/lib/format';
import { lunarToday, me, member, others } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';
import { Avatar, Button, memberTone, PhotoTile, Screen, T, type IconName } from './ui';

// "Chế độ bố mẹ": ít nút, chữ to, ba việc chính. Dành cho người lớn tuổi ít dùng app.
export default function ParentHome() {
  const { state, dispatch } = useApp();
  const self = me(state);
  const latest = state.posts.find((p) => p.authorId !== state.meId);
  const author = latest ? member(state, latest.authorId) : undefined;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <Avatar name={self.name} uri={self.avatarUri} size={52} onPress={() => router.push('/family')} />
        <View style={{ flex: 1 }}>
          <T variant="h1">Chào {self.roleLabel.toLowerCase()}</T>
          <T variant="body" color={colors.lunar}>Hôm nay ngày {lunarToday().day} {lunarMonthName(lunarToday().month, lunarToday().leap)}</T>
        </View>
      </View>

      {latest && (
        <View style={{ marginTop: 24, gap: 12 }}>
          <Pressable onPress={() => router.push(`/post/${latest.id}`)} accessibilityRole="button">
            <PhotoTile seed={latest.id} tone={memberTone(state.family.members, latest.authorId)} uri={latest.photoUri} height={300}>
              <View style={styles.noteInner}>
                <T variant="h2" weight="regular" color={colors.white} numberOfLines={6} style={{ fontSize: 28, lineHeight: 37, flex: 1 }}>{latest.caption}</T>
                <T variant="h3" color={colors.white}>{author?.roleLabel} gửi, {relativeTime(latest.createdAt)}</T>
              </View>
            </PhotoTile>
          </Pressable>
          <Button label={latest.reactions[state.meId] ? 'Đã thả tim' : 'Thả tim cho con'} icon="heart"
            variant={latest.reactions[state.meId] ? 'soft' : 'dark'} onPress={() => dispatch({ type: 'react', postId: latest.id, emoji: '❤️' })} />
        </View>
      )}

      <View style={{ gap: 14, marginTop: 28 }}>
        <Big icon="camera" title="Gửi ảnh cho con" text="Chụp mâm cơm, khu vườn, bất cứ thứ gì" primary onPress={() => router.push('/capture')} />
        <Big icon="mic" title="Kể chuyện cho con nghe" text="Thư sẽ hỏi, bố mẹ chỉ việc kể" onPress={() => router.push({ pathname: '/call', params: { as: 'elder' } })} />
        <Big icon="call" title={`Gọi cho ${others(state)[0]?.roleLabel.toLowerCase() ?? 'con'}`} text="Mở Zalo để gọi video" onPress={() => router.push(`/member/${others(state)[0]?.id}`)} />
      </View>

      <Pressable onPress={() => dispatch({ type: 'updateSettings', patch: { parentMode: false } })} accessibilityRole="button"
        style={{ alignSelf: 'center', marginTop: 28, minHeight: 44, justifyContent: 'center' }}>
        <T variant="small" weight="semibold" color={colors.inkSoft}>Tắt chế độ bố mẹ</T>
      </Pressable>
    </Screen>
  );
}

function Big({ icon, title, text, primary, onPress }: { icon: IconName; title: string; text: string; primary?: boolean; onPress: () => void }) {
  const fg = primary ? colors.white : colors.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.big, { backgroundColor: primary ? (pressed ? colors.primaryDark : colors.primary) : pressed ? colors.toneDeep : colors.tone }]}>
      <Ionicons name={icon} size={32} color={fg} />
      <View style={{ flex: 1 }}>
        <T variant="h3" weight="bold" color={fg}>{title}</T>
        <T variant="small" color={primary ? 'rgba(255,255,255,0.88)' : colors.inkSoft}>{text}</T>
      </View>
      <Ionicons name="chevron-forward" size={22} color={primary ? colors.white : colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  noteInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 20, gap: 12 },
  big: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.lg, padding: 20, minHeight: 88 },
});
