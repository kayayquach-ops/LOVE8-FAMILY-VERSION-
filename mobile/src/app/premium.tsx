import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackHeader, Button, Screen, T } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadow } from '@/theme';

const ROWS: Array<[string, string, string]> = [
  ['Ảnh mỗi ngày, widget, lịch âm', '✓', '✓'],
  ['Trang ký ức mỗi tháng', '2', 'Không giới hạn'],
  ['Thư gọi hỏi chuyện bố mẹ', '—', 'Mỗi tuần'],
  ['Tâm sự riêng, nhờ Thư nói khéo', '3 lần/tháng', 'Không giới hạn'],
  ['Clip câu chuyện có giọng kể', '—', '✓'],
  ['Hộp thời gian', '1 hộp', 'Không giới hạn'],
  ['Giảm giá sách in dịp Tết', '—', '20%'],
];

// Giá ở đây là giả định để khảo sát. Khi phát hành, thanh toán qua App Store / Google Play (RevenueCat).
export default function Premium() {
  const { state, dispatch } = useApp();
  const [plan, setPlan] = useState<'year' | 'month'>('year');
  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader title="Gói Gia đình" />
      <View style={{ alignItems: 'center', gap: 6, marginVertical: 10 }}>
        <View style={styles.badge}><Ionicons name="star" size={30} color={colors.white} /></View>
        <T variant="h1" center>Một gói cho cả nhà</T>
        <T variant="small" color={colors.muted} center>Một người trả, mọi thành viên trong nhà đều được dùng.</T>
      </View>

      <View style={[styles.table, shadow.soft]}>
        <View style={styles.rowHead}>
          <T variant="caption" color={colors.muted} style={{ flex: 1.6 }}>TÍNH NĂNG</T>
          <T variant="caption" color={colors.muted} style={{ flex: 1 }} center>MIỄN PHÍ</T>
          <T variant="caption" color={colors.primary} style={{ flex: 1 }} center>GIA ĐÌNH</T>
        </View>
        {ROWS.map(([f, free, paid]) => (
          <View key={f} style={styles.row}>
            <T variant="small" style={{ flex: 1.6 }}>{f}</T>
            <T variant="small" color={colors.muted} style={{ flex: 1 }} center>{free}</T>
            <T variant="small" weight="semibold" style={{ flex: 1 }} center>{paid}</T>
          </View>
        ))}
      </View>

      <View style={{ gap: 10, marginTop: 18 }}>
        <Plan active={plan === 'year'} onPress={() => setPlan('year')} title="Theo năm" price="₩49.000 / năm" note="Tiết kiệm 17% · tương đương ₩4.083/tháng" tag="Phổ biến" />
        <Plan active={plan === 'month'} onPress={() => setPlan('month')} title="Theo tháng" price="₩4.900 / tháng" note="Huỷ bất cứ lúc nào" />
      </View>

      <Button
        label={state.settings.premium ? 'Bạn đang dùng Gói Gia đình' : 'Dùng thử miễn phí 7 ngày'}
        disabled={state.settings.premium}
        style={{ marginTop: 20 }}
        onPress={() => { dispatch({ type: 'updateSettings', patch: { premium: true } }); router.back(); }}
      />
      <T variant="caption" color={colors.muted} center style={{ marginTop: 10 }}>
        Bản demo: không trừ tiền. Hoặc tặng bố mẹ "Hộp quà Tết": 1 năm Gói Gia đình kèm sách in.
      </T>
    </Screen>
  );
}

function Plan({ active, onPress, title, price, note, tag }: { active: boolean; onPress: () => void; title: string; price: string; note: string; tag?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.plan, active && { borderColor: colors.primary, backgroundColor: colors.primaryTint }]}>
      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? colors.primary : colors.faint} />
      <View style={{ flex: 1 }}>
        <T variant="body" weight="semibold">{title}{tag ? '  ' : ''}{tag && <T variant="caption" color={colors.primary}>{tag}</T>}</T>
        <T variant="caption" color={colors.muted}>{note}</T>
      </View>
      <T variant="body" weight="bold">{price}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  table: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, marginTop: 14 },
  rowHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, padding: 16 },
});
