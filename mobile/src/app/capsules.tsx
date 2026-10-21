import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Avatar, BackHeader, Button, Chip, Field, Screen, SectionHeader, T } from '@/components/ui';
import { duration } from '@/lib/format';
import { daysBetween } from '@/lib/lunar';
import { member, others } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const WHEN = [
  { label: '1 năm nữa', years: 1 },
  { label: '5 năm nữa', years: 5 },
  { label: 'Ngày cưới', years: 6 },
  { label: 'Sinh nhật 60', years: 8 },
];

// Hộp thời gian: ghi lời nhắn hôm nay, hẹn mở vào một ngày trong tương lai.
export default function Capsules() {
  const { state, dispatch } = useApp();
  const [creating, setCreating] = useState(false);
  const [to, setTo] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(WHEN[0]);
  const [voiceSec, setVoiceSec] = useState<number | undefined>();
  const today = new Date();

  function save() {
    const openOn = new Date(today.getFullYear() + when.years, today.getMonth(), today.getDate());
    dispatch({ type: 'addCapsule', capsule: { toIds: to, title: title.trim(), message: '', voiceSec, openOn: openOn.toISOString().slice(0, 10) } });
    setCreating(false); setTo([]); setTitle(''); setVoiceSec(undefined);
  }

  return (
    <Screen>
      <BackHeader title="Hộp thời gian" />
      <T variant="body" color={colors.inkSoft}>
        Ghi một lời nhắn bằng giọng nói hôm nay, hẹn mở vào ngày con cưới, ngày bố mẹ tròn 60 tuổi, hay Tết 10 năm sau.
      </T>

      {creating ? (
        <View style={styles.form}>
          <Field label="Tên hộp" value={title} onChangeText={setTitle} placeholder="Ví dụ: Gửi bố ngày con ra trường" />
          <T variant="small" weight="semibold">Gửi cho</T>
          <View style={styles.wrap}>
            {others(state).map((m) => (
              <Chip key={m.id} label={m.roleLabel} active={to.includes(m.id)} onPress={() => setTo(to.includes(m.id) ? to.filter((x) => x !== m.id) : [...to, m.id])} />
            ))}
          </View>
          <T variant="small" weight="semibold">Mở vào</T>
          <View style={styles.wrap}>
            {WHEN.map((w) => <Chip key={w.label} label={w.label} active={when.label === w.label} onPress={() => setWhen(w)} />)}
          </View>
          {voiceSec ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark" size={18} color={colors.green} />
              <T variant="body" weight="semibold" color={colors.green}>Đã ghi lời nhắn {duration(voiceSec)}</T>
            </View>
          ) : (
            <VoiceRecorder size={56} hint="Nói điều bạn muốn họ nghe vào ngày đó" onDone={({ seconds }) => setVoiceSec(seconds)} />
          )}
          <Button label="Khoá hộp" icon="lock-closed" disabled={!title.trim() || !to.length || !voiceSec} onPress={save} />
        </View>
      ) : (
        <Button label="Tạo hộp thời gian" icon="add" variant="soft" style={{ marginTop: 18 }} onPress={() => setCreating(true)} />
      )}

      <SectionHeader title="Các hộp đang khoá" />
      {state.capsules.map((k) => {
        const from = member(state, k.fromId);
        const left = daysBetween(today, new Date(k.openOn));
        return (
          <View key={k.id} style={styles.capsule}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.inkSoft} />
              <T variant="small" color={colors.inkSoft}>Mở sau {Math.max(0, left)} ngày, vào {new Date(k.openOn).getDate()}/{new Date(k.openOn).getMonth() + 1}/{new Date(k.openOn).getFullYear()}</T>
            </View>
            <T variant="h2">{k.title}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar name={from?.name ?? '?'} uri={from?.avatarUri} size={26} />
              <T variant="small" color={colors.inkSoft} style={{ flexShrink: 1 }}>
                {from?.roleLabel} gửi {k.toIds.map((id) => member(state, id)?.roleLabel.toLowerCase()).join(', ')}
                {k.voiceSec ? `, lời nhắn ${duration(k.voiceSec)}` : ''}
              </T>
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, gap: 14, marginTop: 18 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  capsule: { gap: 8, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, marginBottom: 10 },
});
