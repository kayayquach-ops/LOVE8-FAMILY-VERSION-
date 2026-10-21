import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BackHeader, Button, Card, Pill, Screen, SectionHeader, T } from '@/components/ui';
import { canChiYear } from '@/lib/lunar';
import { daysToTet, lunarToday, member, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadow } from '@/theme';

// Sách in dịp Tết: dàn trang tự động từ sổ ký ức, mỗi trang có mã QR nghe lại giọng kể.
export default function Book() {
  const { state } = useApp();
  const stories = visibleStories(state);
  const year = lunarToday().year + 1;
  const sample = stories[0];
  const chapters = state.chapters
    .map((c) => ({ c, n: stories.filter((s) => s.chapterId === c.id).length }))
    .filter((x) => x.n > 0);

  return (
    <Screen>
      <BackHeader title="Sách Tết" />
      <View style={[styles.cover, shadow.card]}>
        <T variant="caption" color={colors.primarySoft}>SỔ KÝ ỨC GIA ĐÌNH · TẾT {canChiYear(year).toUpperCase()}</T>
        <T variant="display" color={colors.white} style={{ marginTop: 12 }}>Chuyện của {state.family.name.toLowerCase()}</T>
        <T variant="small" color={colors.white} style={{ opacity: 0.85, marginTop: 6 }}>
          {stories.length} câu chuyện · {new Set(stories.map((s) => s.tellerId)).size} người kể
        </T>
        <View style={{ flex: 1 }} />
        <T variant="h1" style={{ alignSelf: 'flex-end' }}>🧧</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 14 }}>
        <Pill label={`Còn ${daysToTet()} ngày nữa là Tết`} icon="time" bg={colors.primarySoft} color={colors.primaryDark} />
        <Pill label="Đặt trước 25 tháng Chạp để kịp nhận" bg={colors.field} color={colors.inkSoft} />
      </View>

      <SectionHeader title="Mục lục" />
      <Card style={{ gap: 10 }}>
        {chapters.map(({ c, n }, i) => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T variant="small" color={colors.muted} style={{ width: 22 }}>{i + 1}</T>
            <T variant="body" style={{ flex: 1 }}>{c.emoji} {c.title}</T>
            <T variant="small" color={colors.muted}>{n} trang</T>
          </View>
        ))}
      </Card>

      {sample && (
        <>
          <SectionHeader title="Trang mẫu" />
          <View style={[styles.page, shadow.soft]}>
            <T variant="caption" color={colors.muted}>{state.chapters.find((c) => c.id === sample.chapterId)?.title.toUpperCase()} · {sample.year}</T>
            <T variant="h2" style={{ marginTop: 6 }}>{sample.title}</T>
            <T variant="small" color={colors.inkSoft} style={{ marginTop: 10, lineHeight: 22 }} numberOfLines={6}>{sample.transcript}</T>
            <View style={styles.qrRow}>
              <View style={styles.qr}><Ionicons name="qr-code" size={44} color={colors.ink} /></View>
              <T variant="caption" color={colors.muted} style={{ flex: 1 }}>
                Quét mã để nghe {member(state, sample.tellerId)?.roleLabel.toLowerCase()} kể bằng chính giọng của mình.
              </T>
            </View>
          </View>
        </>
      )}

      <SectionHeader title="Chọn bản in" />
      <Option title="Bìa mềm · 60 trang" price="₩29.000" note="Giao về Việt Nam hoặc Hàn Quốc" />
      <Option title="Bìa cứng · 120 trang" price="₩49.000" note="Có hộp quà Tết, thiệp viết tay" highlight />
      <Button label="Đặt in sách Tết" icon="gift" style={{ marginTop: 18 }} onPress={() => router.push('/premium')} />
      <T variant="caption" color={colors.muted} center style={{ marginTop: 10 }}>Giá là giả định để khảo sát, chưa phải giá bán thật.</T>
    </Screen>
  );
}

function Option({ title, price, note, highlight }: { title: string; price: string; note: string; highlight?: boolean }) {
  return (
    <View style={[styles.option, highlight && { borderColor: colors.primary, backgroundColor: colors.primaryTint }]}>
      <View style={{ flex: 1 }}>
        <T variant="body" weight="semibold">{title}</T>
        <T variant="small" color={colors.muted}>{note}</T>
      </View>
      <T variant="h3" color={colors.primaryDark}>{price}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { height: 260, borderRadius: radius.xl, backgroundColor: colors.primaryDark, padding: 24, marginTop: 8 },
  page: { backgroundColor: '#FFFBF5', borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: '#F1E6D8' },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  qr: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, padding: 16, marginBottom: 10 },
});
