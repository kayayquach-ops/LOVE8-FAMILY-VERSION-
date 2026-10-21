import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BackHeader, Button, Card, Empty, PhotoTile, Screen, SectionHeader, T } from '@/components/ui';
import { member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useApp();
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return <Screen><BackHeader /><Empty icon="restaurant-outline" title="Không tìm thấy món" /></Screen>;
  const teller = member(state, r.tellerId);
  const cooked = r.cookedBy.includes(state.meId);

  return (
    <Screen>
      <BackHeader title={r.title} />
      <PhotoTile seed={r.id} emoji={r.emoji} height={220} />
      <View style={styles.tip}>
        <T variant="caption" color={colors.primaryDark}>{teller?.roleLabel.toUpperCase()} DẶN</T>
        <T variant="h3" weight="semibold" color={colors.primaryDark}>“{r.tip}”</T>
      </View>

      <SectionHeader title="Nguyên liệu" />
      <Card style={{ gap: 8 }}>
        {r.ingredients.map((i) => <T key={i} variant="body">• {i}</T>)}
      </Card>

      <SectionHeader title="Các bước" />
      {r.steps.map((s, k) => (
        <View key={k} style={styles.step}>
          <View style={styles.num}><T variant="small" weight="bold" color={colors.white}>{k + 1}</T></View>
          <T variant="body" style={{ flex: 1 }}>{s}</T>
        </View>
      ))}

      <SectionHeader title="Ở Hàn mua gì thay?" />
      <Card style={{ gap: 8, backgroundColor: colors.blueSoft }}>
        {r.koreaSwaps.map((s) => <T key={s} variant="small">🇰🇷 {s}</T>)}
      </Card>

      <Button
        label={cooked ? 'Đã khoe với mẹ ✓' : 'Con nấu thử rồi, chụp khoe mẹ'}
        icon="camera" style={{ marginTop: 20 }} disabled={cooked}
        onPress={() => { dispatch({ type: 'cooked', recipeId: r.id }); router.push('/capture'); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tip: { backgroundColor: colors.primaryTint, borderRadius: radius.lg, padding: 16, marginTop: 14, gap: 4 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
