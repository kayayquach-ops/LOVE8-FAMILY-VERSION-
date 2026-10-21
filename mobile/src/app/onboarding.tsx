import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Logo, PhotoTile, Screen, T, type IconName } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const SLIDES: Array<{ emoji: string; seed: string; icon: IconName; title: string; bold: string; text: string }> = [
  {
    emoji: '🍲', seed: 'slide-1', icon: 'camera',
    bold: 'Ăn cơm chưa?', title: 'mỗi ngày một tấm ảnh',
    text: 'Bấm widget ngoài màn hình là chụp. Ảnh hiện ngay trên điện thoại của bố mẹ, không cần mở app.',
  },
  {
    emoji: '📖', seed: 'slide-2', icon: 'book',
    bold: 'Sổ ký ức', title: 'bằng chính giọng bố mẹ',
    text: 'Thư, trợ lý AI của gia đình, hỏi chuyện bố mẹ mỗi tuần. Mỗi câu chuyện thành một trang ký ức, cuối năm in thành sách.',
  },
  {
    emoji: '🌕', seed: 'slide-3', icon: 'calendar',
    bold: 'Lịch âm', title: 'không bao giờ quên ngày giỗ',
    text: 'Sinh nhật âm, ngày giỗ, Tết, rằm. Tính theo lịch Việt Nam, nhắc trước để kịp gọi về và gửi quà.',
  },
];

export default function Onboarding() {
  const { dispatch } = useApp();
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  function next() {
    if (!last) return setI(i + 1);
    dispatch({ type: 'completeOnboarding' });
    router.replace('/auth/phone');
  }

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Logo small />
      </View>
      <PhotoTile seed={slide.seed} emoji={slide.emoji} height={340} radiusSize={radius.xl} style={{ marginTop: 16 }}>
        <View style={styles.badge}>
          <Ionicons name={slide.icon} size={22} color={colors.primary} />
        </View>
      </PhotoTile>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <T variant="h1" weight="regular">
          <T variant="h1" weight="bold">{slide.bold} </T>
          {slide.title}
        </T>
        <T variant="body" color={colors.muted}>{slide.text}</T>
      </View>
      <View style={styles.dots}>
        {SLIDES.map((_, k) => (
          <View key={k} style={[styles.dot, k === i && { width: 22, backgroundColor: colors.primary }]} />
        ))}
      </View>
      <Button label={last ? 'Bắt đầu' : 'Tiếp tục'} onPress={next} />
      {!last && (
        <Pressable onPress={() => setI(SLIDES.length - 1)} style={{ alignSelf: 'center', marginTop: 14, padding: 4 }}>
          <T variant="small" color={colors.muted} weight="semibold">Bỏ qua</T>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: 16, right: 16, width: 46, height: 46, borderRadius: 16,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
});
