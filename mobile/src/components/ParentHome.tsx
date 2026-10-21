import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { relativeTime } from '@/lib/format';
import { formatLunar } from '@/lib/lunar';
import { lunarToday, me, member, others } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadow } from '@/theme';
import { Avatar, PhotoTile, Screen, T, type IconName } from './ui';

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
          <T variant="h2">Chào {self.roleLabel.toLowerCase()}!</T>
          <T variant="small" color={colors.muted}>Hôm nay {formatLunar(lunarToday())}</T>
        </View>
      </View>

      {latest && (
        <Pressable onPress={() => router.push(`/post/${latest.id}`)} style={{ marginTop: 20 }}>
          <PhotoTile seed={latest.id} emoji={latest.emoji} uri={latest.photoUri} height={280}>
            <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
              <T variant="h3" color={colors.white}>{author?.roleLabel} gửi · {relativeTime(latest.createdAt)}</T>
              <T variant="body" color={colors.white} numberOfLines={2}>{latest.caption}</T>
            </View>
          </PhotoTile>
          <Pressable onPress={() => dispatch({ type: 'react', postId: latest.id, emoji: '❤️' })} style={styles.heart}>
            <Ionicons name="heart" size={30} color={colors.white} />
          </Pressable>
        </Pressable>
      )}

      <View style={{ gap: 14, marginTop: 28 }}>
        <Big icon="camera" title="Gửi ảnh cho con" text="Chụp mâm cơm, khu vườn, bất cứ thứ gì" color={colors.primary} onPress={() => router.push('/capture')} />
        <Big icon="mic" title="Kể chuyện cho con nghe" text="Thư sẽ hỏi, bố mẹ chỉ việc kể" color={colors.black} onPress={() => router.push({ pathname: '/call', params: { as: 'elder' } })} />
        <Big icon="call" title={`Gọi cho ${others(state)[0]?.roleLabel.toLowerCase() ?? 'con'}`} text="Mở Zalo để gọi video" color={colors.green} onPress={() => router.push(`/member/${others(state)[0]?.id}`)} />
      </View>

      <Pressable onPress={() => dispatch({ type: 'updateSettings', patch: { parentMode: false } })} style={{ alignSelf: 'center', marginTop: 28 }}>
        <T variant="small" color={colors.muted}>Tắt chế độ bố mẹ</T>
      </Pressable>
    </Screen>
  );
}

function Big({ icon, title, text, color, onPress }: { icon: IconName; title: string; text: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.big, shadow.soft, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.bigIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={30} color={colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="h3" weight="bold">{title}</T>
        <T variant="small" color={colors.muted}>{text}</T>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heart: {
    position: 'absolute', right: 16, bottom: -22, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.black,
    alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.white,
  },
  big: {
    flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.white, borderRadius: radius.xl, padding: 18,
  },
  bigIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
