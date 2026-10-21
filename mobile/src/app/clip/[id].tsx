import { Ionicons } from '@/components/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { memberTone, T } from '@/components/ui';
import { member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// Bản xem trước "clip câu chuyện": ảnh chạy lần lượt, phụ đề lấy từ lời kể.
// Bản xuất video thật (ảnh + giọng kể + phụ đề) do máy chủ dựng bằng FFmpeg.
export default function Clip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useApp();
  const story = state.stories.find((s) => s.id === id);
  const lines = useMemo(
    () => (story?.transcript.match(/[^.!?…]+[.!?…]?/g) ?? []).map((s) => s.trim()).filter(Boolean),
    [story],
  );
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !lines.length) return;
    const t = setTimeout(() => setI((x) => (x + 1) % lines.length), 2600);
    return () => clearTimeout(t);
  }, [i, paused, lines.length]);

  if (!story) return null;
  const teller = member(state, story.tellerId);
  // Chưa gắn ảnh cũ: clip là phụ đề chữ lớn trên nền màu của người kể, như một lá thư đọc thành tiếng.
  const tone = memberTone(state.family.members, story.tellerId) ?? colors.ink;

  return (
    <View style={{ flex: 1, backgroundColor: tone }}>
      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }}>
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <View style={styles.bars}>
            {lines.map((_, k) => (
              <View key={k} style={[styles.bar, { backgroundColor: k <= i ? colors.white : 'rgba(255,255,255,0.35)' }]} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <T variant="h3" color={colors.white}>{story.title}</T>
              <T variant="small" color="rgba(255,255,255,0.85)">Giọng kể của {teller?.roleLabel.toLowerCase()}{story.year ? `, năm ${story.year}` : ''}</T>
            </View>
            <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Đóng" style={styles.round}>
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
          </View>
        </View>
        <Pressable onPress={() => setPaused(!paused)} accessibilityLabel={paused ? 'Phát tiếp' : 'Tạm dừng'} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
          <T variant="display" weight="regular" color={colors.white} style={{ fontSize: 34, lineHeight: 46 }}>{lines[i]}</T>
        </Pressable>
        <View style={{ padding: 20, gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={styles.action} accessibilityRole="button" onPress={() => setPaused(!paused)}>
              <Ionicons name={paused ? 'play' : 'pause'} size={18} color={colors.black} />
              <T variant="small" weight="semibold" color={colors.black}>{paused ? 'Phát' : 'Tạm dừng'}</T>
            </Pressable>
            <Pressable style={[styles.action, { backgroundColor: colors.black }]} accessibilityRole="button">
              <Ionicons name="download-outline" size={18} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>Lưu video gửi tặng</T>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', gap: 4, paddingTop: 6 },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  action: { flex: 1, height: 52, borderRadius: 999, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
