import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityRole,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND } from '@/brand';
import { CARD_LINES, DEMO_AVATARS } from '@/data/avatars';
import { useApp } from '@/store/AppContext';
import { colors, familyTones, fonts, gradient, radius, shade, space } from '@/theme';
import { Ionicons } from './Icon';

export type IconName = ComponentProps<typeof Ionicons>['name'];

const NATIVE = Platform.OS !== 'web';

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'caption';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';
const sizes: Record<Variant, number> = { display: 34, h1: 28, h2: 22, h3: 18, body: 16, small: 14, caption: 13 };
const defaultWeight: Record<Variant, Weight> = {
  display: 'semibold', h1: 'semibold', h2: 'semibold', h3: 'semibold', body: 'regular', small: 'regular', caption: 'medium',
};
// Chữ tiêu đề khít lại như bản tham khảo.
const tracking: Record<Variant, number> = { display: -1.2, h1: -0.8, h2: -0.4, h3: -0.2, body: 0, small: 0, caption: 0 };

export function T({
  children, variant = 'body', weight, color = colors.ink, style, numberOfLines, center,
}: {
  children: ReactNode;
  variant?: Variant;
  weight?: Weight;
  /** Giữ để tương thích, app nay chỉ dùng một họ chữ. */
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
  const heading = size >= 20;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: fonts[weight ?? defaultWeight[variant]],
          fontSize: size,
          lineHeight: size * (heading ? 1.14 : 1.45),
          letterSpacing: tracking[variant],
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
  children, scroll = true, padded = true, bg = colors.bg, edges = ['top'], contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  bg?: string;
  edges?: Array<'top' | 'bottom'>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const inner = [padded && { paddingHorizontal: space.lg }, contentStyle];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[{ paddingBottom: 150 }, inner]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Vùng bấm có độ nảy nhẹ khi chạm, để mỗi lần bấm đều có phản hồi. */
export function Tap({
  children, onPress, style, disabled, label, role = 'button', scaleTo = 0.96, selected,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  label?: string;
  role?: AccessibilityRole;
  scaleTo?: number;
  selected?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: NATIVE, speed: 40, bounciness: 7 }).start();
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Hiện dần và trượt lên khi xuất hiện; `delay` để các thẻ lần lượt hiện ra. Tắt khi máy bật giảm chuyển động. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) return v.setValue(1);
        Animated.timing(v, { toValue: 1, duration: 460, delay, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
      });
    return () => { alive = false; };
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Viền chuyển màu tím, hồng, cam bao quanh một nút tròn hoặc viên thuốc. */
export function GradientRing({ children, size, width = 2, style }: { children: ReactNode; size?: number; width?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ padding: width, borderRadius: radius.pill }, size ? { width: size, height: size } : null, style]}
    >
      {children}
    </LinearGradient>
  );
}

function Badge({ count }: { count: number | true }) {
  return (
    <GradientRing width={1.5} style={styles.badge}>
      <View style={styles.badgeInner}>
        {count !== true && <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>}
      </View>
    </GradientRing>
  );
}

export function IconButton({
  icon, onPress, color, bg, size = 44, badge, label, light,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  /** Chấm báo, hoặc con số trong vòng chuyển màu. */
  badge?: boolean | number;
  /** Tên đọc cho trình đọc màn hình. */
  label?: string;
  /** Nút tròn trắng như logo trong bản tham khảo. */
  light?: boolean;
}) {
  return (
    <Tap onPress={onPress} label={label} scaleTo={0.9}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: bg ?? (light ? colors.white : colors.tone),
        }}
      >
        <Ionicons name={icon} size={Math.round(size * 0.46)} color={color ?? (light ? colors.black : colors.ink)} />
      </View>
      {badge ? <Badge count={badge === true ? true : badge} /> : null}
    </Tap>
  );
}

/** Nút tròn tô dải màu tím, hồng, cam: gửi tin, phát giọng kể. */
export function GradientButton({ icon, onPress, size = 48, label }: { icon: IconName; onPress?: () => void; size?: number; label: string }) {
  return (
    <Tap onPress={onPress} label={label} scaleTo={0.88}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={Math.round(size * 0.44)} color={colors.white} />
      </LinearGradient>
    </Tap>
  );
}

