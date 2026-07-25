import { ActivityRecord } from './activity';
import { PracticeDirection } from '../types';

export type PracticePersonalizationContext = {
  priorityTargets: string[];
  courseVocabulary: string[];
  avoidSources: string[];
  recentFocuses: string[];
};

const DAY = 24 * 60 * 60 * 1000;
const REVIEW_GAP = 3;
const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s，。！？、,.!?"“”'‘’]/g, '');

export const isRecentPracticeDuplicate = (source: string, context: PracticePersonalizationContext) => {
  const key = normalize(source);
  return !!key && context.avoidSources.some((item) => normalize(item) === key);
};

export function buildPracticePersonalization(
  records: ActivityRecord[],
  direction: PracticeDirection,
  now = Date.now(),
): PracticePersonalizationContext {
  const practices = records
    .filter((record) => record.type === 'practice' && record.snapshot?.kind === 'practice' && record.snapshot.direction === direction)
    .sort((a, b) => b.timestamp - a.timestamp);
  const priority = new Map<string, { label: string; score: number }>();
  const recentFocuses: string[] = [];
  const avoidSources: string[] = [];

  practices.forEach((record, index) => {
    if (record.snapshot?.kind !== 'practice') return;
    const focus = record.snapshot.question.focus?.trim();
    const grade = record.snapshot.grade;
    const ageDays = Math.floor((now - record.timestamp) / DAY);
    const fallbackNeedsReview = !grade?.focusMastery && (grade?.score ?? record.score ?? 100) < 80;
    const reviewTargets = record.snapshot.revealed
      ? (focus ? [focus] : [])
      : grade?.reviewTargets?.filter(Boolean).length
        ? grade.reviewTargets.filter(Boolean)
        : grade?.focusMastery === 'partial' || grade?.focusMastery === 'missed' || fallbackNeedsReview
          ? (focus ? [focus] : [])
          : [];
    const needsReview = reviewTargets.length > 0;

    if (index < REVIEW_GAP) {
      [focus, ...reviewTargets].filter(Boolean).forEach((item) => {
        if (!recentFocuses.some((saved) => normalize(saved) === normalize(item!))) recentFocuses.push(item!);
      });
    }

    if (index >= REVIEW_GAP) {
      reviewTargets.forEach((target) => {
        const key = normalize(target);
        const score = 180 + Math.min(ageDays, 60);
        if (key && (!priority.has(key) || priority.get(key)!.score < score)) priority.set(key, { label: `错题复习：${target}`, score });
      });
    }

    if (focus) {
      const key = normalize(focus);
      if (!needsReview && ageDays >= 21) {
        const score = 75 + Math.min(ageDays, 90);
        if (!priority.has(key) || priority.get(key)!.score < score) priority.set(key, { label: `久未复习：${focus}`, score });
      } else if (!needsReview && index < 12 && !recentFocuses.some((item) => normalize(item) === key)) {
        recentFocuses.push(focus);
      }
    }
    if ((index < REVIEW_GAP || (!needsReview && ageDays < 45)) && record.sourceText && avoidSources.length < 36) {
      if (!avoidSources.some((item) => normalize(item) === normalize(record.sourceText))) avoidSources.push(record.sourceText);
    }
  });

  const learnedGrammar = new Map<string, { label: string; timestamp: number }>();
  const learnedWords = new Map<string, { label: string; timestamp: number }>();
  records.forEach((record) => {
    if (record.type !== 'roleplay' || record.snapshot?.kind !== 'roleplay' || record.snapshot.mode !== 'course') return;
    const details = [record.snapshot.replyDetails, ...record.snapshot.messages.map((message) => message.details)].filter(Boolean);
    details.forEach((detail) => {
      detail?.grammar?.forEach((item) => {
        const label = item.pattern?.trim();
        const key = normalize(label || '');
        if (key && (!learnedGrammar.has(key) || learnedGrammar.get(key)!.timestamp < record.timestamp)) learnedGrammar.set(key, { label, timestamp: record.timestamp });
      });
      detail?.newWords?.forEach((item) => {
        const label = item.surface?.trim();
        const key = normalize(label || '');
        if (key && (!learnedWords.has(key) || learnedWords.get(key)!.timestamp < record.timestamp)) learnedWords.set(key, { label, timestamp: record.timestamp });
      });
    });
  });

  learnedGrammar.forEach(({ label, timestamp }, key) => {
    const matchingPractice = practices.find((record) => normalize(record.snapshot?.kind === 'practice' ? record.snapshot.question.focus : '').includes(key));
    const practicedRecently = matchingPractice && now - matchingPractice.timestamp < 21 * DAY
      && matchingPractice.snapshot?.kind === 'practice'
      && !matchingPractice.snapshot.revealed
      && (matchingPractice.snapshot.grade?.focusMastery === 'mastered'
        || (matchingPractice.score ?? matchingPractice.snapshot.grade?.score ?? 100) >= 80);
    if (practicedRecently || priority.has(key)) return;
    const ageDays = Math.floor((now - timestamp) / DAY);
    priority.set(key, { label: `课程语法：${label}`, score: 120 + Math.min(ageDays, 45) });
  });

  const courseVocabulary = [...learnedWords.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 16)
    .map((item) => item.label);

  return {
    priorityTargets: [...priority.values()].sort((a, b) => b.score - a.score).slice(0, 8).map((item) => item.label),
    courseVocabulary,
    avoidSources,
    recentFocuses: recentFocuses.slice(0, 10),
  };
}
