import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Logo, PhotoTile, Screen, Steps, T } from '@/components/ui';
import { lunarMonthName } from '@/lib/format';
import { nextSolarForLunar } from '@/lib/lunar';
import { useApp } from '@/store/AppContext';
import { colors, familyTones, radius } from '@/theme';

// Mỗi trang giới thiệu cho xem đúng một mảnh giao diện thật của app, không dùng hình minh hoạ.
const SLIDES: Array<{ title: string; text: string; preview: () => ReactNode }> = [
  {
    title: 'Mỗi ngày một tấm ảnh cho bố mẹ',
    text: 'Bấm widget ngoài màn hình là chụp. Ảnh hiện ngay trên điện thoại của bố mẹ, không cần mở app.',
    preview: () => (
      <PhotoTile seed="slide-1" tone={familyTones[1]} height={300}>
        <View style={styles.noteInner}>
          <T variant="small" weight="medium" color="rgba(255,255,255,0.82)">Ăn cơm chưa?</T>
          <T variant="h2" weight="regular" color={colors.white} style={{ fontSize: 26, lineHeight: 34, flex: 1 }}>
            Mâm cơm tối nay: canh cua rau đay, cà pháo. Con ăn cơm chưa?
          </T>
          <T variant="small" weight="semibold" color={colors.white}>Mẹ, 1 giờ trước</T>
        </View>
      </PhotoTile>
    ),
  },
  {
    title: 'Sổ ký ức bằng chính giọng bố mẹ',
    text: 'Thư, trợ lý AI của gia đình, hỏi chuyện bố mẹ mỗi tuần. Mỗi câu chuyện thành một trang ký ức, cuối năm in thành sách.',
    preview: () => (
      <View style={styles.panel}>
        <T serif weight="bold" style={{ fontSize: 64, lineHeight: 68, letterSpacing: -2 }}>1992</T>
        <T variant="h3" weight="semibold">Ngày đầu đi làm ở nhà máy dệt</T>
        <T variant="body" serif color={colors.inkSoft} style={{ fontSize: 18, lineHeight: 27 }}>“Mẹ ngồi chờ ở cổng mà tim đập thình thịch.”</T>
        <T variant="small" color={colors.muted}>Mẹ kể, 6 phút 12 giây</T>
      </View>
    ),
  },
  {
    title: 'Không bao giờ quên ngày giỗ',
    text: 'Sinh nhật âm, ngày giỗ, Tết, rằm. Tính theo lịch Việt Nam, nhắc trước để kịp gọi về và gửi quà.',
    preview: () => {
      const tet = nextSolarForLunar(1, 1, new Date());
      return (
        <View style={styles.panel}>
          <T variant="h3" weight="semibold" color={colors.primary}>Tết Nguyên Đán</T>
          <T serif weight="bold" color={colors.primary} style={{ fontSize: 120, lineHeight: 124, letterSpacing: -4 }}>{tet.getDate()}</T>
          <T variant="body" weight="medium">Tháng {tet.getMonth() + 1}, {tet.getFullYear()}</T>
          <T variant="body" weight="medium" color={colors.lunar}>Mùng 1 {lunarMonthName(1)}</T>
        </View>
      );
    },
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
      <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo small />
        {!last && (
          <Pressable onPress={() => setI(SLIDES.length - 1)} hitSlop={10} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <T variant="small" color={colors.inkSoft} weight="semibold">Bỏ qua</T>
          </Pressable>
        )}
      </View>
      <View style={{ marginTop: 12 }}>{slide.preview()}</View>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <T variant="display">{slide.title}</T>
        <T variant="body" color={colors.inkSoft}>{slide.text}</T>
      </View>
      <Steps current={i + 1} total={SLIDES.length} />
      <Button label={last ? 'Bắt đầu' : 'Tiếp tục'} onPress={next} style={{ marginBottom: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  noteInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 18, gap: 10 },
  panel: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 22, gap: 8, height: 300, justifyContent: 'flex-end' },
});