export function BackHeader({ title, right }: { title?: string; right?: ReactNode }) {
  return (
    <View style={styles.backHeader}>
      <IconButton icon="chevron-back" label="Quay lại" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title ? <T variant="h3" numberOfLines={1}>{title}</T> : <Logo small />}
      </View>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

const LOGO_MARK = require('../../assets/logo-mark.png');

/** Logo trong vòng tròn trắng, như nút logo của bản tham khảo. */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={LOGO_MARK} style={{ width: size * 0.62, height: size * 0.62 }} accessibilityIgnoresInvertColors />
    </View>
  );
}

// Logo: ngôi nhà có thân là phong thư, khép lại bằng trái tim (xem thư mục branding/).
export function Logo({ small }: { small?: boolean }) {
  return (
    <View style={{ flexDirection: small ? 'row' : 'column', alignItems: 'center', gap: small ? 8 : 14 }}>
      <LogoMark size={small ? 30 : 76} />
      <T variant={small ? 'h3' : 'display'}>{BRAND.name}</T>
    </View>
  );
}

export function Button({
  label, onPress, variant = 'primary', icon, disabled, style,
}: {
  label: string;
  onPress?: () => void;
  /** primary: viền chuyển màu; dark: nền trắng chữ đen; ghost và soft: nền xám tối. */
  variant?: 'primary' | 'dark' | 'ghost' | 'soft';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = variant === 'dark' ? colors.black : colors.ink;
  const content = (
    <>
      {icon && <Ionicons name={icon} size={19} color={fg} />}
      <T variant="body" weight="semibold" color={fg}>{label}</T>
    </>
  );
  return (
    <Tap onPress={onPress} disabled={disabled} style={[{ opacity: disabled ? 0.45 : 1 }, style]}>
      {variant === 'primary' ? (
        <GradientRing>
          <View style={[styles.button, { height: 50, backgroundColor: colors.bg }]}>{content}</View>
        </GradientRing>
      ) : (
        <View style={[styles.button, { backgroundColor: variant === 'dark' ? colors.white : colors.tone }]}>{content}</View>
      )}
    </Tap>
  );
}

/** Khối nền thứ hai: xám rất tối trên nền đen, bo tròn lớn. */
export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Tap onPress={onPress} scaleTo={0.98}>
        <View style={[styles.card, style]}>{children}</View>
      </Tap>
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
  /** Giữ để tương thích. */
  tone?: 'primary' | 'dark';
}) {
  const fg = active ? colors.black : colors.inkSoft;
  return (
    <Tap onPress={onPress} selected={!!active} scaleTo={0.94}>
      <View style={[styles.chip, { backgroundColor: active ? colors.white : colors.tone }]}>
        {icon && <Ionicons name={icon} size={16} color={fg} />}
        <T variant="small" weight="medium" color={fg}>{label}</T>
      </View>
    </Tap>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <T variant="h2" style={{ flexShrink: 1 }}>{title}</T>
      {action && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <T variant="small" weight="medium" color={colors.muted}>{action}</T>
          <Ionicons name="chevron-forward" size={15} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 8 }}>
      {label && <T variant="small" weight="medium" color={colors.muted}>{label}</T>}
      <TextInput
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={label}
        {...props}
        style={[styles.field, props.multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: 16, borderRadius: radius.md }, props.style]}
      />
    </View>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}

/** Màu thẻ của một người: theo thứ tự trong nhà để không ai trùng màu. */
export function memberTone(members: Array<{ id: string }>, id: string): string | undefined {
  const i = members.findIndex((m) => m.id === id);
  return i >= 0 ? familyTones[i % familyTones.length] : undefined;
}

