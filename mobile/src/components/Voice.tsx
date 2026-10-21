import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, localTimeFor } from '@/lib/format';
import { me, member, unheardMorning } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';
import { Ionicons } from './Icon';
import { Avatar, Button, FadeIn, GradientRing, memberTone, PhotoTile, T, Tap, Waveform } from './ui';

/**
 * Viên thuốc phát giọng nói, có nút phát và sóng âm chạy theo.
 * Bản demo mô phỏng việc phát vì dữ liệu mẫu chưa có file ghi âm; bản thật dùng useAudioPlayer của expo-audio.
 */
export function VoicePill({
  sec, autoPlay, onEnd, onLight, label = 'Nghe',
}: {
  sec: number;
  autoPlay?: boolean;
  onEnd?: () => void;
  /** Đặt trên nền sáng hoặc thẻ màu: dùng lớp tối mờ thay cho xanh đậm. */
  onLight?: boolean;
  label?: string;
}) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  };
  const start = () => {
    stop();
    setPlaying(true);
    timer.current = setInterval(() => {
      setPos((p) => {
        if (p + 0.25 >= sec) {
          stop();
          onEnd?.();
          return 0;
        }
        return p + 0.25;
      });
    }, 250);
  };

  useEffect(() => {
    if (autoPlay) start();
    return stop;
  }, []);

  return (
    <View style={[styles.pill, { backgroundColor: onLight ? 'rgba(0,0,0,0.28)' : colors.deep }]}>
      <Tap onPress={playing ? stop : start} label={playing ? 'Dừng' : label} scaleTo={0.85}>
        <View style={styles.play}>
          <Ionicons name={playing ? 'pause' : 'play'} size={16} color={colors.black} />
        </View>
      </Tap>
      <Waveform bars={22} progress={pos / sec} color="rgba(255,255,255,0.6)" />
      <T variant="small" weight="medium" color={colors.white} style={{ minWidth: 36 }}>{duration(playing || pos ? pos : sec)}</T>
    </View>
  );
}

/**
 * Lời chào buổi sáng: tin thoại người nhà hẹn giờ gửi riêng mình. Đến giờ, mở app là tự phát.
 * Trên điện thoại thật, đúng giờ hẹn máy báo bằng chính đoạn giọng này (âm báo tối đa 30 giây).
 */
export function MorningVoice() {
  const { state, dispatch } = useApp();
  const insets = useSafeAreaInsets();
  const msg = unheardMorning(state);
  const [closed, setClosed] = useState<string[]>([]);
  if (!msg || closed.includes(msg.id)) return null;
  const author = member(state, msg.authorId);
  const close = () => {
    dispatch({ type: 'heard', id: msg.id });
    setClosed([...closed, msg.id]);
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <FadeIn>
        <PhotoTile seed={msg.id} tone={memberTone(state.family.members, msg.authorId)} autoHeight radiusSize={radius.xl}>
          <View style={{ padding: 22, gap: 16, alignItems: 'center' }}>
            <View style={styles.eyebrow}>
              <Ionicons name="sunny" size={15} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>Lời chào buổi sáng, {localTimeFor(me(state).country, new Date(msg.deliverAt!))}</T>
            </View>
            <GradientRing width={3}>
              <View style={{ padding: 3, borderRadius: 60, backgroundColor: colors.bg }}>
                <Avatar name={author?.name ?? '?'} uri={author?.avatarUri} size={96} />
              </View>
            </GradientRing>
            <T variant="h1" color={colors.white} center>{author?.roleLabel} {msg.to?.length === 1 ? 'gửi riêng bạn' : 'gửi bạn'}</T>
            <VoicePill sec={msg.voiceSec!} autoPlay onLight />
            {msg.text ? <T variant="body" color={colors.white} center style={{ opacity: 0.95 }}>“{msg.text}”</T> : null}
          </View>
        </PhotoTile>
      </FadeIn>
      <View style={{ gap: 10, marginTop: 14 }}>
        <Button label={`Trả lời ${author?.roleLabel ?? ''} bằng giọng nói`} icon="mic" variant="dark"
          onPress={() => { close(); router.push({ pathname: '/chat', params: { voice: '1', to: msg.authorId } }); }} />
        <Button label="Để sau" variant="ghost" onPress={close} />
      </View>
      <T variant="caption" weight="regular" color={colors.muted} center style={{ marginTop: 12 }}>
        Mở app là tự phát. Trên điện thoại thật, đúng giờ hẹn máy sẽ báo bằng chính giọng này.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.pill, paddingVertical: 7, paddingLeft: 7, paddingRight: 14,
    width: 240, maxWidth: '100%',
  },
  play: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.88)', paddingHorizontal: 16, justifyContent: 'center' },
  eyebrow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
});
