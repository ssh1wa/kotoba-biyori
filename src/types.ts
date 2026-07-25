export type FuriganaSegment = {
  text: string;
  reading?: string | null;
};

export type GrammarPoint = {
  pattern: string;
  meaning: string;
  explanation: string;
  example?: FuriganaSegment[];
  exampleMeaning?: string;
};

export type WordNote = {
  surface: string;
  reading?: string | null;
  meaning: string;
  partOfSpeech: string;
};

export type DictionaryEntry = {
  japanese: FuriganaSegment[];
  meanings: string[];
  partOfSpeech: string;
  usage: string;
  examples: Array<{
    japanese: FuriganaSegment[];
    chinese: string;
  }>;
};

export type TranslationResult = {
  direction: 'ja-zh' | 'zh-ja';
  inputKind: 'word' | 'sentence';
  translationJapanese: FuriganaSegment[];
  translationChinese: string;
  naturalNote: string;
  dictionaryEntries: DictionaryEntry[];
  words: WordNote[];
  grammar: GrammarPoint[];
};

export type TutorFollowUpReply = {
  answer: string;
  examples: Array<{
    japanese: FuriganaSegment[];
    chinese: string;
  }>;
};

export type TutorFollowUpTurn = TutorFollowUpReply & {
  id: string;
  question: string;
  timestamp: number;
};

export type PracticeDirection = 'zh-ja' | 'ja-zh';

export type PracticeQuestion = {
  id: string;
  direction: PracticeDirection;
  level: string;
  sourceText: string;
  sourceJapanese?: FuriganaSegment[];
  focus: string;
  hint: string;
  referenceChinese: string;
  referenceJapanese: FuriganaSegment[];
  answerNote: string;
};

export type PracticeGrade = {
  score: number;
  verdict: 'excellent' | 'good' | 'retry';
  feedback: string;
  strengths: string[];
  corrections: string[];
  correctChinese?: string;
  correctJapanese?: FuriganaSegment[];
  grammarTip: string;
  focusMastery?: 'mastered' | 'partial' | 'missed';
  reviewTargets?: string[];
};

export type RoleplayMessage = {
  id: string;
  role: 'user' | 'mio';
  text?: string;
  japanese?: FuriganaSegment[];
  englishHelp?: string;
  details?: RoleplayReply;
  timestamp: number;
};

export type RoleplayReply = {
  japanese: FuriganaSegment[];
  englishHelp: string;
  conversationTitle?: string;
  newMioFacts?: string[];
  newWords: WordNote[];
  grammar: GrammarPoint[];
  suggestedReplies: Array<{
    japanese: FuriganaSegment[];
    meaning: string;
  }>;
  lessonProgress: number;
  mood?: 'calm' | 'happy' | 'excited' | 'playful' | 'shy' | 'worried' | 'tired' | 'annoyed' | 'hurt' | 'angry';
  moodReason?: string;
};

export type CasualMemoryDigest = {
  title: string;
  summary: string;
  memories: string[];
  mioFacts?: string[];
};

export type Provider = 'openai' | 'gemini';
export type ModelFeature = 'translation' | 'practice' | 'roleplay';
export type ThemeId = 'hiyori' | 'indigo' | 'forest' | 'sakura' | 'night';

export type FeatureModels = Record<ModelFeature, string>;

export type ApiProfile = {
  apiKey: string;
  baseUrl: string;
  model: string;
  models: FeatureModels;
};

export type AppSettings = {
  provider: Provider;
  theme: ThemeId;
  featureProviders: Record<ModelFeature, Provider>;
  openai: ApiProfile;
  gemini: ApiProfile;
  learnerName: string;
  learnerNameReading: string;
  learnerProfile: string;
  level: '入门' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
  personalizedPractice: boolean;
  roleplayEnglishHelp: boolean;
};

export type CourseLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export type Lesson = {
  level: CourseLevel;
  stage?: string;
  number: number;
  title: string;
  scene: string;
  goals: string[];
  grammar: string[];
  vocabulary: string[];
  review?: string[];
};

export type CourseTrack = {
  id: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  sourceNote: string;
  stages: string[];
  lessons: Lesson[];
};
