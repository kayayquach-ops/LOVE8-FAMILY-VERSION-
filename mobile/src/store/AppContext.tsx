import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { createSeedState } from '@/data/seed';
import type {
  AppState, Birthday, Capsule, ChatMessage, ChatMode, FamilyEvent, Post, PostTag, Privacy, Role, Settings, Story,
} from '@/data/types';

const STORAGE_KEY = 'homeletter-state-v1';

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'reset' }
  | { type: 'completeOnboarding' }
  | { type: 'signIn'; name: string; role: Role; roleLabel: string; birthday?: Birthday; avatarUri?: string; phone: string; city: string }
  | { type: 'setFamily'; name: string; inviteCode?: string }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'addPost'; caption: string; tag?: PostTag; emoji?: string; photoUri?: string; voiceSec?: number }
  | { type: 'react'; postId: string; emoji: string }
  | { type: 'reply'; postId: string; text?: string; voiceSec?: number }
  | { type: 'markCalled'; memberId: string }
  | { type: 'addQuestion'; toId: string; text: string }
  | { type: 'questionStatus'; id: string; status: 'pending' | 'asked' | 'answered'; storyId?: string }
  | { type: 'addStory'; story: Story }
  | { type: 'reactStory'; storyId: string; emoji: string }
  | { type: 'addPerspective'; storyId: string; text: string }
  | { type: 'addFollowUp'; storyId: string; text: string }
  | { type: 'setPrivacy'; storyId: string; privacy: Privacy }
  | { type: 'addEvent'; event: Omit<FamilyEvent, 'id'> }
  | { type: 'removeEvent'; id: string }
  | { type: 'addChat'; mode: ChatMode; message: Omit<ChatMessage, 'id' | 'createdAt'> }
  | { type: 'addCapsule'; capsule: Omit<Capsule, 'id' | 'createdAt' | 'fromId'> }
  | { type: 'cooked'; recipeId: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state;
    case 'reset':
      return createSeedState();
    case 'completeOnboarding':
      return { ...state, onboarded: true };
    case 'signIn': {
      const members = state.family.members.map((m) =>
        m.id === state.meId
          ? {
              ...m, name: action.name || m.name, role: action.role, roleLabel: action.roleLabel,
              birthday: action.birthday ?? m.birthday, avatarUri: action.avatarUri ?? m.avatarUri,
              phone: action.phone, city: action.city || m.city, lastActiveAt: now(),
            }
          : m,
      );
      return { ...state, signedIn: true, family: { ...state.family, members } };
    }
    case 'setFamily':
      return {
        ...state,
        family: { ...state.family, name: action.name || state.family.name, inviteCode: action.inviteCode ?? state.family.inviteCode },
      };
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'addPost': {
      const post: Post = {
        id: newId('p'), authorId: state.meId, createdAt: now(), caption: action.caption, tag: action.tag,
        emoji: action.emoji, photoUri: action.photoUri, voiceSec: action.voiceSec, reactions: {}, replies: [],
      };
      return { ...state, posts: [post, ...state.posts] };
    }
    case 'react':
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId ? { ...p, reactions: { ...p.reactions, [state.meId]: action.emoji } } : p,
        ),
      };
    case 'reply':
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId
            ? { ...p, replies: [...p.replies, { id: newId('r'), authorId: state.meId, text: action.text, voiceSec: action.voiceSec, createdAt: now() }] }
            : p,
        ),
      };
    case 'markCalled':
      return { ...state, calls: { ...state.calls, [action.memberId]: now() } };
    case 'addQuestion':
      return {
        ...state,
        questions: [
          { id: newId('q'), fromId: state.meId, toId: action.toId, text: action.text, status: 'pending', createdAt: now() },
          ...state.questions,
        ],
      };
    case 'questionStatus':
      return {
        ...state,
        questions: state.questions.map((q) =>
          q.id === action.id ? { ...q, status: action.status, storyId: action.storyId ?? q.storyId } : q,
        ),
      };
    case 'addStory':
      return { ...state, stories: [action.story, ...state.stories] };
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
          { id: newId('q'), fromId: state.meId, toId: story.tellerId, text: action.text, status: 'pending', createdAt: now() },
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
    case 'addChat':
      return {
        ...state,
        chats: {
          ...state.chats,
          [action.mode]: [...state.chats[action.mode], { ...action.message, id: newId('m'), createdAt: now() }],
        },
      };
    case 'addCapsule':
      return {
        ...state,
        capsules: [{ ...action.capsule, id: newId('k'), createdAt: now(), fromId: state.meId }, ...state.capsules],
      };
    case 'cooked':
      return {
        ...state,
        recipes: state.recipes.map((r) =>
          r.id === action.recipeId && !r.cookedBy.includes(state.meId) ? { ...r, cookedBy: [...r.cookedBy, state.meId] } : r,
        ),
      };
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
        dispatch({
          type: 'hydrate',
          state: { ...base, ...saved, settings: { ...base.settings, ...saved.settings }, chats: { ...base.chats, ...saved.chats } },
        });
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
