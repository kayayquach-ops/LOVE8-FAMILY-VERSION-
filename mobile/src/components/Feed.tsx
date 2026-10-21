import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Member, Post, Story } from '@/data/types';
import { duration, inDaysLabel, relativeTime, shortDate } from '@/lib/format';
import { lunarOf } from '@/lib/lunar';
import { member, postedToday, type Nudge, type UpcomingEvent } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadow } from '@/theme';
import { Avatar, Card, Pill, PhotoTile, T } from './ui';

const QUICK = ['❤️', '🥺', '😍', '👏'];

export function MemberStrip() {
  const { state } = useApp();
  const meFirst = [...state.family.members].sort((a) => (a.id === state.meId ? -1 : 1));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 20 }}>
      {meFirst.map((m) => {
        const isMe = m.id === state.meId;
        const posted = postedToday(state, m.id);
        return (
          <Pressable key={m.id} onPress={() => (isMe ? router.push('/capture') : router.push(`/member/${m.id}`))} style={{ alignItems: 'center', gap: 6, width: 62 }}>
            <View>
              <Avatar name={m.name} uri={m.avatarUri} size={54} ring ringColor={posted ? colors.primary : colors.line} />
              {isMe && (
                <View style={styles.plus}>
                  <Ionicons name="add" size={14} color={colors.white} />
                </View>
              )}
            </View>
            <T variant="caption" numberOfLines={1} color={colors.inkSoft}>{isMe ? 'Bạn' : m.roleLabel}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function PostCard({ post, width }: { post: Post; width?: number }) {
  const { state, dispatch } = useApp();
  const author = member(state, post.authorId);
  const mine = post.reactions[state.meId];
  return (
    <Pressable onPress={() => router.push(`/post/${post.id}`)} style={[{ width }, styles.post]}>
      <PhotoTile seed={post.id} emoji={post.emoji} uri={post.photoUri} height={width ? width * 1.15 : 300}>
        <View style={styles.postTop}>
          <Pill label={relativeTime(post.createdAt)} icon="time" />
          {post.voiceSec ? <Pill label={duration(post.voiceSec)} icon="mic" bg={colors.white} color={colors.ink} /> : null}
        </View>
        <View style={styles.postBottom}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar name={author?.name ?? '?'} uri={author?.avatarUri} size={30} />
            <T variant="small" weight="semibold" color={colors.white}>{author?.roleLabel}</T>
          </View>
          <T variant="small" color={colors.white} numberOfLines={2} style={{ marginTop: 6 }}>{post.caption}</T>
        </View>
      </PhotoTile>
      <View style={styles.reactions}>
        {QUICK.map((e) => (
          <Pressable key={e} onPress={() => dispatch({ type: 'react', postId: post.id, emoji: e })} style={[styles.react, mine === e && styles.reactOn]}>
            <T variant="body">{e}</T>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chatbubble-outline" size={15} color={colors.muted} />
          <T variant="small" color={colors.muted}>{post.replies.length}</T>
        </View>
      </View>
    </Pressable>
  );
}

export function NudgeCard({ nudge }: { nudge: Nudge }) {
  const { dispatch } = useApp();
  const m = nudge.member;
  return (
    <Card style={{ gap: 12, backgroundColor: colors.primaryTint }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={m.name} uri={m.avatarUri} size={44} />
        <View style={{ flex: 1 }}>
          <T variant="body" weight="semibold">{nudge.days} ngày chưa gọi cho {m.roleLabel.toLowerCase()}</T>
          <T variant="small" color={colors.muted}>Gợi ý mở lời: {nudge.starter}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={() => router.push(`/member/${m.id}`)} style={[styles.small, { backgroundColor: colors.primary }]}>
          <Ionicons name="call" size={15} color={colors.white} />
          <T variant="small" weight="semibold" color={colors.white}>Gọi qua Zalo</T>
        </Pressable>
        <Pressable onPress={() => dispatch({ type: 'markCalled', memberId: m.id })} style={[styles.small, { backgroundColor: colors.white }]}>
          <Ionicons name="checkmark" size={15} color={colors.ink} />
          <T variant="small" weight="semibold">Đã gọi rồi</T>
        </Pressable>
      </View>
    </Card>
  );
}

const KIND_ICON = { birthday: '🎂', gio: '🕯️', tet: '🧧', anniversary: '💍', custom: '🌕' } as const;

export function EventRow({ item }: { item: UpcomingEvent }) {
  const { event, date, inDays } = item;
  const l = lunarOf(date);
  return (
    <View style={styles.eventRow}>
      <View style={styles.eventIcon}><T variant="h2">{KIND_ICON[event.kind]}</T></View>
      <View style={{ flex: 1 }}>
        <T variant="body" weight="semibold" numberOfLines={1}>{event.title}</T>
        <T variant="small" color={colors.muted} numberOfLines={1}>
          {shortDate(date)} · {l.day}/{l.month} âm{event.calendar === 'lunar' ? ' 🌙' : ''}
        </T>
      </View>
      <View style={[styles.inDays, inDays <= 7 && { backgroundColor: colors.primary }]}>
        <T variant="caption" weight="bold" color={inDays <= 7 ? colors.white : colors.inkSoft}>{inDaysLabel(inDays)}</T>
      </View>
    </View>
  );
}

export function StoryCard({ story, compact }: { story: Story; compact?: boolean }) {
  const { state } = useApp();
  const teller = member(state, story.tellerId);
  return (
    <Card onPress={() => router.push(`/story/${story.id}`)} style={{ padding: 0, overflow: 'hidden' }}>
      <PhotoTile seed={story.id} emoji={story.emoji} height={compact ? 110 : 150} radiusSize={0}>
        <View style={{ position: 'absolute', top: 10, left: 10 }}>
          <Pill label={story.year ? `${story.year}` : 'Ký ức'} icon="book" />
        </View>
      </PhotoTile>
      <View style={{ padding: 14, gap: 6 }}>
        <T variant="body" weight="semibold" numberOfLines={2}>{story.title}</T>
        <T variant="small" color={colors.muted} numberOfLines={2}>“{story.quote}”</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Avatar name={teller?.name ?? '?'} uri={teller?.avatarUri} size={22} />
          <T variant="caption" color={colors.inkSoft}>{teller?.roleLabel} kể · {duration(story.durationSec)}</T>
        </View>
      </View>
    </Card>
  );
}

export function MemberMini({ m }: { m: Member }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Avatar name={m.name} uri={m.avatarUri} size={26} />
      <T variant="small" weight="medium">{m.roleLabel}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  plus: {
    position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white,
  },
  post: { backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.soft },
  postTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  postBottom: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  reactions: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  react: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.field },
  reactOn: { backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary },
  small: {
    flex: 1, height: 40, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  eventIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center',
  },
  inDays: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.field },
});
