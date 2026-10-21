import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhotoTile, T } from '@/components/ui';
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
  const photo = story.photoEmojis[i % story.photoEmojis.length];

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <PhotoTile key={i} seed={`${story.id}-${i % story.photoEmojis.length}`} emoji={photo} height={420} radiusSize={0} fill />
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
              <T variant="small" color={colors.white} style={{ opacity: 0.85 }}>Giọng kể: {teller?.roleLabel} · {story.year ?? ''}</T>
            </View>
            <Pressable onPress={() => router.back()} style={styles.round}>
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
          </View>
        </View>
        <Pressable onPress={() => setPaused(!paused)} style={{ flex: 1 }} />
        <View style={{ padding: 20, gap: 16 }}>
          <View style={styles.subtitle}>
            <T variant="h3" weight="semibold" color={colors.white} center>{lines[i]}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={styles.action} onPress={() => setPaused(!paused)}>
              <Ionicons name={paused ? 'play' : 'pause'} size={18} color={colors.ink} />
              <T variant="small" weight="semibold">{paused ? 'Phát' : 'Tạm dừng'}</T>
            </Pressable>
            <Pressable style={[styles.action, { backgroundColor: colors.primary }]}>
              <Ionicons name="download" size={18} color={colors.white} />
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
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  subtitle: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 18, padding: 16 },
  action: { flex: 1, height: 48, borderRadius: 999, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
