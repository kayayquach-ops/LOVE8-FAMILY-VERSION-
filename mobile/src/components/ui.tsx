import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND } from '@/brand';
import { useApp } from '@/store/AppContext';
import { colors, familyTones, fonts, radius, space } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'caption';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';
const sizes: Record<Variant, number> = { display: 32, h1: 26, h2: 21, h3: 17, body: 16, small: 14, caption: 13 };
const defaultWeight: Record<Variant, Weight> = {
  display: 'bold', h1: 'bold', h2: 'semibold', h3: 'semibold', body: 'regular', small: 'regular', caption: 'medium',
};
// Tiêu đề dùng Literata, phần còn lại dùng Be Vietnam Pro.
const serifByDefault: Record<Variant, boolean> = {
  display: true, h1: true, h2: true, h3: false, body: false, small: false, caption: false,
};

function fontFor(weight: Weight, serif: boolean): string {
  if (!serif) return fonts[weight];
  if (weight === 'bold') return fonts.serifBold;
  if (weight === 'semibold') return fonts.serifSemibold;
  return fonts.serif;
}

export function T({
  children, variant = 'body', weight, serif, color = colors.ink, style, numberOfLines, center,
}: {
  children: ReactNode;
  variant?: Variant;
  weight?: Weight;
  serif?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  const { state } = useApp();
  // Chế độ bố mẹ phóng to chữ cho dễ đọc.
  const scale = state.settings.parentMode ? 1.18 : 1;
  const size = sizes[variant] * scale;
  const isSerif = serif ?? serifByDefault[variant];
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: fontFor(weight ?? defaultWeight[variant], isSerif),
          fontSize: size,
          lineHeight: size * (isSerif && size >= 20 ? 1.22 : 1.45),
          color,
        },
        center && { textAlign: 'center' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Screen({
  children, scroll = true, padded = true, bg = colors.white, edges = ['top'], contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  bg?: string;
  edges?: Array<'top' | 'bottom'>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const inner = [padded && { paddingHorizontal: space.xl }, contentStyle];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[{ paddingBottom: 120 }, inner]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function IconButton({
  icon, onPress, color = colors.ink, bg = colors.tone, size = 44, badge, label,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  badge?: boolean;
  /** Tên đọc cho trình đọc màn hình. */
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        {
          width: size, height: size, borderRadius: size / 2, backgroundColor: pressed ? colors.toneDeep : bg,
          alignItems: 'center', justifyContent: 'center',
        },
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={color} />
      {badge && <View style={styles.badgeDot} />}
    </Pressable>
  );
}

export function BackHeader({ title, right }: { title?: string; right?: ReactNode }) {
  return (
    <View style={styles.backHeader}>
      <IconButton icon="chevron-back" label="Quay lại" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title ? <T variant="h3" weight="semibold" numberOfLines={1}>{title}</T> : <Logo small />}
      </View>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

const LOGO_MARK = require('../../assets/logo-mark.png');

// Logo: ngôi nhà có thân là phong thư, khép lại bằng trái tim (xem thư mục branding/).
export function Logo({ small }: { small?: boolean }) {
  const s = small ? 26 : 72;
  return (
    <View style={{ flexDirection: small ? 'row' : 'column', alignItems: 'center', gap: small ? 6 : 14 }}>
      <Image source={LOGO_MARK} style={{ width: s, height: s }} />
      <T variant={small ? 'h3' : 'display'} serif weight="bold">{BRAND.name}</T>
    </View>
  );
}

export function LogoMark({ size = 40 }: { size?: number }) {
  return <Image source={LOGO_MARK} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}

export function Button({
  label, onPress, variant = 'primary', icon, disabled, style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'dark' | 'ghost' | 'soft';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.primary, dark: colors.ink, ghost: colors.tone, soft: colors.tone }[variant];
  const pressedBg = { primary: colors.primaryDark, dark: '#2A3149', ghost: colors.toneDeep, soft: colors.toneDeep }[variant];
  const fg = { primary: colors.white, dark: colors.white, ghost: colors.ink, soft: colors.ink }[variant];
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? pressedBg : bg, opacity: disabled ? 0.45 : 1 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={19} color={fg} />}
      <T variant="body" weight="semibold" color={fg}>{label}</T>
    </Pressable>
  );
}

/** Khối nền thứ hai: tách khỏi nền bằng tông màu, không viền, không bóng. */
export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.toneDeep }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label, active, onPress, icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Giữ để tương thích, mọi chip đang chọn đều màu mực. */
  tone?: 'primary' | 'dark';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? colors.ink : pressed ? colors.toneDeep : colors.tone },
      ]}
    >
      {icon && <Ionicons name={icon} size={16} color={active ? colors.white : colors.inkSoft} />}
      <T variant="small" weight="medium" color={active ? colors.white : colors.inkSoft}>{label}</T>
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <T variant="h2" style={{ flexShrink: 1 }}>{title}</T>
      {action && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <T variant="small" weight="medium" color={colors.inkSoft}>{action}</T>
          <Ionicons name="chevron-forward" size={15} color={colors.inkSoft} />
        </Pressable>
      )}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 8 }}>
      {label && <T variant="small" weight="semibold">{label}</T>}
      <TextInput
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={label}
        {...props}
        style={[styles.field, props.multiline && { minHeight: 104, textAlignVertical: 'top', paddingTop: 14 }, props.style]}
      />
    </View>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}

