import n1 from '../../resources/hanabira-data/grammar_json/grammar_ja_N1_full_alphabetical_0001.json';
import n2 from '../../resources/hanabira-data/grammar_json/grammar_ja_N2_full_alphabetical_0001.json';
import n3 from '../../resources/hanabira-data/grammar_json/grammar_ja_N3_full_alphabetical_0001.json';
import n4 from '../../resources/hanabira-data/grammar_json/grammar_ja_N4_full_alphabetical_0001.json';
import n5 from '../../resources/hanabira-data/grammar_json/grammar_ja_N5_full_alphabetical_0001.json';
import { CourseLevel } from '../types';

export type OpenGrammarEntry = {
  title: string;
  short_explanation: string;
  long_explanation: string;
  formation: string;
  examples: Array<{ jp: string; romaji: string; en: string }>;
};

export const grammarLibrary: Record<CourseLevel, OpenGrammarEntry[]> = {
  N5: n5 as OpenGrammarEntry[],
  N4: n4 as OpenGrammarEntry[],
  N3: n3 as OpenGrammarEntry[],
  N2: n2 as OpenGrammarEntry[],
  N1: n1 as OpenGrammarEntry[],
};

const normalize = (value: string) =>
  value.replace(/[〜～~\s・（）()A-Z]/gi, '').toLowerCase();

export function findGrammarReferences(level: CourseLevel, patterns: string[]) {
  const entries = grammarLibrary[level];
  return patterns
    .map((pattern) => {
      const needle = normalize(pattern);
      return entries.find((entry) => {
        const title = normalize(entry.title);
        return title.includes(needle) || needle.includes(title.slice(0, Math.min(title.length, 5)));
      });
    })
    .filter((entry): entry is OpenGrammarEntry => Boolean(entry))
    .slice(0, 3);
}
