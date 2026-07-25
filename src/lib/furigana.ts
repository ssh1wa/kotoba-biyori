import type { FuriganaSegment } from '../types';

const kanjiPattern = /[\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]/;
const kanjiCharacterPattern = /^[\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]$/;
const kanaCharacterPattern = /^[\u3040-\u30ffー]$/;
const placeholderReadingPattern = /^[\s・･·•.。…\-—ー]+$/;

type TextGroup = { text: string; kind: 'kanji' | 'kana' | 'other' };

const characterKind = (character: string): TextGroup['kind'] => {
  if (kanjiCharacterPattern.test(character)) return 'kanji';
  if (kanaCharacterPattern.test(character)) return 'kana';
  return 'other';
};

const splitTextGroups = (text: string): TextGroup[] => Array.from(text).reduce<TextGroup[]>((groups, character) => {
  const kind = characterKind(character);
  const last = groups[groups.length - 1];
  if (last?.kind === kind) last.text += character;
  else groups.push({ text: character, kind });
  return groups;
}, []);

const toHiragana = (value: string) => Array.from(value).map((character) => {
  const code = character.charCodeAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
}).join('');

export const furiganaReading = (segment: FuriganaSegment) => {
  const reading = typeof segment.reading === 'string' ? segment.reading.trim() : '';
  if (!reading || placeholderReadingPattern.test(reading)) return '';
  return reading;
};

export const normalizeFuriganaSegments = (segments: FuriganaSegment[]): FuriganaSegment[] => segments.flatMap((segment) => {
  const reading = furiganaReading(segment);
  const groups = splitTextGroups(segment.text);
  if (!reading || !kanjiPattern.test(segment.text)) {
    return groups.map((group) => ({ text: group.text, reading: null }));
  }
  if (groups.every((group) => group.kind === 'kanji')) return [{ text: segment.text, reading }];

  const normalizedReading = toHiragana(reading);
  const aligned: FuriganaSegment[] = [];
  let cursor = 0;
  let valid = true;

  groups.forEach((group, index) => {
    if (!valid) return;
    if (group.kind === 'other') {
      aligned.push({ text: group.text, reading: null });
      return;
    }
    if (group.kind === 'kana') {
      const marker = toHiragana(group.text);
      if (!normalizedReading.startsWith(marker, cursor)) {
        valid = false;
        return;
      }
      cursor += marker.length;
      aligned.push({ text: group.text, reading: null });
      return;
    }

    const nextKana = groups.slice(index + 1).find((candidate) => candidate.kind === 'kana');
    if (!nextKana) {
      const assigned = reading.slice(cursor);
      if (!assigned) valid = false;
      else {
        aligned.push({ text: group.text, reading: assigned });
        cursor = reading.length;
      }
      return;
    }
    const marker = toHiragana(nextKana.text);
    const markerIndex = normalizedReading.indexOf(marker, cursor);
    const assigned = markerIndex >= cursor ? reading.slice(cursor, markerIndex) : '';
    if (!assigned) valid = false;
    else {
      aligned.push({ text: group.text, reading: assigned });
      cursor = markerIndex;
    }
  });

  if (valid && cursor === reading.length) return aligned;

  const kanjiGroups = groups.filter((group) => group.kind === 'kanji');
  if (kanjiGroups.length === 1) {
    return groups.map((group) => ({
      text: group.text,
      reading: group.kind === 'kanji' ? reading : null,
    }));
  }
  return groups.map((group) => ({ text: group.text, reading: null }));
});
