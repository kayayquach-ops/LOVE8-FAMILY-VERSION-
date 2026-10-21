import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BackHeader, Button, Card, Empty, Screen, SectionHeader, T } from '@/components/ui';
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
      <BackHeader title="Món của mẹ" />
      <T variant="display" style={{ marginTop: 8 }}>{r.title}</T>
      <T variant="body" color={colors.inkSoft} style={{ marginTop: 6 }}>
        Công thức của {teller?.roleLabel.toLowerCase()}. Nấu {r.minutes} phút, đủ cho {r.serves} người.
      </T>
      <View style={styles.tip}>
        <T variant="small" weight="semibold" color={colors.inkSoft}>{teller?.roleLabel} dặn</T>
        <T variant="h2" weight="regular" style={{ fontSize: 22, lineHeight: 30 }}>“{r.tip}”</T>
      </View>

      <SectionHeader title="Nguyên liệu" />
      <View style={{ gap: 8 }}>
        {r.ingredients.map((i) => <T key={i} variant="body">{i}</T>)}
      </View>

      <SectionHeader title="Các bước" />
      {r.steps.map((s, k) => (
        <View key={k} style={styles.step}>
          <T variant="h2" weight="bold" style={styles.num}>{k + 1}</T>
          <T variant="body" style={{ flex: 1 }}>{s}</T>
        </View>
      ))}

      <SectionHeader title="Ở Hàn mua gì thay?" />
      <Card style={{ gap: 10 }}>
        {r.koreaSwaps.map((s) => <T key={s} variant="body">{s}</T>)}
      </Card>

      <Button
        label={cooked ? 'Đã khoe với mẹ' : 'Con nấu thử rồi, chụp khoe mẹ'}
        icon={cooked ? 'checkmark' : 'camera'} style={{ marginTop: 24 }} disabled={cooked}
        onPress={() => { dispatch({ type: 'cooked', recipeId: r.id }); router.push('/capture'); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tip: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, marginTop: 20, gap: 6 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 14 },
  num: { width: 24, fontSize: 20, lineHeight: 24 },
});
