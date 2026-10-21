import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { colors, fonts, radius, shadow, space, swatches } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'caption';
const sizes: Record<Variant, number> = { display: 30, h1: 24, h2: 20, h3: 16, body: 15, small: 13, caption: 11 };
const defaultWeight: Record<Variant, keyof typeof fonts> = {
  display: 'bold', h1: 'bold', h2: 'bold', h3: 'semibold', body: 'regular', small: 'regular', caption: 'medium',
};

export function T({
  children, variant = 'body', weight, color = colors.ink, style, numberOfLines, center,
}: {
  children: ReactNode;
  variant?: Variant;
  weight?: keyof typeof fonts;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  const { state } = useApp();
  // Chế độ bố mẹ phóng to chữ cho dễ đọc.
  const scale = state.settings.parentMode ? 1.18 : 1;
  const size = sizes[variant] * scale;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: fonts[weight ?? defaultWeight[variant]], fontSize: size, lineHeight: size * 1.4, color },
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
  icon, onPress, color = colors.ink, bg = colors.white, size = 40, bordered = true, badge,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  bordered?: boolean;
  badge?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size, height: size, borderRadius: size / 2.6, backgroundColor: bg,
          alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
        },
        bordered && { borderWidth: 1, borderColor: colors.line },
      ]}
    >
      <Ionicons name={icon} size={size * 0.48} color={color} />
      {badge && <View style={styles.badgeDot} />}
    </Pressable>
  );
}

export function BackHeader({ title, right }: { title?: string; right?: ReactNode }) {
  return (
    <View style={styles.backHeader}>
      <IconButton icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title ? <T variant="h3" weight="semibold">{title}</T> : <Logo small />}
      </View>
      <View style={{ width: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

const LOGO_MARK = require('../../assets/logo-mark.png');

// Logo: ngôi nhà có thân là phong thư, khép lại bằng trái tim (xem thư mục branding/).
export function Logo({ small }: { small?: boolean }) {
  const s = small ? 26 : 88;
  return (
    <View style={{ flexDirection: small ? 'row' : 'column', alignItems: 'center', gap: small ? 6 : 12 }}>
      <Image source={LOGO_MARK} style={{ width: s, height: s }} />
      <T variant={small ? 'h3' : 'display'} weight="bold">{BRAND.name}</T>
    </View>
  );
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
  const bg = { primary: colors.primary, dark: colors.black, ghost: colors.white, soft: colors.primarySoft }[variant];
  const fg = { primary: colors.white, dark: colors.white, ghost: colors.ink, soft: colors.primaryDark }[variant];
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.line },
        variant === 'primary' && shadow.card,
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <T variant="body" weight="semibold" color={fg}>{label}</T>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, shadow.soft, { opacity: pressed ? 0.9 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, shadow.soft, style]}>{children}</View>;
}

export function Chip({
  label, active, onPress, icon, tone = 'primary',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tone?: 'primary' | 'dark';
}) {
  const activeBg = tone === 'dark' ? colors.black : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active ? { backgroundColor: activeBg, borderColor: activeBg } : { backgroundColor: colors.white, borderColor: colors.line },
      ]}
    >
      <Ionicons name={icon ?? (active ? 'checkmark-circle' : 'ellipse-outline')} size={15} color={active ? colors.white : colors.inkSoft} />
      <T variant="small" weight="medium" color={active ? colors.white : colors.inkSoft}>{label}</T>
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <T variant="h3" weight="bold">{title}</T>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <T variant="small" weight="medium" color={colors.primary}>{action}</T>
        </Pressable>
      )}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <T variant="small" weight="semibold">{label}</T>}
      <TextInput
        placeholderTextColor={colors.faint}
        {...props}
        style={[styles.field, props.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 14 }, props.style]}
      />
    </View>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}

export function swatchFor(seed: string): [string, string] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return swatches[h % swatches.length];
}