/** Màu riêng của một người: theo thứ tự trong nhà để không ai trùng màu. */
export function memberTone(members: Array<{ id: string }>, id: string): string | undefined {
  const i = members.findIndex((m) => m.id === id);
  return i >= 0 ? familyTones[i % familyTones.length] : undefined;
}

/** Màu cố định theo chuỗi bất kỳ, dùng khi không gắn với người nào trong nhà. */
export function toneFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return familyTones[h % familyTones.length];
}

export function Avatar({
  name, uri, icon, size = 44, ring, ringColor = colors.primary, onPress, tone,
}: {
  name: string;
  uri?: string;
  /** Avatar không phải người (cả nhà, sự kiện): một icon trên nền pơ-luya. */
  icon?: IconName;
  size?: number;
  ring?: boolean;
  ringColor?: string;
  onPress?: () => void;
  tone?: string;
}) {
  const { state } = useApp();
  const round = { width: size, height: size, borderRadius: size / 2 };
  const known = state.family.members.findIndex((m) => m.name === name);
  const fill = tone ?? (known >= 0 ? familyTones[known % familyTones.length] : toneFor(name));
  const content = uri ? (
    <Image source={{ uri }} style={round} />
  ) : icon ? (
    <View style={[round, { backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name={icon} size={size * 0.46} color={colors.ink} />
    </View>
  ) : (
    <View style={[round, { backgroundColor: fill, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontFamily: fonts.serifBold, fontSize: size * 0.44, lineHeight: size * 0.56, color: colors.white }}>{initials(name)}</Text>
    </View>
  );
  const wrapped = ring ? (
    <View style={{ padding: 2.5, borderRadius: size, borderWidth: 2.5, borderColor: ringColor }}>{content}</View>
  ) : (
    content
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name} hitSlop={6}>{wrapped}</Pressable>
  ) : wrapped;
}

/**
 * Khung ảnh. Có ảnh thật thì hiện ảnh (kèm lớp tối nhẹ ở dưới để chữ đọc được);
 * chưa có ảnh thì là một mảng màu phẳng của người gửi, nội dung đặt ở `children`.
 */
export function PhotoTile({
  uri, seed, tone, height = 160, radiusSize = radius.sm, children, style, fill,
}: {
  uri?: string;
  seed: string;
  tone?: string;
  height?: number;
  radiusSize?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Phủ kín khung cha (dùng cho màn hình toàn màn hình). */
  fill?: boolean;
}) {
  return (
    <View
      style={[
        fill ? StyleSheet.absoluteFill : { height },
        { borderRadius: radiusSize, overflow: 'hidden', backgroundColor: tone ?? toneFor(seed) },
        style,
      ]}
    >
      {uri && (
        <>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, { top: '50%', backgroundColor: 'rgba(23,28,46,0.38)' }]} />
        </>
      )}
      {children}
    </View>
  );
}

/** Tiến độ các bước: thanh chia đoạn, không đánh số. */
export function Steps({ current, total = 3 }: { current: number; total?: number }) {
  return (
    <View style={styles.steps} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: current }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.stepSeg, { backgroundColor: i < current ? colors.ink : colors.toneDeep }]} />
      ))}
    </View>
  );
}

export function Waveform({ bars = 28, color = colors.faint, progress = 0 }: { bars?: number; color?: string; progress?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 }}>
      {Array.from({ length: bars }, (_, i) => {
        const h = 6 + Math.abs(Math.sin(i * 1.7) * 14) + (i % 3) * 2;
        return (
          <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / bars < progress ? colors.primary : color }} />
        );
      })}
    </View>
  );
}

/** Nhãn nhỏ đặt trên ảnh hoặc trong danh sách: chữ và icon, nền phẳng, bo nhẹ. */
export function Pill({ label, icon, bg = colors.tone, color = colors.inkSoft }: { label: string; icon?: IconName; bg?: string; color?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={13} color={color} />}
      <T variant="caption" weight="medium" color={color}>{label}</T>
    </View>
  );
}

export function ListRow({
  icon, label, value, onPress, danger,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const color = danger ? colors.primaryDark : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.tone }]}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.primaryDark : colors.inkSoft} />
      <T variant="body" weight="medium" style={{ flex: 1 }} color={color}>{label}</T>
      {value && <T variant="small" color={colors.muted}>{value}</T>}
      <Ionicons name="chevron-forward" size={17} color={colors.faint} />
    </Pressable>
  );
}

export function Empty({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
      <Ionicons name={icon} size={34} color={colors.muted} />
      <T variant="h2" center>{title}</T>
      {text && <T variant="small" color={colors.muted} center>{text}</T>}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeDot: {
    position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.tone,
  },
  backHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  button: {
    height: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingHorizontal: space.xl,
  },
  card: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: space.lg },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40,
    borderRadius: radius.pill,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
    marginTop: 36, marginBottom: 14,
  },
  field: {
    backgroundColor: colors.tone, borderRadius: radius.md, height: 52, paddingHorizontal: space.lg,
    fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
  },
  steps: { flexDirection: 'row', gap: 6, marginVertical: space.xl },
  stepSeg: { flex: 1, height: 4, borderRadius: 2 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 6, alignSelf: 'flex-start',
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 4, borderRadius: radius.md,
  },
});
