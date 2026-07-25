import { FuriganaSegment, RoleplayReply } from '../types';

export type LearnerNameSpec = {
  surface: string;
  reading: string | null;
};

export const parseLearnerName = (value: string, explicitReading?: string): LearnerNameSpec => {
  const trimmed = value.trim();
  const annotated = trimmed.match(/^(.+?)\s*[（(]\s*([^（）()]+?)\s*[）)]$/u);
  const suppliedReading = explicitReading?.trim();
  if (suppliedReading) {
    return {
      surface: annotated?.[1].trim() || trimmed || '同学',
      reading: suppliedReading,
    };
  }
  if (!annotated) return { surface: trimmed || '同学', reading: null };
  return {
    surface: annotated[1].trim() || '同学',
    reading: annotated[2].trim() || null,
  };
};

export const learnerNameInstruction = (value: string, reading?: string) => {
  const name = parseLearnerName(value, reading);
  if (!name.reading) {
    return `The learner's display name is exactly "${name.surface}". Keep this spelling unchanged whenever it appears.`;
  }
  return `The learner's display name is exactly "${name.surface}" and its user-supplied reading is exactly "${name.reading}". Whenever the name appears in a Japanese segment, output {"text":"${name.surface}","reading":"${name.reading}"}. Never infer, translate, romanize, or replace this reading.`;
};

export const enforceLearnerNameReading = (
  segments: FuriganaSegment[] | undefined,
  value: string,
  reading?: string,
): FuriganaSegment[] => {
  if (!segments?.length) return [];
  const name = parseLearnerName(value, reading);
  if (!name.reading || !name.surface) return segments;
  const isKanji = (character: string | undefined) => !!character && /[\u3400-\u9FFF々〆ヶ]/u.test(character);
  const nameSuffixes = ['君', '様', '氏'];

  return segments.flatMap((segment) => {
    if (!segment.text.includes(name.surface)) return segment;
    const result: FuriganaSegment[] = [];
    let outputCursor = 0;
    let searchCursor = 0;
    let match = segment.text.indexOf(name.surface, searchCursor);
    while (match >= 0) {
      const beforeCharacter = match > 0 ? segment.text[match - 1] : undefined;
      const afterIndex = match + name.surface.length;
      const afterCharacter = segment.text[afterIndex];
      const followedByNameSuffix = nameSuffixes.some((suffix) => segment.text.startsWith(suffix, afterIndex));
      const isStandaloneName = !isKanji(beforeCharacter) && (!isKanji(afterCharacter) || followedByNameSuffix);
      if (isStandaloneName) {
        const before = segment.text.slice(outputCursor, match);
        if (before) result.push({ text: before, reading: null });
        result.push({ text: name.surface, reading: name.reading });
        outputCursor = afterIndex;
      }
      searchCursor = afterIndex;
      match = segment.text.indexOf(name.surface, searchCursor);
    }
    if (!result.length) return segment;
    const after = segment.text.slice(outputCursor);
    if (after) result.push({ text: after, reading: null });
    return result;
  });
};

export const enforceLearnerNameInReply = (reply: RoleplayReply, value: string, reading?: string): RoleplayReply => {
  const name = parseLearnerName(value, reading);
  return {
    ...reply,
    japanese: enforceLearnerNameReading(reply.japanese, value, reading),
    newWords: (reply.newWords || []).map((word) => (
      word.surface === name.surface && name.reading ? { ...word, reading: name.reading } : word
    )),
    grammar: (reply.grammar || []).map((item) => ({
      ...item,
      example: enforceLearnerNameReading(item.example, value, reading),
    })),
    suggestedReplies: (reply.suggestedReplies || []).map((suggestion) => ({
      ...suggestion,
      japanese: enforceLearnerNameReading(suggestion.japanese, value, reading),
    })),
  };
};
