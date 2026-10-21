import { router } from 'expo-router';
import { View } from 'react-native';
import { Avatar, BackHeader, Card, Screen, T } from '@/components/ui';
import { member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// "Món của mẹ": công thức mẹ kể bằng giọng nói, Thư biến thành các bước, kèm cách thay nguyên liệu ở Hàn.
export default function Recipes() {
  const { state } = useApp();
  return (
    <Screen>
      <BackHeader title="Món của mẹ" />
      <T variant="body" color={colors.inkSoft} style={{ marginBottom: 20 }}>
        Mẹ kể cách nấu, Thư chép thành từng bước. Ở Hàn khó mua nguyên liệu? Mỗi món có gợi ý thay thế.
      </T>
      <View style={{ gap: 16 }}>
        {state.recipes.map((r) => {
          const teller = member(state, r.tellerId);
          return (
            <Card key={r.id} onPress={() => router.push(`/recipe/${r.id}`)} style={{ gap: 8, padding: 20 }}>
              <T variant="h1">{r.title}</T>
              <T variant="body" serif color={colors.inkSoft} numberOfLines={2}>“{r.tip}”</T>
              <T variant="small" color={colors.muted}>
                {r.minutes} phút, đủ cho {r.serves} người{r.cookedBy.length ? `. ${r.cookedBy.length} người đã nấu theo` : ''}.
              </T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Avatar name={teller?.name ?? '?'} uri={teller?.avatarUri} size={26} />
                <T variant="small" color={colors.inkSoft}>Công thức của {teller?.roleLabel.toLowerCase()}</T>
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

