import AsyncStorage from '@react-native-async-storage/async-storage';
import { FuriganaSegment } from '../types';

const WORDBOOK_KEY = 'kotoba-biyori.wordbook-v1';
const MAX_ENTRIES = 1000;

export type WordbookEntry = {
  id: string;
  text: string;
  source: 'selection' | 'manual';
  createdAt: number;
  definition?: WordbookDefinition;
  definitionError?: string;
};

export type WordbookDefinition = {
  japanese: FuriganaSegment[];
  meanings: string[];
  partOfSpeech: string;
  usage: string;
  examples: Array<{
    japanese: FuriganaSegment[];
    chinese: string;
  }>;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');

export async function loadWordbook(): Promise<WordbookEntry[]> {
  const raw = await AsyncStorage.getItem(WORDBOOK_KEY);
  if (!raw) return [];
  try {
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry.text === 'string') : [];
  } catch {
    return [];
  }
}

export const saveWordbook = (entries: WordbookEntry[]) =>
  AsyncStorage.setItem(WORDBOOK_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));

export function addWordbookEntry(entries: WordbookEntry[], value: string, source: WordbookEntry['source']) {
  const text = normalize(value).slice(0, 200);
  if (!text) return { entries, added: false };
  const key = text.toLocaleLowerCase();
  if (entries.some((entry) => normalize(entry.text).toLocaleLowerCase() === key)) return { entries, added: false };
  const entry: WordbookEntry = { id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, source, createdAt: Date.now() };
  return {
    added: true,
    entry,
    entries: [...entries, entry].slice(-MAX_ENTRIES),
  };
}
