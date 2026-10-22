import { Ionicons } from '@/components/Icon';
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { duration } from '@/lib/format';
import { colors } from '@/theme';
import { T, Waveform } from './ui';

/**
 * Nút ghi âm, dùng micro qua expo-audio. Không có quyền micro thì không ghi, chỉ nhắc cho phép.
 */
export function VoiceRecorder({
  onDone, size = 72, hint = 'Bấm để kể',
}: {
  onDone: (result: { uri?: string; seconds: number }) => void;
  size?: number;
  hint?: string;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [denied, setDenied] = useState(false);
  const real = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function start() {
    setSeconds(0);
    real.current = false;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      real.current = true;
    } catch {
      setDenied(true);
      return;
    }
    setDenied(false);
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
          <Waveform bars={22} color={colors.accentText} />
          <T variant="small" weight="semibold">{duration(seconds)}</T>
        </View>
      ) : (
        <T variant="small" color={denied ? colors.holiday : colors.muted} center>{denied ? 'Cần cho phép micro' : hint}</T>
      )}
      <Pressable
        onPress={recording ? stop : start}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}
        style={[styles.button, { width: size, height: size, borderRadius: size / 2, backgroundColor: recording ? colors.toneDeep : colors.primary }]}
      >
        <Ionicons name={recording ? 'stop' : 'mic'} size={size * 0.42} color={colors.white} />
      </Pressable>
      {recording && <T variant="small" color={colors.muted}>Bấm để dừng</T>}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  live: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.toneDeep,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, width: '100%',
  },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
