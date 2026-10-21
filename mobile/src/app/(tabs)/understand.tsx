import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LetterCard } from '@/components/Feed';
import { Ionicons } from '@/components/Icon';
import { PersonView } from '@/components/Understand';
import { Avatar, LogoMark, Screen, SectionHeader, T, Tap } from '@/components/ui';
import { isElder, me, understandable, visibleLetters } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

// Tab Hiểu nhau: mỗi người khác thế hệ một trang. Con chỉ xem của bố mẹ, ông bà; bố mẹ chỉ xem của con.
export default function Understand() {
  const { state } = useApp();
  const self = me(state);
  const people = understandable(state);
  const [selected, setSelected] = useState(people[0]?.id);
  const current = people.find((p) => p.id === selected) ?? people[0];
  const told = visibleLetters(state).filter((l) => l.speakerId === state.meId);

  return (
    <Screen>
      <View style={styles.header}>
        <LogoMark size={44} />
        <View style={{ flex: 1 }}>
          <T variant="h1">Hiểu nhau</T>
          <T variant="small" color={colors.muted}>{isElder(self) ? 'Homeletter giúp bạn hiểu con hơn' : 'Homeletter giúp bạn hiểu bố mẹ hơn'}</T>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 16 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {people.map((p) => {
          const on = p.id === current?.id;
          return (
            <Tap key={p.id} role="tab" selected={on} label={p.roleLabel} onPress={() => setSelected(p.id)} scaleTo={0.94}>
              <View style={[styles.person, on && { backgroundColor: colors.white }]}>
                <Avatar name={p.name} uri={p.avatarUri} size={34} />
                <T variant="body" weight="semibold" color={on ? colors.black : colors.ink}>{p.roleLabel}</T>
              </View>
            </Tap>
          );
        })}
      </ScrollView>

      {current && <View style={{ marginTop: 16 }} key={current.id}><PersonView id={current.id} /></View>}

      <SectionHeader title="Homeletter gọi bạn" />
      <Tap onPress={() => router.push('/call')} label="Nghe thử cuộc gọi" scaleTo={0.98}>
        <View style={styles.callCard}>
          <View style={styles.callIcon}><Ionicons name="call" size={22} color={colors.white} /></View>
          <View style={{ flex: 1 }}>
            <T variant="h3">Nghe thử một cuộc gọi</T>
            <T variant="small" color={colors.muted}>Homeletter gọi bạn, mang theo lời người nhà gửi gắm</T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </View>
      </Tap>

      {told.length > 0 && (
        <>
          <SectionHeader title="Những gì bạn đã kể" />
          <T variant="small" color={colors.muted} style={{ marginTop: -6, marginBottom: 12 }}>
            Chỉ những đoạn bạn đã đồng ý gửi. Mở ra để nghe lại hoặc xoá.
          </T>
          <View style={{ gap: 10 }}>{told.map((l) => <LetterCard key={l.id} letter={l} compact />)}</View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  person: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingLeft: 8, paddingRight: 18, borderRadius: radius.pill,
    backgroundColor: colors.tone,
  },
  callCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16 },
  callIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
});
