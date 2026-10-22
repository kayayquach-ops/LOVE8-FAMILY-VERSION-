import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

const BLOBS = [
  { src: require('../../assets/art/cream-1.png'), x: -0.25, y: 0.05, size: 1.2, dx: 0.12, dy: 0.08, ms: 14000 },
  { src: require('../../assets/art/cream-2.png'), x: 0.35, y: -0.1, size: 1.1, dx: -0.1, dy: 0.1, ms: 17000 },
  { src: require('../../assets/art/cream-4.png'), x: 0.3, y: 0.42, size: 1.25, dx: -0.14, dy: -0.06, ms: 15000 },
  { src: require('../../assets/art/cream-3.png'), x: -0.3, y: 0.55, size: 1.15, dx: 0.1, dy: -0.1, ms: 19000 },
  { src: require('../../assets/art/cream-5.png'), x: 0.1, y: 0.78, size: 1.0, dx: 0.12, dy: -0.08, ms: 16000 },
];

/** Nền mảng màu kem loang mờ, trôi rất chậm. `vivid` cho màn chào, bản nhạt cho các câu hỏi sau. */
export function Mesh({ vivid }: { vivid?: boolean }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: vivid ? '#EADCC6' : '#F8F2E8', overflow: 'hidden' }]} pointerEvents="none">
      {BLOBS.map((b, i) => <Blob key={i} blob={b} w={width} h={height} opacity={vivid ? 1 : 0.75} />)}
    </View>
  );
}

function Blob({ blob, w, h, opacity }: { blob: (typeof BLOBS)[number]; w: number; h: number; opacity: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: blob.ms, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(t, { toValue: 0, duration: blob.ms, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ]));
      loop.start();
    });
    return () => loop?.stop();
  }, []);
  const size = Math.max(w, h * 0.6) * blob.size;
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, blob.dx * w] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, blob.dy * h] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <Animated.Image source={blob.src} resizeMode="stretch"
      style={{ position: 'absolute', left: blob.x * w, top: blob.y * h - size / 4, width: size, height: size, opacity, transform: [{ translateX }, { translateY }, { scale }] }} />
  );
}