function hash(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Màu cố định theo chuỗi bất kỳ, dùng khi không gắn với người nào trong nhà. */
export function toneFor(seed: string): string {
  return familyTones[hash(seed) % familyTones.length];
}

export function Avatar({
  name, uri, icon, size = 44, ring, onPress, tone,
}: {
  name: string;
  uri?: string;
  /** Avatar không phải người (cả nhà, sự kiện): một icon trên nền xám tối. */
  icon?: IconName;
  size?: number;
  /** Viền chuyển màu, như người vừa có tin mới. */
  ring?: boolean;
  /** Giữ để tương thích. */
  ringColor?: string;
  onPress?: () => void;
  tone?: string;
}) {
  const { state } = useApp();
  const round = { width: size, height: size, borderRadius: size / 2 };
  const known = state.family.members.findIndex((m) => m.name === name);
  const fill = tone ?? (known >= 0 ? familyTones[known % familyTones.length] : toneFor(name));
  const demo = DEMO_AVATARS[name];
  const content = uri || demo ? (
    <Image source={uri ? { uri } : demo} style={round} accessibilityIgnoresInvertColors />
  ) : icon ? (
    <View style={[round, { backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name={icon} size={size * 0.46} color={colors.ink} />
    </View>
  ) : (
    <LinearGradient colors={[shade(fill, 0.25), fill]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[round, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: size * 0.42, lineHeight: size * 0.56, color: colors.white }}>{initials(name)}</Text>
    </LinearGradient>
  );
  const wrapped = ring ? (
    <GradientRing width={2.5}>
      <View style={{ padding: 2, borderRadius: size, backgroundColor: colors.bg }}>{content}</View>
    </GradientRing>
  ) : (
    content
  );
  return onPress ? <Tap onPress={onPress} label={name} scaleTo={0.92}>{wrapped}</Tap> : wrapped;
}

/**
 * Thẻ màu: dải màu của người gửi, nét lượn mờ, và lớp tối nhẹ ở dưới để chữ trắng đọc rõ.
 * Có ảnh thật thì hiện ảnh thay cho dải màu. Nội dung đặt ở `children`.
 */
export function PhotoTile({
  uri, seed, tone, height = 160, radiusSize = radius.lg, children, style, fill, scrim = true, autoHeight,
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
  scrim?: boolean;
  /** Cao theo nội dung bên trong thay vì `height`. */
  autoHeight?: boolean;
}) {
  const base = tone ?? toneFor(seed);
  return (
    <View style={[fill ? StyleSheet.absoluteFill : autoHeight ? null : { height }, { borderRadius: radiusSize, overflow: 'hidden', backgroundColor: base }, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <>
          <LinearGradient colors={[shade(base, -0.2), base, shade(base, 0.14)]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          <Image source={CARD_LINES[hash(seed) % CARD_LINES.length]} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </>
      )}
      {scrim && <LinearGradient colors={['transparent', uri ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.26)']} style={[StyleSheet.absoluteFill, { top: '40%' }]} />}
      {children}
    </View>
  );
}

/** Tiến độ các bước: thanh chia đoạn, không đánh số. */
export function Steps({ current, total = 3 }: { current: number; total?: number }) {
  return (
    <View style={styles.steps} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: current }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.stepSeg, { backgroundColor: i < current ? colors.white : colors.toneDeep }]} />
      ))}
    </View>
  );
}

export function Waveform({ bars = 28, color = colors.faint, progress = 0 }: { bars?: number; color?: string; progress?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 }}>
      {Array.from({ length: bars }, (_, i) => {
        const h = 6 + Math.abs(Math.sin(i * 1.7) * 14) + (i % 3) * 2;
        return <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / bars < progress ? colors.accentText : color }} />;
      })}
    </View>
  );
}

/** Nhãn nhỏ: chữ và icon trên nền xám tối, bo tròn. */
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
  const color = danger ? colors.holiday : colors.ink;
  return (
    <Tap onPress={onPress} scaleTo={0.98}>
      <View style={styles.listRow}>
        <View style={styles.listIcon}><Ionicons name={icon} size={20} color={color} /></View>
        <T variant="body" weight="medium" style={{ flex: 1 }} color={color}>{label}</T>
        {value && <T variant="small" color={colors.muted}>{value}</T>}
        <Ionicons name="chevron-forward" size={17} color={colors.faint} />
      </View>
    </Tap>
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
  badge: { position: 'absolute', top: -4, right: -4, width: 20, height: 20 },
  badgeInner: { flex: 1, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 12, color: colors.white },
  backHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  button: {
    height: 54, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingHorizontal: space.xl,
  },
  card: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: space.xl },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: radius.pill },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    marginTop: 32, marginBottom: 14,
  },
  field: {
    backgroundColor: colors.tone, borderRadius: radius.pill, height: 54, paddingHorizontal: space.xl,
    fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
  },
  steps: { flexDirection: 'row', gap: 6, marginVertical: space.xl },
  stepSeg: { flex: 1, height: 4, borderRadius: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 },
  listIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
});
