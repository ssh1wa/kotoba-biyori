import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { AppSettings, RoleplayMessage, RoleplayReply } from '../types';
import { parseLearnerName } from './learnerName';

const API_KEY = 'kotoba-biyori.deepseek-key';
const GEMINI_API_KEY = 'kotoba-biyori.gemini-key';
const SETTINGS_KEY = 'kotoba-biyori.settings';
const ROLEPLAY_KEY = 'kotoba-biyori.roleplay';
const webSecretKey = (key: string) => `web-secret.${key}`;

const getSecret = (key: string) =>
  Platform.OS === 'web' ? AsyncStorage.getItem(webSecretKey(key)) : SecureStore.getItemAsync(key);

const setSecret = (key: string, value: string) =>
  Platform.OS === 'web' ? AsyncStorage.setItem(webSecretKey(key), value) : SecureStore.setItemAsync(key, value);

const deleteSecret = (key: string) =>
  Platform.OS === 'web' ? AsyncStorage.removeItem(webSecretKey(key)) : SecureStore.deleteItemAsync(key);

export const defaultSettings: AppSettings = {
  provider: 'openai',
  theme: 'hiyori',
  featureProviders: {
    translation: 'openai',
    practice: 'openai',
    roleplay: 'openai',
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    models: {
      translation: 'deepseek-v4-flash',
      practice: 'deepseek-v4-flash',
      roleplay: 'deepseek-v4-flash',
    },
  },
  gemini: {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.5-flash',
    models: {
      translation: 'gemini-3.5-flash',
      practice: 'gemini-3.5-flash',
      roleplay: 'gemini-3.5-flash',
    },
  },
  learnerName: '同学',
  learnerNameReading: '',
  learnerProfile: '',
  level: '入门',
  personalizedPractice: true,
  roleplayEnglishHelp: true,
};

export async function loadSettings(): Promise<AppSettings> {
  const [raw, openAiApiKey, geminiApiKey] = await Promise.all([
    AsyncStorage.getItem(SETTINGS_KEY),
    getSecret(API_KEY),
    getSecret(GEMINI_API_KEY),
  ]);
  const saved = raw ? JSON.parse(raw) : {};
  const migratedOpenAi = saved.openai || {};
  const migratedGemini = saved.gemini || {};
  const openAiLegacyModel = migratedOpenAi.model || saved.model || defaultSettings.openai.model;
  const geminiLegacyModel = migratedGemini.model || defaultSettings.gemini.model;
  const migratedLearner = parseLearnerName(saved.learnerName || defaultSettings.learnerName, saved.learnerNameReading);
  return {
    ...defaultSettings,
    ...saved,
    learnerName: migratedLearner.surface,
    learnerNameReading: migratedLearner.reading || '',
    featureProviders: {
      ...defaultSettings.featureProviders,
      ...(saved.featureProviders || {
        translation: saved.provider || 'openai',
        practice: saved.provider || 'openai',
        roleplay: saved.provider || 'openai',
      }),
    },
    openai: {
      ...defaultSettings.openai,
      ...migratedOpenAi,
      baseUrl: migratedOpenAi.baseUrl || saved.baseUrl || defaultSettings.openai.baseUrl,
      model: openAiLegacyModel,
      models: {
        translation: migratedOpenAi.models?.translation || openAiLegacyModel,
        practice: migratedOpenAi.models?.practice || openAiLegacyModel,
        roleplay: migratedOpenAi.models?.roleplay || openAiLegacyModel,
      },
      apiKey: openAiApiKey || '',
    },
    gemini: {
      ...defaultSettings.gemini,
      ...migratedGemini,
      model: geminiLegacyModel,
      models: {
        translation: migratedGemini.models?.translation || geminiLegacyModel,
        practice: migratedGemini.models?.practice || geminiLegacyModel,
        roleplay: migratedGemini.models?.roleplay || geminiLegacyModel,
      },
      apiKey: geminiApiKey || '',
    },
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const publicSettings = {
    ...settings,
    openai: { ...settings.openai, apiKey: '' },
    gemini: { ...settings.gemini, apiKey: '' },
  };
  await Promise.all([
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(publicSettings)),
    settings.openai.apiKey
      ? setSecret(API_KEY, settings.openai.apiKey)
      : deleteSecret(API_KEY),
    settings.gemini.apiKey
      ? setSecret(GEMINI_API_KEY, settings.gemini.apiKey)
      : deleteSecret(GEMINI_API_KEY),
  ]);
}

