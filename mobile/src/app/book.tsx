import { Ionicons } from '@/components/Icon';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BackHeader, Button, Card, Screen, SectionHeader, T } from '@/components/ui';
import { canChiYear } from '@/lib/lunar';
import { daysToTet, lunarToday, member, visibleStories } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

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
      <View style={styles.cover}>
        <T variant="small" weight="medium" color="rgba(255,255,255,0.85)">Sổ ký ức gia đình, Tết {canChiYear(year)}</T>
        <View style={{ flex: 1 }} />
        <T variant="display" color={colors.white} style={{ fontSize: 40, lineHeight: 46 }}>Chuyện của {state.family.name.toLowerCase()}</T>
        <T variant="body" color="rgba(255,255,255,0.88)" style={{ marginTop: 8 }}>
          {stories.length} câu chuyện của {new Set(stories.map((s) => s.tellerId)).size} người kể
        </T>
      </View>
      <T variant="body" color={colors.inkSoft} style={{ marginTop: 16 }}>
        Còn {daysToTet()} ngày nữa là Tết. Đặt trước 25 tháng Chạp để kịp nhận sách.
      </T>

      <SectionHeader title="Mục lục" />
      <Card style={{ gap: 10 }}>
        {chapters.map(({ c, n }, i) => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <T variant="small" color={colors.muted} style={{ width: 22 }}>{i + 1}</T>
            <T variant="h3" serif weight="semibold" style={{ flex: 1 }}>{c.title}</T>
            <T variant="small" color={colors.muted}>{n} trang</T>
          </View>
        ))}
      </Card>

      {sample && (
        <>
          <SectionHeader title="Trang mẫu" />
          <View style={styles.page}>
            <T variant="small" color={colors.muted}>Chương {state.chapters.find((c) => c.id === sample.chapterId)?.title.toLowerCase()}, năm {sample.year}</T>
            <T variant="h1" style={{ marginTop: 6 }}>{sample.title}</T>
            <T variant="body" serif color={colors.inkSoft} style={{ marginTop: 12, lineHeight: 27 }} numberOfLines={6}>{sample.transcript}</T>
            <View style={styles.qrRow}>
              <View style={styles.qr}><Ionicons name="qr-code" size={44} color={colors.black} /></View>
              <T variant="small" color={colors.muted} style={{ flex: 1 }}>
                Quét mã để nghe {member(state, sample.tellerId)?.roleLabel.toLowerCase()} kể bằng chính giọng của mình.
              </T>
            </View>
          </View>
        </>
      )}

      <SectionHeader title="Chọn bản in" />
      <Option title="Bìa mềm, 60 trang" price="₩29.000" note="Giao về Việt Nam hoặc Hàn Quốc" />
      <Option title="Bìa cứng, 120 trang" price="₩49.000" note="Có hộp quà Tết, thiệp viết tay" highlight />
      <Button label="Đặt in sách Tết" icon="gift-outline" style={{ marginTop: 18 }} onPress={() => router.push('/premium')} />
      <T variant="small" color={colors.muted} center style={{ marginTop: 10 }}>Giá là giả định để khảo sát, chưa phải giá bán thật.</T>
    </Screen>
  );
}

function Option({ title, price, note, highlight }: { title: string; price: string; note: string; highlight?: boolean }) {
  return (
    <View style={[styles.option, highlight && { backgroundColor: colors.toneDeep }]}>
      <View style={{ flex: 1 }}>
        <T variant="body" weight="semibold">{title}</T>
        <T variant="small" color={colors.inkSoft}>{note}</T>
      </View>
      <T variant="h3" weight="semibold">{price}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { height: 280, borderRadius: radius.lg, backgroundColor: '#A44A3B', padding: 24, marginTop: 8 },
  page: { backgroundColor: colors.tone, borderRadius: radius.sm, padding: 22 },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  qr: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16, marginBottom: 10 },
});
