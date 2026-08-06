import React, { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { ArrowDownUp, BookOpen, ChevronRight, Clock3, Send } from 'lucide-react-native';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RubyText } from '../components/RubyText';
import { FeatureHistoryModal } from '../components/FeatureHistoryModal';
import { TutorFollowUpPanel } from '../components/TutorFollowUpPanel';
import { ErrorNotice, PrimaryButton, SectionTitle } from '../components/Ui';
import { getFeatureProfile, requestJson } from '../lib/deepseek';
import { ActivityRecord, ActivityRecordDraft } from '../lib/activity';
import { translationSystemPrompt, tutorFollowUpPrompt } from '../lib/prompts';
import { AppColors, radii, useThemedStyles } from '../theme';
import { AppSettings, TranslationResult, TutorFollowUpReply, TutorFollowUpTurn } from '../types';

export function TranslateScreen({ settings, records, restoreRecord, seedText, seedId, seedResult, seedAutoSubmit, onSeedConsumed, onNeedSettings, onActivity, onUpdateRecord, onOpenRecord, onDeleteRecord, onRecordRestored }: { settings: AppSettings; records: ActivityRecord[]; restoreRecord: ActivityRecord | null; seedText?: string; seedId?: number; seedResult?: TranslationResult; seedAutoSubmit?: boolean; onSeedConsumed?: () => void; onNeedSettings: () => void; onActivity: (record: ActivityRecordDraft, earnsCheckIn: boolean) => ActivityRecord; onUpdateRecord: (recordId: string, patch: Partial<ActivityRecord>) => void; onOpenRecord: (record: ActivityRecord) => void; onDeleteRecord: (recordId: string) => void; onRecordRestored: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [followUps, setFollowUps] = useState<TutorFollowUpTurn[]>([]);
  const [followUpsOpen, setFollowUpsOpen] = useState(true);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;
  const recentRecords = records.slice(-5).reverse();

  useEffect(() => {
    if (!restoreRecord || restoreRecord.type !== 'translation') return;
    const snapshot = restoreRecord.snapshot?.kind === 'translation' ? restoreRecord.snapshot : null;
    setInput(snapshot?.input || restoreRecord.sourceText || '');
    setResult(snapshot?.result || {
      direction: restoreRecord.resultJapanese?.length ? 'zh-ja' : 'ja-zh',
      inputKind: 'sentence',
      translationJapanese: restoreRecord.resultJapanese || [],
      translationChinese: restoreRecord.resultText || '',
      naturalNote: restoreRecord.note || '',
      dictionaryEntries: [],
      words: [],
      grammar: [],
    });
    setFollowUps(snapshot?.followUps || []);
    setFollowUpsOpen(false);
    setFollowUpInput('');
    setActiveRecordId(restoreRecord.id);
    setError('');
    reveal.setValue(1);
    onRecordRestored();
  }, [restoreRecord, reveal]);

  const runTranslation = async (source: string) => {
    const query = source.trim();
    if (!query) return;
    if (!getFeatureProfile(settings, 'translation').apiKey) {
      onNeedSettings();
      return;
    }
    setLoading(true);
    setError('');
    setFollowUps([]);
    setFollowUpsOpen(true);
    setFollowUpInput('');
    setActiveRecordId(null);
    try {
      const data = await requestJson<TranslationResult & { japanese?: TranslationResult['translationJapanese']; chinese?: string }>(settings, [
        { role: 'system', content: translationSystemPrompt },
        { role: 'user', content: query },
      ], 0.25, 'translation');
      const compactSource = query.replace(/[\s，。！？、,.!?"“”'‘’]/g, '');
      const compactNote = String(data.naturalNote || '').replace(/[\s，。！？、,.!?"“”'‘’]/g, '');
      const safeNaturalNote = data.inputKind === 'word'
        || (compactSource.length >= 4 && compactNote.includes(compactSource))
        ? ''
        : data.naturalNote || '';
      const normalized: TranslationResult = {
        ...data,
        inputKind: data.inputKind || 'sentence',
        translationJapanese: data.direction === 'zh-ja' ? (data.translationJapanese || data.japanese || []) : [],
        translationChinese: data.direction === 'ja-zh' ? (data.translationChinese || data.chinese || '') : '',
        naturalNote: safeNaturalNote,
        dictionaryEntries: data.dictionaryEntries || [],
        words: data.words || [],
        grammar: data.grammar || [],
      };
      setResult(normalized);
      const record = onActivity({
        type: 'translation',
        sourceText: query,
        resultText: normalized.direction === 'ja-zh' ? normalized.translationChinese : undefined,
        resultJapanese: normalized.direction === 'zh-ja' ? normalized.translationJapanese : undefined,
        note: normalized.naturalNote || undefined,
        snapshot: { kind: 'translation', input: query, result: normalized, followUps: [] },
      }, false);
      setActiveRecordId(record.id);
      reveal.setValue(0);
      Animated.spring(reveal, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 170 }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻译失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const submit = () => { void runTranslation(input); };

  useEffect(() => {
    if (!seedId || !seedText?.trim()) return;
    const query = seedText.trim();
    setInput(query);
    setResult(seedResult || null);
    setFollowUps([]);
    setFollowUpsOpen(true);
    setFollowUpInput('');
    setActiveRecordId(null);
    setError('');
    if (seedResult) reveal.setValue(1);
    onSeedConsumed?.();
    if (!seedResult && seedAutoSubmit) void runTranslation(query);
  }, [seedId]);

  const askFollowUp = async () => {
    const question = followUpInput.trim();
    if (!question || !result || followUpLoading) return;
    if (!getFeatureProfile(settings, 'translation').apiKey) {
      onNeedSettings();
      return;
    }
    setFollowUpLoading(true);
    setError('');
    try {
      const reply = await requestJson<TutorFollowUpReply>(settings, [
        { role: 'system', content: tutorFollowUpPrompt('translation') },
        {
          role: 'user',
          content: JSON.stringify({
            source: input.trim(),
            translationResult: result,
            previousFollowUps: followUps.slice(-6).map((turn) => ({ question: turn.question, answer: turn.answer })),
            question,
          }),
        },
      ], 0.25, 'translation');
      const next: TutorFollowUpTurn[] = [...followUps, {
        id: `translation-follow-up-${Date.now()}`,
        question,
        answer: reply.answer || '没有得到有效讲解，请换一种问法。',
        examples: Array.isArray(reply.examples) ? reply.examples : [],
        timestamp: Date.now(),
      }];
      setFollowUps(next);
      setFollowUpInput('');
      if (activeRecordId) {
        onUpdateRecord(activeRecordId, {
          snapshot: { kind: 'translation', input: input.trim(), result, followUps: next },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '追问失败，请重试。');
    } finally {
      setFollowUpLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.kicker}>中日双向</Text>
          <Text style={styles.title}>翻译与词典</Text>
        </View>

        <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(true)} style={styles.historyButton}>
          <Clock3 size={17} color={colors.charcoal} />
          <Text style={styles.historyLabel}>查询记录</Text>
          <Text style={styles.historyCount}>{records.length}</Text>
        </Pressable>

        <View style={styles.composer}>
          <View style={styles.composerTop}>
            <ArrowDownUp size={17} color={colors.accent} />
            <Text style={styles.autoLabel}>中文 ⇄ 日本語</Text>
          </View>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="输入中文或日文句子、单词"
            placeholderTextColor={colors.placeholder}
            multiline
            textAlignVertical="top"
            style={styles.input}
          />
          <PrimaryButton label="翻译并拆解" icon={Send} onPress={submit} loading={loading} disabled={!input.trim()} />
        </View>

        {!result && !loading ? (
          <View style={styles.recent}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentLabel}>最近查询</Text>
              {records.length > 5 ? (
                <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(true)} hitSlop={8}>
                  <Text style={styles.viewAllLabel}>查看全部</Text>
                </Pressable>
              ) : null}
            </View>
            {recentRecords.length ? recentRecords.map((record) => (
              <Pressable
                key={record.id}
                accessibilityRole="button"
                accessibilityLabel={`打开查询记录：${record.sourceText}`}
                onPress={() => onOpenRecord(record)}
                style={({ pressed }) => [styles.recentRow, pressed && styles.recentRowPressed]}
              >
                <View style={styles.recentContent}>
                  <View style={styles.recentMeta}>
                    <Text style={styles.recentTime}>
                      {new Date(record.timestamp).toLocaleDateString()} · {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.recentSource} numberOfLines={1}>{record.sourceText}</Text>
                  {record.resultJapanese?.length ? <RubyText segments={record.resultJapanese} size={14} /> : null}
                  {record.resultText ? <Text style={styles.recentResult} numberOfLines={1}>{record.resultText}</Text> : null}
                </View>
                <ChevronRight size={17} color={colors.muted} />
              </Pressable>
            )) : (
              <View style={styles.recentEmpty}>
                <Clock3 size={20} color={colors.muted} />
                <Text style={styles.recentEmptyText}>查询过的句子和单词会显示在这里</Text>
              </View>
            )}
          </View>
        ) : null}

        {error ? <ErrorNotice message={error} /> : null}

        {result ? (
          <Animated.View style={[styles.result, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }] }>
            <View style={styles.translationBlock}>
              <Text style={styles.resultLabel}>{result.direction === 'zh-ja' ? '日语译文' : '中文译文'}</Text>
              {result.direction === 'zh-ja' ? (
                <RubyText segments={result.translationJapanese || []} size={24} />
              ) : (
                <Text selectable style={styles.chinese}>{result.translationChinese}</Text>
              )}
              {result.naturalNote ? <Text selectable style={styles.naturalNote}>{result.naturalNote}</Text> : null}
            </View>

            {result.inputKind === 'word' && result.dictionaryEntries?.length ? (
              <View style={styles.section}>
                <SectionTitle eyebrow="DICTIONARY">词典</SectionTitle>
                {result.dictionaryEntries.map((entry, index) => (
                  <View key={index} style={styles.dictionaryEntry}>
                    <RubyText segments={entry.japanese} size={22} />
                    <Text selectable style={styles.dictionaryPart}>{entry.partOfSpeech}</Text>
                    <Text selectable style={styles.dictionaryMeaning}>{entry.meanings.join('；')}</Text>
                    {entry.usage ? <Text selectable style={styles.explanation}>{entry.usage}</Text> : null}
                    {entry.examples?.map((example, exampleIndex) => (
                      <View key={exampleIndex} style={styles.exampleSentence}>
                        <RubyText segments={example.japanese} size={17} />
                        <Text selectable style={styles.exampleMeaning}>{example.chinese}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}

            {result.words?.length ? (
              <View style={styles.section}>
                <SectionTitle eyebrow="WORDS">词汇拆解</SectionTitle>
                <View style={styles.wordList}>
                  {result.words.map((word, index) => (
                    <View key={`${word.surface}-${index}`} style={styles.wordRow}>
                      <View style={styles.wordHead}>
                        <Text selectable style={styles.wordSurface}>{word.surface}</Text>
                        {word.reading ? <Text selectable style={styles.wordReading}>{word.reading}</Text> : null}
                      </View>
                      <View style={styles.wordMeaningWrap}>
                        <Text selectable style={styles.wordMeaning}>{word.meaning}</Text>
                        <Text selectable style={styles.part}>{word.partOfSpeech}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {result.grammar?.length ? (
              <View style={styles.section}>
                <SectionTitle eyebrow="GRAMMAR">语法说明</SectionTitle>
                {result.grammar.map((item, index) => (
                  <View key={`${item.pattern}-${index}`} style={styles.grammarItem}>
                    <View style={styles.grammarHeading}>
                      <BookOpen size={18} color={colors.accent} />
                      <Text selectable style={styles.pattern}>{item.pattern}</Text>
                    </View>
                    <Text selectable style={styles.meaning}>{item.meaning}</Text>
                    <Text selectable style={styles.explanation}>{item.explanation}</Text>
                    {item.example?.length ? (
                      <View style={styles.exampleSentence}>
                        <RubyText segments={item.example} size={17} />
                        {item.exampleMeaning ? <Text selectable style={styles.exampleMeaning}>{item.exampleMeaning}</Text> : null}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <TutorFollowUpPanel
              turns={followUps}
              open={followUpsOpen}
              input={followUpInput}
              loading={followUpLoading}
              onToggle={() => setFollowUpsOpen((current) => !current)}
              onChangeInput={setFollowUpInput}
              onSubmit={askFollowUp}
            />
          </Animated.View>
        ) : null}
      </ScrollView>
      <FeatureHistoryModal
        visible={historyOpen}
        kind="translation"
        records={records}
        onSelect={(record) => { setHistoryOpen(false); onOpenRecord(record); }}
        onDelete={onDeleteRecord}
        onClose={() => setHistoryOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 36, gap: 22 },
  intro: { paddingTop: 6, gap: 5 },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  title: { color: colors.ink, fontSize: 29, lineHeight: 36, fontWeight: '800', letterSpacing: 0 },
  historyButton: { height: 46, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 9 },
  historyLabel: { flex: 1, color: colors.charcoal, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  historyCount: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  composer: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, padding: 14, gap: 12 },
  composerTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  autoLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0 },
  input: { minHeight: 108, color: colors.ink, fontSize: 17, lineHeight: 25, padding: 0, letterSpacing: 0 },
  recent: { borderTopWidth: 1, borderTopColor: colors.line },
  recentHeader: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  viewAllLabel: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  recentRow: { minHeight: 66, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentRowPressed: { opacity: 0.55 },
  recentContent: { flex: 1, gap: 4 },
  recentMeta: { flexDirection: 'row', alignItems: 'center' },
  recentTime: { color: colors.muted, fontSize: 9, fontWeight: '600', letterSpacing: 0 },
  recentSource: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 0 },
  recentResult: { color: colors.muted, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  recentEmpty: { minHeight: 92, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 7 },
  recentEmptyText: { color: colors.muted, fontSize: 11, letterSpacing: 0 },
  result: { gap: 28 },
  translationBlock: { paddingVertical: 20, borderTopWidth: 2, borderBottomWidth: 1, borderColor: colors.ink, gap: 13 },
  resultLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  chinese: { color: colors.ink, fontSize: 20, lineHeight: 30, fontWeight: '600', letterSpacing: 0 },
  naturalNote: { color: colors.muted, fontSize: 13, lineHeight: 20, letterSpacing: 0 },
  section: { gap: 14 },
  dictionaryEntry: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 14, gap: 7 },
  dictionaryPart: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  dictionaryMeaning: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '700', letterSpacing: 0 },
  wordList: { borderTopWidth: 1, borderColor: colors.line },
  wordRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  wordHead: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  wordSurface: { color: colors.ink, fontSize: 17, fontWeight: '700', letterSpacing: 0 },
  wordReading: { color: colors.accent, fontSize: 11, letterSpacing: 0 },
  wordMeaningWrap: { alignItems: 'flex-end', gap: 2, flex: 1.15 },
  wordMeaning: { color: colors.charcoal, fontSize: 13, textAlign: 'right', letterSpacing: 0 },
  part: { color: colors.muted, fontSize: 10, letterSpacing: 0 },
  grammarItem: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 14, gap: 7 },
  grammarHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pattern: { color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: 0 },
  meaning: { color: colors.accent, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  explanation: { color: colors.charcoal, fontSize: 14, lineHeight: 22, letterSpacing: 0 },
  exampleSentence: { backgroundColor: colors.sunken, borderRadius: 6, padding: 12, gap: 6 },
  exampleMeaning: { color: colors.muted, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
});