export const publicSettings = (settings: AppSettings): AppSettings => ({
  ...settings,
  openai: { ...settings.openai, apiKey: '' },
  gemini: { ...settings.gemini, apiKey: '' },
});

export async function importPublicSettings(settings: AppSettings): Promise<AppSettings> {
  const current = await loadSettings();
  const importedLearner = parseLearnerName(settings.learnerName || defaultSettings.learnerName, settings.learnerNameReading);
  const merged: AppSettings = {
    ...defaultSettings,
    ...settings,
    learnerName: importedLearner.surface,
    learnerNameReading: importedLearner.reading || '',
    featureProviders: { ...defaultSettings.featureProviders, ...settings.featureProviders },
    openai: { ...defaultSettings.openai, ...settings.openai, models: { ...defaultSettings.openai.models, ...settings.openai.models }, apiKey: current.openai.apiKey },
    gemini: { ...defaultSettings.gemini, ...settings.gemini, models: { ...defaultSettings.gemini.models, ...settings.gemini.models }, apiKey: current.gemini.apiKey },
  };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(publicSettings(merged)));
  return merged;
}

export type RoleplayState = {
  courseId: string;
  courseStage: string;
  lessonNumber: number;
  progress: number;
  messages: RoleplayMessage[];
  lessonProgress: Record<string, number>;
  lessonSessions: Record<string, RoleplaySession>;
  casualMessages: RoleplayMessage[];
  casualReplyDetails: RoleplayReply | null;
  casualThreads: CasualThread[];
  activeCasualThreadId: string;
  mioFacts: string[];
  savedCourses: Record<string, CourseSnapshot>;
};

export type CasualThread = {
  id: string;
  title: string;
  titleLocked?: boolean;
  createdAt: number;
  updatedAt: number;
  messages: RoleplayMessage[];
  replyDetails: RoleplayReply | null;
  summary: string;
  memories: string[];
  summarizedMessageCount: number;
};

export type RoleplaySession = {
  messages: RoleplayMessage[];
  replyDetails: RoleplayReply | null;
  updatedAt: number;
};

export type CourseSnapshot = Pick<RoleplayState, 'courseStage' | 'lessonNumber' | 'progress' | 'messages' | 'lessonProgress' | 'lessonSessions'>;

