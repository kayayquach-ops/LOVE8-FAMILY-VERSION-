import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { LetterCard } from '@/components/Feed';
import { Ionicons } from '@/components/Icon';
import { PersonView } from '@/components/Understand';
import { Avatar, Button, Empty, Screen, SectionHeader, T, Tap } from '@/components/ui';
import { inviteMessage } from '@/lib/family';
import { understandable, visibleLetters } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

// Tab Hiểu nhau: mỗi người khác thế hệ một trang. Con chỉ xem của bố mẹ, ông bà; bố mẹ chỉ xem của con.
export default function Understand() {
  const { state } = useApp();
  const people = understandable(state);
  const [selected, setSelected] = useState(people[0]?.id);
  const current = people.find((p) => p.id === selected) ?? people[0];
  const told = visibleLetters(state).filter((l) => l.speakerId === state.meId);

  return (
    <Screen>
      <T variant="h1" style={{ marginTop: 12 }}>Hiểu nhau</T>

      {!current ? (
        <>
          <Empty icon="people-outline" title="Chưa có ai ở đây" text="Mời bố mẹ hoặc con vào nhà để hiểu nhau hơn." />
          <Button label="Mời người nhà" icon="share-outline"
            onPress={() => Share.share({ message: inviteMessage(state.family.name, state.family.inviteCode) })} />
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 16 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {people.map((p) => {
              const on = p.id === current.id;
              return (
                <Tap key={p.id} role="tab" selected={on} label={p.roleLabel} onPress={() => setSelected(p.id)} scaleTo={0.94}>
                  <View style={[styles.person, on && { backgroundColor: colors.toneDeep }]}>
                    <Avatar name={p.name} uri={p.avatarUri} size={34} />
                    <T variant="body" weight="semibold">{p.roleLabel}</T>
                  </View>
                </Tap>
              );
            })}
          </ScrollView>

          <View style={{ marginTop: 16 }} key={current.id}><PersonView id={current.id} /></View>
        </>
      )}

      <Tap style={{ marginTop: 28 }} onPress={() => router.push('/call')} label="Homeletter gọi bạn tuần này" scaleTo={0.98}>
        <View style={styles.callCard}>
          <View style={styles.callIcon}><Ionicons name="call" size={22} color={colors.white} /></View>
          <T variant="body" weight="medium" style={{ flex: 1 }}>Homeletter gọi bạn tuần này</T>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </View>
      </Tap>

      {told.length > 0 && (
        <>
          <SectionHeader title="Những gì bạn đã kể" />
          <View style={{ gap: 10 }}>{told.map((l) => <LetterCard key={l.id} letter={l} compact />)}</View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingLeft: 8, paddingRight: 18, borderRadius: radius.pill,
    backgroundColor: colors.tone,
  },
  callCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16 },
  callIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
});
