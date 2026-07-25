import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FuriganaSegment,
  PracticeDirection,
  PracticeGrade,
  PracticeQuestion,
  RoleplayMessage,
  RoleplayReply,
  TranslationResult,
  TutorFollowUpTurn,
} from '../types';

const ACTIVITY_KEY = 'kotoba-biyori.activity-v1';
const MAX_RECORDS = 1500;

export type ActivityKind = 'translation' | 'practice' | 'roleplay';

export type ActivitySnapshot =
  | {
      kind: 'translation';
      input: string;
      result: TranslationResult;
      followUps?: TutorFollowUpTurn[];
    }
  | {
      kind: 'practice';
      direction: PracticeDirection;
      question: PracticeQuestion;
      answer: string;
      grade: PracticeGrade | null;
      revealed: boolean;
      followUps?: TutorFollowUpTurn[];
    }
  | {
      kind: 'roleplay';
      mode: 'course' | 'casual';
      courseId?: string;
      courseStage?: string;
      lessonNumber?: number;
      progress?: number;
      casualThreadId?: string;
      casualThreadTitle?: string;
      messages: RoleplayMessage[];
      replyDetails: RoleplayReply | null;
    };

export type ActivityRecord = {
  id: string;
  date: string;
  timestamp: number;
  type: ActivityKind;
  sourceText: string;
  sourceJapanese?: FuriganaSegment[];
  userAnswer?: string;
  resultText?: string;
  resultJapanese?: FuriganaSegment[];
  score?: number;
  note?: string;
  snapshot?: ActivitySnapshot;
};

export type ActivityRecordDraft = Omit<ActivityRecord, 'id' | 'date' | 'timestamp'>;

export type ActivityState = {
  checkIns: string[];
  records: ActivityRecord[];
};

export const emptyActivityState: ActivityState = { checkIns: [], records: [] };

export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export async function loadActivity(): Promise<ActivityState> {
  const raw = await AsyncStorage.getItem(ACTIVITY_KEY);
  if (!raw) return emptyActivityState;
  try {
    const saved = JSON.parse(raw) as Partial<ActivityState>;
    return {
      checkIns: Array.isArray(saved.checkIns) ? [...new Set(saved.checkIns)] : [],
      records: Array.isArray(saved.records) ? saved.records : [],
    };
  } catch {
    return emptyActivityState;
  }
}

export const saveActivity = (state: ActivityState) =>
  AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(state));

export function addActivity(
  current: ActivityState,
  draft: ActivityRecordDraft,
  earnsCheckIn: boolean,
): { state: ActivityState; firstCheckInToday: boolean; record: ActivityRecord } {
  const now = new Date();
  const date = localDateKey(now);
  const firstCheckInToday = earnsCheckIn && !current.checkIns.includes(date);
  const record: ActivityRecord = {
    ...draft,
    id: `${draft.type}-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    date,
    timestamp: now.getTime(),
  };
  return {
    firstCheckInToday,
    record,
    state: {
      checkIns: firstCheckInToday ? [...current.checkIns, date].sort() : current.checkIns,
      records: [...current.records, record].slice(-MAX_RECORDS),
    },
  };
}

export function currentStreak(checkIns: string[]) {
  const dates = new Set(checkIns);
  const cursor = new Date();
  if (!dates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