export async function loadRoleplay(): Promise<RoleplayState> {
  const raw = await AsyncStorage.getItem(ROLEPLAY_KEY);
  const now = Date.now();
  const initialCasualThread: CasualThread = {
    id: `casual-${now}`,
    title: '新的聊天',
    titleLocked: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
    replyDetails: null,
    summary: '',
    memories: [],
    summarizedMessageCount: 0,
  };
  const fallback: RoleplayState = {
    courseId: 'jlpt-original',
    courseStage: 'N5',
    lessonNumber: 1,
    progress: 0,
    messages: [],
    lessonProgress: {},
    lessonSessions: {},
    casualMessages: [],
    casualReplyDetails: null,
    casualThreads: [initialCasualThread],
    activeCasualThreadId: initialCasualThread.id,
    mioFacts: [],
    savedCourses: {},
  };
  if (!raw) return fallback;
  try {
    const saved = JSON.parse(raw);
    if (saved.courseId) {
      const courseStage = saved.courseStage || 'N5';
      const lessonNumber = saved.lessonNumber || 1;
      const lessonKey = `${courseStage}:${lessonNumber}`;
      const lessonSessions = saved.lessonSessions || {};
      if (!lessonSessions[lessonKey] && saved.messages?.length) {
        lessonSessions[lessonKey] = {
          messages: saved.messages,
          replyDetails: [...saved.messages].reverse().find((message: RoleplayMessage) => message.details)?.details || null,
          updatedAt: saved.messages[saved.messages.length - 1]?.timestamp || Date.now(),
        };
      }
      const casualThreads: CasualThread[] = Array.isArray(saved.casualThreads) && saved.casualThreads.length
        ? saved.casualThreads
        : [{
            ...initialCasualThread,
            messages: saved.casualMessages || [],
            replyDetails: saved.casualReplyDetails || null,
            updatedAt: saved.casualMessages?.[saved.casualMessages.length - 1]?.timestamp || now,
          }];
      const activeCasualThreadId = casualThreads.some((thread) => thread.id === saved.activeCasualThreadId)
        ? saved.activeCasualThreadId
        : casualThreads[0].id;
      const activeCasualThread = casualThreads.find((thread) => thread.id === activeCasualThreadId) || casualThreads[0];
      return {
        ...fallback,
        ...saved,
        courseStage,
        lessonNumber,
        lessonProgress: saved.lessonProgress || {},
        lessonSessions,
        casualMessages: activeCasualThread.messages,
        casualReplyDetails: activeCasualThread.replyDetails,
        casualThreads,
        activeCasualThreadId,
        mioFacts: Array.isArray(saved.mioFacts) ? saved.mioFacts : [],
        savedCourses: saved.savedCourses || {},
      } as RoleplayState;
    }
    return { ...fallback, courseStage: saved.courseLevel || 'N5', lessonNumber: saved.lessonNumber || 1, progress: saved.progress || 0, messages: saved.messages || [] };
  } catch {
    return fallback;
  }
}

export const saveRoleplay = (state: RoleplayState) =>
  AsyncStorage.setItem(ROLEPLAY_KEY, JSON.stringify(state));

export const MIO_FACT_MAX_COUNT = 24;
export const MIO_FACT_MAX_LENGTH = 240;

const MIO_FACT_CATEGORIES = new Set([
  '性格习惯',
  '兴趣爱好',
  '学业工作',
  '家庭',
  '朋友人际',
  '成长经历',
  '重要回忆',
  '生活习惯',
  '饮食偏好',
  '地点经历',
  '计划愿望',
  '雷区边界',
  '其他',
]);

const splitMioFact = (fact: string) => {
  const match = fact.match(/^[【[]?([^】\]：:]{1,12})[】\]]?[：:]\s*(.+)$/);
  if (!match) return null;
  const category = match[1].trim();
  return MIO_FACT_CATEGORIES.has(category) ? { category, detail: match[2].trim() } : null;
};

export const normalizeMioFacts = (facts: unknown): string[] => {
  if (!Array.isArray(facts)) return [];
  const seen = new Set<string>();
  const categoryIndexes = new Map<string, number>();
  return facts.reduce<string[]>((result, value) => {
    if (typeof value !== 'string') return result;
    const fact = value.trim().replace(/\s+/g, ' ');
    const categorized = splitMioFact(fact);
    if (categorized) {
      const key = categorized.category.toLocaleLowerCase();
      const existingIndex = categoryIndexes.get(key);
      if (existingIndex !== undefined) {
        const existing = result[existingIndex];
        const detailKey = categorized.detail.toLocaleLowerCase();
        if (!existing.toLocaleLowerCase().includes(detailKey)) {
          result[existingIndex] = `${existing}；${categorized.detail}`.slice(0, MIO_FACT_MAX_LENGTH);
        }
        return result;
      }
      if (result.length >= MIO_FACT_MAX_COUNT) return result;
      const normalized = `${categorized.category}：${categorized.detail}`.slice(0, MIO_FACT_MAX_LENGTH);
      categoryIndexes.set(key, result.length);
      seen.add(normalized.toLocaleLowerCase());
      result.push(normalized);
      return result;
    }
    const normalized = fact.slice(0, MIO_FACT_MAX_LENGTH);
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key) || result.length >= MIO_FACT_MAX_COUNT) return result;
    seen.add(key);
    result.push(normalized);
    return result;
  }, []);
};

export async function updateMioFacts(facts: string[]) {
  const roleplay = await loadRoleplay();
  await saveRoleplay({ ...roleplay, mioFacts: normalizeMioFacts(facts) });
}
