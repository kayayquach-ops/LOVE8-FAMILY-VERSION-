import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { createSeedState } from '@/data/seed';
import type { AppState, FamilyEvent, FamilyMessage, PostTag, Privacy, Question, Settings } from '@/data/types';

// Đổi số phiên bản mỗi khi cấu trúc dữ liệu đổi hẳn, để bản lưu cũ không làm hỏng app.
const STORAGE_KEY = 'homeletter-state-v2';

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

type NewMessage = Omit<FamilyMessage, 'id' | 'createdAt' | 'authorId'>;

type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'reset' }
  | { type: 'chooseMember'; memberId: string; parentMode: boolean; avatarUri?: string; birthday?: { day: number; month: number }; intro?: Record<string, string> }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'addPost'; caption: string; tag?: PostTag; photoUri?: string; voiceSec?: number; year?: number }
  | { type: 'react'; postId: string; emoji: string }
  | { type: 'reply'; postId: string; text?: string; voiceSec?: number }
  | { type: 'markCalled'; memberId: string }
  | { type: 'addQuestion'; toId: string; text: string; kind: Question['kind']; gentle?: string }
  | { type: 'removeQuestion'; id: string }
  | { type: 'askedAll'; toId: string }
  | { type: 'sendMessage'; message: NewMessage }
  | { type: 'cancelMessage'; id: string }
  | { type: 'heard'; id: string }
  | { type: 'missionDone'; id: string }
  | { type: 'deleteLetter'; id: string }
  | { type: 'reactStory'; storyId: string; emoji: string }
  | { type: 'addPerspective'; storyId: string; text: string }
  | { type: 'addFollowUp'; storyId: string; text: string }
  | { type: 'setPrivacy'; storyId: string; privacy: Privacy }
  | { type: 'addEvent'; event: Omit<FamilyEvent, 'id'> }
  | { type: 'removeEvent'; id: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state;
    case 'reset':
      return createSeedState();
    case 'chooseMember':
      return {
        ...state, onboarded: true, meId: action.memberId,
        settings: { ...state.settings, parentMode: action.parentMode, intro: action.intro ?? state.settings.intro },
        family: {
          ...state.family,
          // Ảnh và ngày sinh nhập lúc mới vào app thay cho dữ liệu mẫu.
          members: state.family.members.map((m) => (m.id === action.memberId ? {
            ...m, lastActiveAt: now(),
            avatarUri: action.avatarUri ?? m.avatarUri,
            birthday: action.birthday ? { calendar: 'solar' as const, ...action.birthday, year: m.birthday?.year } : m.birthday,
          } : m)),
        },
      };
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'addPost':
      return {
        ...state,
        posts: [
          {
            id: newId('p'), authorId: state.meId, createdAt: now(), caption: action.caption, tag: action.tag,
            photoUri: action.photoUri, voiceSec: action.voiceSec, year: action.year, reactions: {}, replies: [],
          },
          ...state.posts,
        ],
      };
    case 'react':
      return {
        ...state,
        posts: state.posts.map((p) => {
          if (p.id !== action.postId) return p;
          const reactions = { ...p.reactions };
          if (reactions[state.meId] === action.emoji) delete reactions[state.meId];
          else reactions[state.meId] = action.emoji;
          return { ...p, reactions };
        }),
      };
    case 'reply': {
      // Trả lời một tấm ảnh thì lời trả lời vào luôn chat chung, như Locket.
      const at = now();
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId
            ? { ...p, replies: [...p.replies, { id: newId('r'), authorId: state.meId, text: action.text, voiceSec: action.voiceSec, createdAt: at }] }
            : p,
        ),
        messages: [...state.messages, { id: newId('m'), authorId: state.meId, createdAt: at, postId: action.postId, text: action.text, voiceSec: action.voiceSec }],
      };
    }
    case 'markCalled':
      return { ...state, calls: { ...state.calls, [action.memberId]: now() } };
    case 'addQuestion':
      return {
        ...state,
        questions: [
          {
            id: newId('q'), fromId: state.meId, toId: action.toId, kind: action.kind, text: action.text,
            gentle: action.gentle, status: 'pending', createdAt: now(),
          },
          ...state.questions,
        ],
      };
    case 'askedAll':
      return {
        ...state,
        questions: state.questions.map((q) => (q.toId === action.toId && q.status === 'pending' ? { ...q, status: 'asked' } : q)),
      };
    case 'removeQuestion':
      return { ...state, questions: state.questions.filter((q) => q.id !== action.id) };
    case 'sendMessage':
      return { ...state, messages: [...state.messages, { ...action.message, id: newId('m'), authorId: state.meId, createdAt: now() }] };
    case 'cancelMessage':
      return { ...state, messages: state.messages.filter((m) => m.id !== action.id) };
    case 'heard':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id && !(m.heardBy ?? []).includes(state.meId) ? { ...m, heardBy: [...(m.heardBy ?? []), state.meId] } : m,
        ),
      };
    case 'missionDone':
      return { ...state, missions: state.missions.map((m) => (m.id === action.id ? { ...m, done: true } : m)) };
    case 'deleteLetter':
      return {
        ...state,
        letters: state.letters.filter((l) => l.id !== action.id),
        messages: state.messages.filter((m) => m.letterId !== action.id),
      };
    case 'reactStory':
      return {
        ...state,
        stories: state.stories.map((s) =>
          s.id === action.storyId ? { ...s, reactions: { ...s.reactions, [state.meId]: action.emoji } } : s,
        ),
      };
    case 'addPerspective':
      return {
        ...state,
        stories: state.stories.map((s) =>
          s.id === action.storyId
            ? { ...s, perspectives: [...s.perspectives, { authorId: state.meId, text: action.text, createdAt: now() }] }
            : s,
        ),
      };
    case 'addFollowUp': {
      const story = state.stories.find((s) => s.id === action.storyId);
      if (!story) return state;
      return {
        ...state,
        questions: [
          { id: newId('q'), fromId: state.meId, toId: story.tellerId, kind: 'hidden', text: action.text, status: 'pending', createdAt: now() },
          ...state.questions,
        ],
      };
    }
    case 'setPrivacy':
      return { ...state, stories: state.stories.map((s) => (s.id === action.storyId ? { ...s, privacy: action.privacy } : s)) };
    case 'addEvent':
      return { ...state, events: [...state.events, { ...action.event, id: newId('e') }] };
    case 'removeEvent':
      return { ...state, events: state.events.filter((e) => e.id !== action.id) };
  }
}

type Ctx = { state: AppState; dispatch: (a: Action) => void; ready: boolean };
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createSeedState);
  const ready = useRef(false);
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        // Trộn với dữ liệu mặc định để bản lưu cũ vẫn chạy khi app thêm trường mới.
        const saved = JSON.parse(raw) as Partial<AppState>;
        const base = createSeedState();
        dispatch({ type: 'hydrate', state: { ...base, ...saved, settings: { ...base.settings, ...saved.settings } } });
      })
      .catch(() => {})
      .finally(() => {
        ready.current = true;
        force();
      });
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const value = useMemo(() => ({ state, dispatch, ready: ready.current }), [state, ready.current]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