export function Avatar({
  name, uri, emoji, size = 44, ring, ringColor = colors.primary, onPress,
}: {
  name: string;
  uri?: string;
  emoji?: string;
  size?: number;
  ring?: boolean;
  ringColor?: string;
  onPress?: () => void;
}) {
  const [a, b] = swatchFor(name);
  const content = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <LinearGradient colors={[a, b]} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      {emoji ? (
        <Text style={{ fontSize: size * 0.48 }}>{emoji}</Text>
      ) : (
        <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.4, color: colors.white }}>{initials(name)}</Text>
      )}
    </LinearGradient>
  );
  const wrapped = ring ? (
    <View style={{ padding: 2.5, borderRadius: size, borderWidth: 2.5, borderColor: ringColor }}>{content}</View>
  ) : (
    content
  );
  return onPress ? <Pressable onPress={onPress}>{wrapped}</Pressable> : wrapped;
}

export function PhotoTile({
  emoji, uri, seed, height = 160, radiusSize = radius.lg, children, style, fill,
}: {
  emoji?: string;
  uri?: string;
  seed: string;
  height?: number;
  radiusSize?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Phủ kín khung cha (dùng cho màn hình toàn màn hình); `height` khi đó chỉ quyết định cỡ emoji. */
  fill?: boolean;
}) {
  const [a, b] = swatchFor(seed);
  return (
    <View style={[fill ? StyleSheet.absoluteFill : { height }, { borderRadius: radiusSize, overflow: 'hidden' }, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: height * 0.34 }}>{emoji ?? '📷'}</Text>
        </LinearGradient>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} style={[StyleSheet.absoluteFill, { top: '55%' }]} />
      {children}
    </View>
  );
}

export function Steps({ current, total = 3 }: { current: number; total?: number }) {
  const parts: ReactNode[] = [];
  for (let i = 0; i < total; i++) {
    const done = i < current - 1;
    const active = i === current - 1;
    parts.push(
      <View
        key={`d${i}`}
        style={[
          styles.stepDot,
          done && { backgroundColor: colors.primary, borderColor: colors.primary },
          active && { backgroundColor: colors.black, borderColor: colors.black },
        ]}
      >
        {done ? (
          <Ionicons name="checkmark" size={14} color={colors.white} />
        ) : (
          <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: active ? colors.white : colors.faint }}>{`0${i + 1}`}</Text>
        )}
      </View>,
    );
    if (i < total - 1) parts.push(<View key={`l${i}`} style={styles.stepLine} />);
  }
  return <View style={styles.steps}>{parts}</View>;
}

export function Waveform({ bars = 28, color = colors.ink, progress = 0 }: { bars?: number; color?: string; progress?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 }}>
      {Array.from({ length: bars }, (_, i) => {
        const h = 6 + Math.abs(Math.sin(i * 1.7) * 14) + (i % 3) * 2;
        return (
          <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / bars < progress ? colors.primary : color, opacity: 0.85 }} />
        );
      })}
    </View>
  );
}

export function Pill({ label, icon, bg = colors.black, color = colors.white }: { label: string; icon?: IconName; bg?: string; color?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <T variant="caption" weight="semibold" color={color}>{label}</T>
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
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.listIcon}>
        <Ionicons name={icon} size={18} color={danger ? colors.primaryDark : colors.ink} />
      </View>
      <T variant="body" weight="medium" style={{ flex: 1 }} color={danger ? colors.primaryDark : colors.ink}>{label}</T>
      {value && <T variant="small" color={colors.muted}>{value}</T>}
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );
}

export function Empty({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
      <View style={[styles.listIcon, { width: 56, height: 56, borderRadius: 20 }]}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <T variant="h3" center>{title}</T>
      {text && <T variant="small" color={colors.muted} center>{text}</T>}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeDot: {
    position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.white,
  },
  backHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  button: {
    height: 54, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingHorizontal: space.xl,
  },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: space.lg },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36,
    borderRadius: radius.pill, borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: space.xxl, marginBottom: space.md,
  },
  field: {
    backgroundColor: colors.field, borderRadius: radius.md, height: 52, paddingHorizontal: space.lg,
    fontFamily: fonts.regular, fontSize: 15, color: colors.ink,
  },
  steps: { flexDirection: 'row', alignItems: 'center', marginVertical: space.xl },
  stepDot: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  stepLine: { flex: 1, height: 1, borderStyle: 'dashed', borderWidth: 0.8, borderColor: colors.faint, marginHorizontal: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.pill, alignSelf: 'flex-start',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  listIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
});
