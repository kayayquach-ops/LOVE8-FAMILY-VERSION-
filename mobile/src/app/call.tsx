import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, T, Waveform } from '@/components/ui';
import { duration } from '@/lib/format';
import { isElder } from '@/lib/family';
import { me, member } from '@/lib/selectors';
import { nextQuestion } from '@/services/ai';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

type Phase = 'ringing' | 'talking' | 'ended';

// Cuộc gọi của Thư qua app (gọi qua internet nên gần như miễn phí, không tốn cước quốc tế).
// Trên điện thoại thật, cuộc gọi hiện lên như cuộc gọi thường nhờ CallKit (iOS) / ConnectionService (Android).
export default function Call() {
  const { as } = useLocalSearchParams<{ as?: string }>();
  const { state, dispatch } = useApp();
  const self = me(state);
  const elder = as === 'elder' || isElder(self.role);
  const [phase, setPhase] = useState<Phase>('ringing');
  const [sec, setSec] = useState(0);
  const [qi, setQi] = useState(0);
  const [muted, setMuted] = useState(false);

  const pending = state.questions.filter((q) => q.toId === state.meId && q.status !== 'answered');
  const questions = useMemo(() => {
    const fromFamily = pending.map((q) => `${member(state, q.fromId)?.roleLabel} muốn hỏi: ${q.text}`);
    const opener = elder
      ? `Cháu chào ${self.roleLabel.toLowerCase()} ạ! Tuần này ${self.roleLabel.toLowerCase()} khoẻ không ạ?`
      : `Chào ${self.name.split(' ').pop()}! Tuần này ở ${self.city} thế nào?`;
    return [opener, ...fromFamily, nextQuestion(state.stories.length).text, 'Cảm ơn nhé! Thư sẽ chép lại và gửi cho cả nhà.'];
  }, []);

  useEffect(() => {
    if (phase === 'ringing') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    if (phase !== 'talking') return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  function end() {
    pending.forEach((q) => dispatch({ type: 'questionStatus', id: q.id, status: 'asked' }));
    setPhase('ended');
  }

  if (phase === 'ended') {
    return (
      <SafeAreaView style={[styles.wrap, { justifyContent: 'center', padding: 28, gap: 16 }]}>
        <View style={styles.doneIcon}><Ionicons name="checkmark" size={40} color={colors.white} /></View>
        <T variant="h2" color={colors.white} center>Cuộc gọi {duration(sec)}</T>
        <T variant="body" color={colors.white} center style={{ opacity: 0.85 }}>
          Thư đang chép lại lời kể. Trang ký ức mới sẽ hiện trong sổ sau vài phút, {elder ? 'và con cháu sẽ được thông báo.' : 'và bố mẹ sẽ được thông báo.'}
        </T>
        <Button label="Về trang chủ" onPress={() => router.back()} style={{ marginTop: 20, alignSelf: 'stretch' }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.wrap}>
      <View style={{ alignItems: 'center', marginTop: 48, gap: 10 }}>
        <View style={styles.halo}>
          <View style={styles.halo2}>
            <Avatar name="Thư" emoji="🕊️" size={110} />
          </View>
        </View>
        <T variant="h1" color={colors.white}>Thư</T>
        <T variant="small" color={colors.white} style={{ opacity: 0.8 }}>
          {phase === 'ringing' ? `Trợ lý của ${state.family.name.toLowerCase()} đang gọi...` : `Đang nói chuyện · ${duration(sec)}`}
        </T>
      </View>

      {phase === 'talking' && (
        <View style={styles.caption}>
          <T variant="caption" color={colors.primarySoft}>THƯ ĐANG HỎI</T>
          <T variant="h3" weight="semibold" color={colors.white}>{questions[qi]}</T>
          <View style={{ height: 30, marginTop: 8 }}>
            <Waveform bars={34} color={muted ? 'rgba(255,255,255,0.25)' : colors.white} />
          </View>
          {qi < questions.length - 1 ? (
            <Pressable onPress={() => setQi(qi + 1)} style={styles.next}>
              <T variant="small" weight="semibold" color={colors.ink}>Kể xong, hỏi tiếp →</T>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={{ flex: 1 }} />
      {phase === 'ringing' ? (
        <View style={styles.row}>
          <Round icon="close" bg={colors.primaryDark} label="Để sau" onPress={() => router.back()} />
          <Round icon="call" bg={colors.green} label="Nghe máy" onPress={() => setPhase('talking')} />
        </View>
      ) : (
        <View style={styles.row}>
          <Round icon={muted ? 'mic-off' : 'mic'} bg="rgba(255,255,255,0.18)" label={muted ? 'Bật mic' : 'Tắt mic'} onPress={() => setMuted(!muted)} />
          <Round icon="call" bg={colors.primaryDark} label="Kết thúc" rotate onPress={end} />
          <Round icon="volume-high" bg="rgba(255,255,255,0.18)" label="Loa" onPress={() => {}} />
        </View>
      )}
      <T variant="caption" color={colors.white} center style={{ opacity: 0.6, marginBottom: 16 }}>
        Cuộc gọi được ghi lại để làm sổ ký ức. Người kể luôn được xem lại trước khi chia sẻ.
      </T>
    </SafeAreaView>
  );
}

function Round({ icon, bg, label, onPress, rotate }: {
  icon: 'close' | 'call' | 'mic' | 'mic-off' | 'volume-high'; bg: string; label: string; onPress: () => void; rotate?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable onPress={onPress} style={[styles.round, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={30} color={colors.white} style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined} />
      </Pressable>
      <T variant="caption" color={colors.white}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#2B1E22' },
  halo: { padding: 18, borderRadius: 999, backgroundColor: 'rgba(242,103,106,0.15)' },
  halo2: { padding: 14, borderRadius: 999, backgroundColor: 'rgba(242,103,106,0.3)' },
  caption: { margin: 24, padding: 18, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', gap: 6 },
  next: { alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 24 },
  round: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  doneIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
