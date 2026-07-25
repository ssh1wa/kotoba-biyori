import React, { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Clock3, Eye, Lightbulb, RefreshCw, Send, Target } from 'lucide-react-native';
import {
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
import { practiceGradePrompt, practiceQuestionPrompt, tutorFollowUpPrompt } from '../lib/prompts';
import { buildPracticePersonalization, isRecentPracticeDuplicate } from '../lib/practicePersonalization';
import { AppColors, radii, useThemedStyles } from '../theme';
import { AppSettings, PracticeDirection, PracticeGrade, PracticeQuestion, TutorFollowUpReply, TutorFollowUpTurn } from '../types';

export function PracticeScreen({ settings, records, learningRecords, restoreRecord, onNeedSettings, onActivity, onUpdateRecord, onOpenRecord, onDeleteRecord, onRecordRestored }: { settings: AppSettings; records: ActivityRecord[]; learningRecords: ActivityRecord[]; restoreRecord: ActivityRecord | null; onNeedSettings: () => void; onActivity: (record: ActivityRecordDraft, earnsCheckIn: boolean) => ActivityRecord; onUpdateRecord: (recordId: string, patch: Partial<ActivityRecord>) => void; onOpenRecord: (record: ActivityRecord) => void; onDeleteRecord: (recordId: string) => void; onRecordRestored: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [direction, setDirection] = useState<PracticeDirection>('zh-ja');
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [grade, setGrade] = useState<PracticeGrade | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState<'question' | 'grade' | null>(null);
  const [error, setError] = useState('');
  const [followUps, setFollowUps] = useState<TutorFollowUpTurn[]>([]);
  const [followUpsOpen, setFollowUpsOpen] = useState(true);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (!restoreRecord || restoreRecord.type !== 'practice') return;
    const snapshot = restoreRecord.snapshot?.kind === 'practice' ? restoreRecord.snapshot : null;
    const legacyDirection: PracticeDirection = restoreRecord.resultJapanese?.length ? 'zh-ja' : 'ja-zh';
    const restoredQuestion: PracticeQuestion = snapshot?.question || {
      id: restoreRecord.id,
      direction: legacyDirection,
      level: settings.level,
      sourceText: restoreRecord.sourceText,
      sourceJapanese: restoreRecord.sourceJapanese || [],
      focus: restoreRecord.note || '旧版练习记录',
      hint: '',
      referenceChinese: restoreRecord.resultText || '',
      referenceJapanese: restoreRecord.resultJapanese || [],
      answerNote: '这条记录来自旧版本，只保留了题目、回答和参考答案。',
    };
    const restoredGrade: PracticeGrade | null = snapshot?.grade || (typeof restoreRecord.score === 'number' ? {
      score: restoreRecord.score,
      verdict: restoreRecord.score >= 90 ? 'excellent' : restoreRecord.score >= 70 ? 'good' : 'retry',
      feedback: '旧版记录未保存完整评分说明。',
      strengths: [],
      corrections: [],
      correctChinese: restoreRecord.resultText,
      correctJapanese: restoreRecord.resultJapanese,
      grammarTip: restoredQuestion.answerNote,
    } : null);
    setDirection(snapshot?.direction || legacyDirection);
    setQuestion(restoredQuestion);
    setAnswer(snapshot?.answer || restoreRecord.userAnswer || '');
    setGrade(restoredGrade);
    setRevealed(snapshot?.revealed ?? !restoredGrade);
    setFollowUps(snapshot?.followUps || []);
    setFollowUpsOpen(false);
    setFollowUpInput('');
    setActiveRecordId(restoreRecord.id);
    setShowHint(false);
    setError('');
    onRecordRestored();
  }, [restoreRecord]);

  const ensureKey = () => {
    if (getFeatureProfile(settings, 'practice').apiKey) return true;
    onNeedSettings();
    return false;
  };

  const newQuestion = async (nextDirection = direction) => {
    if (!ensureKey()) return;
    setLoading('question');
    setError('');
    setGrade(null);
    setRevealed(false);
    setAnswer('');
    setShowHint(false);
    setFollowUps([]);
    setFollowUpsOpen(true);
    setFollowUpInput('');
    setActiveRecordId(null);
    try {
      const personalization = settings.personalizedPractice
        ? buildPracticePersonalization(learningRecords, nextDirection)
        : undefined;
      let data = await requestJson<PracticeQuestion>(settings, [
        { role: 'system', content: practiceQuestionPrompt(nextDirection, settings.level, personalization) },
        { role: 'user', content: 'Create one new exercise now. Return JSON.' },
      ], 0.85, 'practice');
      if (personalization && isRecentPracticeDuplicate(data.sourceText, personalization)) {
        data = await requestJson<PracticeQuestion>(settings, [
          { role: 'system', content: practiceQuestionPrompt(nextDirection, settings.level, personalization) },
          { role: 'user', content: `The first draft repeated a recent sentence: ${data.sourceText}. Create a genuinely different exercise and situation now. Return JSON.` },
        ], 0.9, 'practice');
      }
      setQuestion({ ...data, direction: nextDirection });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      setError(err instanceof Error ? err.message : '出题失败，请重试。');
    } finally {
      setLoading(null);
    }
  };

  const switchDirection = (next: PracticeDirection) => {
    setDirection(next);
    setQuestion(null);
    setGrade(null);
    setRevealed(false);
    setAnswer('');
    setFollowUps([]);
    setFollowUpsOpen(true);
    setFollowUpInput('');
    setActiveRecordId(null);
  };

  const submit = async () => {
    if (!question || !answer.trim() || !ensureKey()) return;
    setLoading('grade');
    setError('');
    try {
      const data = await requestJson<PracticeGrade>(settings, [
        { role: 'system', content: practiceGradePrompt(question.direction) },
        { role: 'user', content: JSON.stringify({ question, learnerAnswer: answer.trim() }) },
      ], 0.2, 'practice');
      setGrade(data);
      const record = onActivity({
        type: 'practice',
        sourceText: question.sourceText,
        sourceJapanese: question.direction === 'ja-zh' ? question.sourceJapanese : undefined,
        userAnswer: answer.trim(),
        resultText: question.direction === 'ja-zh' ? data.correctChinese : undefined,
        resultJapanese: question.direction === 'zh-ja' ? data.correctJapanese : undefined,
        score: data.score,
        note: question.focus,
        snapshot: { kind: 'practice', direction: question.direction, question, answer: answer.trim(), grade: data, revealed: false, followUps: [] },
      }, true);
      setActiveRecordId(record.id);
      Haptics.notificationAsync(data.score >= 70 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : '评分失败，请重试。');
    } finally {
      setLoading(null);
    }
  };

  const revealAnswer = () => {
    if (!question) return;
    setRevealed(true);
    const record = onActivity({
      type: 'practice',
      sourceText: question.sourceText,
      sourceJapanese: question.direction === 'ja-zh' ? question.sourceJapanese : undefined,
      userAnswer: answer.trim() || undefined,
      resultText: question.direction === 'ja-zh' ? question.referenceChinese : undefined,
      resultJapanese: question.direction === 'zh-ja' ? question.referenceJapanese : undefined,
      note: `${question.focus} · 直接查看答案`,
      snapshot: { kind: 'practice', direction: question.direction, question, answer: answer.trim(), grade: null, revealed: true, followUps: [] },
    }, true);
    setActiveRecordId(record.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const askFollowUp = async () => {
    const followUpQuestion = followUpInput.trim();
    if (!followUpQuestion || !question || (!grade && !revealed) || followUpLoading || !ensureKey()) return;
    setFollowUpLoading(true);
    setError('');
    try {
      const reply = await requestJson<TutorFollowUpReply>(settings, [
        { role: 'system', content: tutorFollowUpPrompt('practice') },
        {
          role: 'user',
          content: JSON.stringify({
            exercise: question,
            learnerAnswer: answer.trim(),
            grade,
            answerWasRevealed: revealed,
            previousFollowUps: followUps.slice(-6).map((turn) => ({ question: turn.question, answer: turn.answer })),
            question: followUpQuestion,
          }),
        },
      ], 0.25, 'practice');
      const next: TutorFollowUpTurn[] = [...followUps, {
        id: `practice-follow-up-${Date.now()}`,
        question: followUpQuestion,
        answer: reply.answer || '没有得到有效讲解，请换一种问法。',
        examples: Array.isArray(reply.examples) ? reply.examples : [],
        timestamp: Date.now(),
      }];
      setFollowUps(next);
      setFollowUpInput('');
      if (activeRecordId) {
        onUpdateRecord(activeRecordId, {
          snapshot: { kind: 'practice', direction: question.direction, question, answer: answer.trim(), grade, revealed, followUps: next },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '追问失败，请重试。');
    } finally {
      setFollowUpLoading(false);
    }
  };

  const scoreColor = grade && grade.score >= 90 ? colors.green : grade && grade.score >= 70 ? colors.amber : colors.accent;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.kicker}>一句一练</Text>
          <Text style={styles.title}>先自己想，再看答案</Text>
        </View>

        <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(true)} style={styles.historyButton}>
          <Clock3 size={17} color={colors.charcoal} />
          <Text style={styles.historyLabel}>练习记录</Text>
          <Text style={styles.historyCount}>{records.length}</Text>
        </Pressable>

        <View style={styles.segmented}>
          {(['zh-ja', 'ja-zh'] as PracticeDirection[]).map((item) => {
            const selected = direction === item;
            return (
              <Pressable key={item} onPress={() => switchDirection(item)} style={[styles.segment, selected && styles.segmentActive]}>
                <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{item === 'zh-ja' ? '中 → 日' : '日 → 中'}</Text>
              </Pressable>
            );
          })}
        </View>

        {!question ? (
          <View style={styles.empty}>
            <View style={styles.targetWrap}><Target size={27} color={colors.accent} /></View>
            <Text style={styles.emptyTitle}>{settings.level} 难度</Text>
            <Text style={styles.emptyText}>每题聚焦一个日常语法点，答案不要求和范文一字不差。</Text>
            <PrimaryButton label="生成一道题" icon={RefreshCw} onPress={() => newQuestion()} loading={loading === 'question'} style={styles.fullButton} />
          </View>
        ) : (
          <>
            <View style={styles.questionBlock}>
              <View style={styles.questionMeta}>
                <Text style={styles.number}>QUESTION</Text>
                <Text style={styles.level}>{question.level || settings.level}</Text>
              </View>
              {question.direction === 'ja-zh' && question.sourceJapanese?.length ? (
                <RubyText segments={question.sourceJapanese} size={25} />
              ) : (
                <Text selectable style={styles.questionText}>{question.sourceText}</Text>
              )}
              <View style={styles.focusRow}>
                <Target size={15} color={colors.accent} />
                <Text selectable style={styles.focus}>{question.focus}</Text>
              </View>
            </View>

            {!grade && !revealed ? (
              <View style={styles.answerArea}>
                <TextInput
                  value={answer}
                  onChangeText={setAnswer}
                  placeholder={direction === 'zh-ja' ? '输入你的日文翻译' : '输入你的中文翻译'}
                  placeholderTextColor={colors.placeholder}
                  multiline
                  textAlignVertical="top"
                  style={styles.answerInput}
                />
                <View style={styles.answerTools}>
                  <Pressable onPress={() => setShowHint(!showHint)} style={styles.hintButton}>
                    <Lightbulb size={17} color={colors.amber} />
                    <Text style={styles.hintLabel}>{showHint ? '收起提示' : '给点提示'}</Text>
                  </Pressable>
                  <Pressable onPress={revealAnswer} style={styles.revealButton}>
                    <Eye size={17} color={colors.charcoal} />
                    <Text style={styles.revealLabel}>直接看答案</Text>
                  </Pressable>
                </View>
                {showHint ? <Text selectable style={styles.hint}>{question.hint}</Text> : null}
                <PrimaryButton label="提交评分" icon={Send} onPress={submit} loading={loading === 'grade'} disabled={!answer.trim()} />
              </View>
            ) : (
              <View style={styles.gradeArea}>
                {answer.trim() ? (
                  <View style={styles.yourAnswer}>
                    <Text style={styles.yourAnswerLabel}>你的翻译</Text>
                    <Text selectable style={styles.yourAnswerText}>{answer.trim()}</Text>
                  </View>
                ) : null}
                {grade ? (
                  <View style={styles.scoreRow}>
                    <Text style={[styles.score, { color: scoreColor }]}>{Math.max(0, Math.min(100, Math.round(grade.score)))}</Text>
                    <View style={styles.scoreCopy}>
                      <Text style={styles.verdict}>{grade.verdict === 'excellent' ? '表达很自然' : grade.verdict === 'good' ? '基本正确' : '再调整一下'}</Text>
                      <Text selectable style={styles.feedback}>{grade.feedback}</Text>
                    </View>
                  </View>
                ) : null}

                {grade?.strengths?.length ? (
                  <View style={styles.feedbackSection}>
                    <SectionTitle eyebrow="GOOD">做对了</SectionTitle>
                    {grade.strengths.map((item, index) => <Text selectable key={index} style={styles.feedbackLine}>· {item}</Text>)}
                  </View>
                ) : null}
                {grade?.corrections?.length ? (
                  <View style={styles.feedbackSection}>
                    <SectionTitle eyebrow="FIX">可以改进</SectionTitle>
                    {grade.corrections.map((item, index) => <Text selectable key={index} style={styles.feedbackLine}>· {item}</Text>)}
                  </View>
                ) : null}

                {!grade || grade.score < 90 ? (
                  <View style={styles.reference}>
                    <Text style={styles.referenceLabel}>参考答案</Text>
                    {direction === 'zh-ja' && (grade?.correctJapanese?.length || question.referenceJapanese?.length) ? (
                      <RubyText segments={grade?.correctJapanese?.length ? grade.correctJapanese : question.referenceJapanese} size={21} />
                    ) : (
                      <Text selectable style={styles.referenceText}>{grade?.correctChinese || question.referenceChinese}</Text>
                    )}
                  </View>
                ) : null}

                <View style={styles.tip}>
                  <Lightbulb size={17} color={colors.amber} />
                  <Text selectable style={styles.tipText}>{grade?.grammarTip || question.answerNote}</Text>
                </View>
                <TutorFollowUpPanel
                  turns={followUps}
                  open={followUpsOpen}
                  input={followUpInput}
                  loading={followUpLoading}
                  onToggle={() => setFollowUpsOpen((current) => !current)}
                  onChangeInput={setFollowUpInput}
                  onSubmit={askFollowUp}
                />
                <PrimaryButton label="下一题" icon={RefreshCw} onPress={() => newQuestion()} loading={loading === 'question'} />
              </View>
            )}
          </>
        )}

        {error ? <ErrorNotice message={error} /> : null}
      </ScrollView>
      <FeatureHistoryModal
        visible={historyOpen}
        kind="practice"
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
  content: { padding: 20, paddingBottom: 36, gap: 20 },
  intro: { paddingTop: 6, gap: 4 },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  title: { color: colors.ink, fontSize: 29, lineHeight: 36, fontWeight: '800', letterSpacing: 0 },
  historyButton: { height: 46, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 9 },
  historyLabel: { flex: 1, color: colors.charcoal, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  historyCount: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  segmented: { height: 44, padding: 3, flexDirection: 'row', borderRadius: radii.md, backgroundColor: colors.segment },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  segmentTextActive: { color: colors.ink },
  empty: { minHeight: 330, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  targetWrap: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', letterSpacing: 0 },
  emptyText: { color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 20, letterSpacing: 0 },
  fullButton: { alignSelf: 'stretch', marginTop: 10 },
  questionBlock: { paddingVertical: 20, borderTopWidth: 2, borderBottomWidth: 1, borderColor: colors.ink, gap: 16 },
  questionMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  level: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  questionText: { color: colors.ink, fontSize: 23, lineHeight: 33, fontWeight: '600', letterSpacing: 0 },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  focus: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  answerArea: { gap: 12 },
  answerInput: { minHeight: 120, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14, color: colors.ink, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  answerTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hintButton: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  hintLabel: { color: colors.amber, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  revealButton: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  revealLabel: { color: colors.charcoal, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  hint: { color: colors.charcoal, fontSize: 13, lineHeight: 20, backgroundColor: colors.amberSoft, padding: 12, borderRadius: 6, letterSpacing: 0 },
  gradeArea: { gap: 20 },
  yourAnswer: { padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface, gap: 7 },
  yourAnswerLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  yourAnswerText: { color: colors.ink, fontSize: 17, lineHeight: 25, fontWeight: '600', letterSpacing: 0 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingBottom: 18, borderBottomWidth: 1, borderColor: colors.line },
  score: { fontSize: 58, lineHeight: 64, fontWeight: '800', letterSpacing: 0 },
  scoreCopy: { flex: 1, gap: 5 },
  verdict: { color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: 0 },
  feedback: { color: colors.muted, fontSize: 13, lineHeight: 19, letterSpacing: 0 },
  feedbackSection: { gap: 7 },
  feedbackLine: { color: colors.charcoal, fontSize: 14, lineHeight: 21, letterSpacing: 0 },
  reference: { padding: 14, backgroundColor: colors.greenSoft, borderRadius: radii.md, gap: 10 },
  referenceLabel: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  referenceText: { color: colors.ink, fontSize: 18, lineHeight: 26, fontWeight: '600', letterSpacing: 0 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 13 },
  tipText: { flex: 1, color: colors.charcoal, fontSize: 13, lineHeight: 20, letterSpacing: 0 },
});
