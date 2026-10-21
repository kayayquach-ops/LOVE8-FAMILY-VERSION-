import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { duration } from '@/lib/format';
import { colors } from '@/theme';
import { T, Waveform } from './ui';

/**
 * Nút ghi âm. Trên máy thật dùng micro qua expo-audio. Nếu không có quyền
 * (hoặc chạy trên web khi demo), nút vẫn đếm giờ để thử luồng màn hình.
 */
export function VoiceRecorder({
  onDone, size = 72, hint = 'Giữ bình tĩnh và kể thật tự nhiên nhé',
}: {
  onDone: (result: { uri?: string; seconds: number }) => void;
  size?: number;
  hint?: string;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const real = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function start() {
    setSeconds(0);
    real.current = false;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (perm.granted) {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        real.current = true;
      }
    } catch {
      real.current = false;
    }
    setRecording(true);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  async function stop() {
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
    let uri: string | undefined;
    if (real.current) {
      try {
        await recorder.stop();
        uri = recorder.uri ?? undefined;
      } catch {}
    }
    onDone({ uri, seconds: Math.max(seconds, 1) });
  }

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      {recording ? (
        <View style={styles.live}>
          <View style={styles.redDot} />
          <Waveform bars={22} color={colors.primary} />
          <T variant="small" weight="semibold">{duration(seconds)}</T>
        </View>
      ) : (
        <T variant="small" color={colors.muted} center>{hint}</T>
      )}
      <Pressable
        onPress={recording ? stop : start}
        style={[styles.button, { width: size, height: size, borderRadius: size / 2, backgroundColor: recording ? colors.black : colors.primary }]}
      >
        <Ionicons name={recording ? 'stop' : 'mic'} size={size * 0.42} color={colors.white} />
      </Pressable>
      <T variant="caption" color={colors.muted}>{recording ? 'Bấm để dừng' : 'Bấm để bắt đầu kể'}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  live: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primaryTint,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, width: '100%',
  },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
