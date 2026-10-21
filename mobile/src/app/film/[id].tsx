import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SEPIA } from '@/components/Feed';
import { Ionicons } from '@/components/Icon';
import { Button, Empty, GradientButton, IconButton, PhotoTile, Screen, T, Tap, Waveform } from '@/components/ui';
import type { SubLang } from '@/data/types';
import { duration } from '@/lib/format';
import { callName, member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const LANGS: Array<{ key: SubLang; label: string }> = [{ key: 'vi', label: 'Tiếng Việt' }, { key: 'ko', label: '한국어' }, { key: 'en', label: 'English' }];

// Video Homeletter: ảnh xưa chuyển động chậm, giọng thật của người kể, phụ đề theo ngôn ngữ người xem.
// Chỉ ghép từ ảnh thật và giọng thật, không tạo giọng giả. Bản demo mô phỏng phần phát.
export default function FilmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useApp();
  const insets = useSafeAreaInsets();
  const film = state.films.find((f) => f.id === id);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [lang, setLang] = useState<SubLang>('vi');
  const zoom = useRef(new Animated.Value(0)).current;
  const sceneLen = film ? film.durationSec / film.scenes.length : 1;
  const scene = film ? Math.min(film.scenes.length - 1, Math.floor(t / sceneLen)) : 0;

  useEffect(() => {
    if (!playing || !film) return;
    const timer = setInterval(() => setT((v) => {
      if (v + 0.25 >= film.durationSec) { setPlaying(false); return film.durationSec; }
      return v + 0.25;
    }), 250);
    return () => clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    zoom.setValue(0);
    Animated.timing(zoom, { toValue: 1, duration: sceneLen * 1000, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [scene]);

  if (!film) return <Screen><Empty icon="film-outline" title="Không tìm thấy video" /></Screen>;
  const speaker = member(state, film.speakerId);
  const sub = [...film.subs].reverse().find((s) => s.at <= t);
  const s = film.scenes[scene];
  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const done = t >= film.durationSec;

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
        <PhotoTile seed={`${film.id}-${scene}`} tone={SEPIA} fill radiusSize={0} />
      </Animated.View>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" label="Đóng" bg="rgba(0,0,0,0.35)" color={colors.white} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <T variant="small" weight="semibold" color={colors.white}>{film.title}</T>
          <T variant="caption" weight="regular" color="rgba(255,255,255,0.85)">Giọng {callName(speaker)}, {film.occasion.toLowerCase()}</T>
        </View>
      </View>

      <View style={styles.center} pointerEvents="none">
        {s.year ? <T variant="display" color={colors.white} style={styles.year}>{s.year}</T> : null}
        <T variant="h2" color={colors.white} center>{s.caption}</T>
        <T variant="caption" weight="regular" color="rgba(255,255,255,0.75)" center>Ảnh xưa nhà mình</T>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {sub && !done && (
          <View style={styles.sub}>
            <T variant="h3" weight="medium" color={colors.white} center>{sub[lang]}</T>
          </View>
        )}
        {done ? (
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            <Button label="Xem cùng cả nhà" icon="videocam" variant="dark" onPress={() => router.replace({ pathname: '/room', params: { film: film.id } })} />
            <Button label="Xem lại" icon="refresh" variant="ghost" onPress={() => { setT(0); setPlaying(true); }} />
          </View>
        ) : (
          <View style={styles.controls}>
            <GradientButton icon={playing ? 'pause' : 'play'} size={52} label={playing ? 'Dừng' : 'Phát'} onPress={() => setPlaying(!playing)} />
            <Waveform bars={26} progress={t / film.durationSec} color="rgba(255,255,255,0.45)" />
            <T variant="small" color={colors.white}>{duration(t)}</T>
          </View>
        )}
        <View style={styles.langs}>
          <Ionicons name="text" size={16} color="rgba(255,255,255,0.8)" />
          {LANGS.map((l) => (
            <Tap key={l.key} onPress={() => setLang(l.key)} selected={lang === l.key} label={`Phụ đề ${l.label}`} scaleTo={0.92}>
              <View style={[styles.lang, lang === l.key && { backgroundColor: colors.white }]}>
                <T variant="caption" weight="semibold" color={lang === l.key ? colors.black : colors.white}>{l.label}</T>
              </View>
            </Tap>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  center: { position: 'absolute', left: 24, right: 24, top: '26%', alignItems: 'center', gap: 6 },
  year: { fontSize: 88, lineHeight: 92, letterSpacing: -4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, gap: 14, alignItems: 'center' },
  sub: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  controls: {
    flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: radius.pill, padding: 6, paddingRight: 18,
  },
  langs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lang: { height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' },
});
