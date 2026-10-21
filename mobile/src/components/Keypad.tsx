import { Ionicons } from '@/components/Icon';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { T } from './ui';

const KEYS: Array<[string, string]> = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
];

// Bàn phím số: lưới 3 cột, phím xoá ở góc phải.
export function Keypad({ onKey, onDelete }: { onKey: (k: string) => void; onDelete: () => void }) {
  return (
    <View style={styles.wrap}>
      {KEYS.map(([k, sub]) => (
        <Key key={k} onPress={() => onKey(k)}>
          <T variant="h2" serif={false} weight="medium">{k}</T>
          <T variant="caption" color={colors.muted} style={{ fontSize: 11, lineHeight: 13 }}>{sub}</T>
        </Key>
      ))}
      <View style={styles.key} />
      <Key onPress={() => onKey('0')}>
        <T variant="h2" serif={false} weight="medium">0</T>
      </Key>
      <Key onPress={onDelete} plain>
        <Ionicons name="backspace-outline" size={22} color={colors.ink} />
      </Key>
    </View>
  );
}

function Key({ children, onPress, plain }: { children: React.ReactNode; onPress: () => void; plain?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.key, !plain && styles.keyFace, pressed && { backgroundColor: colors.toneDeep }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.bg, paddingHorizontal: 6, paddingTop: 8,
    paddingBottom: 18, gap: 6, justifyContent: 'center',
  },
  key: { width: '31.5%', height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26 },
  keyFace: { backgroundColor: colors.tone },
});
