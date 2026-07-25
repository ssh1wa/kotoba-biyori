import React, { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { BookOpen, Brain, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, List, MapPin, MessageCircleMore, PanelLeft, RotateCcw, Send, Shuffle, Sparkles } from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
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
import { CasualThreadsModal } from '../components/CasualThreadsModal';
import { ErrorNotice, PrimaryButton, SectionTitle } from '../components/Ui';
import { courseTracks, getCourseTrack, getTrackLesson, getTrackLessons } from '../data/courseTracks';
import { getFeatureProfile, requestJson } from '../lib/deepseek';
import { ActivityRecord, ActivityRecordDraft } from '../lib/activity';
import { enforceLearnerNameInReply, enforceLearnerNameReading } from '../lib/learnerName';
import {
  casualRoleplaySystemPrompt,
  casualMemoryPrompt,
  initialRoleplayPrompt,
  randomTopicPrompt,
  roleplaySystemPrompt,
} from '../lib/prompts';
import { CasualThread, CourseSnapshot, loadRoleplay, normalizeMioFacts, RoleplayState, saveRoleplay } from '../lib/storage';
import { AppColors, radii, useThemedStyles } from '../theme';
import { AppSettings, CasualMemoryDigest, RoleplayMessage, RoleplayReply } from '../types';

type ChatMode = 'course' | 'casual';

const plainJapanese = (segments: RoleplayReply['japanese']) =>
  segments?.map((segment) => segment.text).join('') || '';

const structuredHistory = (message: RoleplayMessage, progress: number) => JSON.stringify(message.details || {
  japanese: message.japanese || [],
  englishHelp: message.englishHelp || '',
  newWords: [],
  grammar: [],
  suggestedReplies: [],
  lessonProgress: progress,
});

const mergeMioFacts = (existing: string[], incoming?: string[]) =>
  normalizeMioFacts([...(existing || []), ...(incoming || [])]);

const deviceTimeContext = () => {
  const now = new Date();
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  let timeZone = 'device local timezone';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
  } catch {
    // The UTC offset still provides usable local-time context on older devices.
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${weekdays[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} UTC${offsetSign}${offsetHours}:${offsetRemainder} (${timeZone})`;
};

const newCasualThread = (): CasualThread => {
  const now = Date.now();
  return {
    id: `casual-${now}-${Math.random().toString(36).slice(2, 6)}`,
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
};

export function RoleplayScreen({ settings, records, restoreRecord, onNeedSettings, onActivity, onOpenRecord, onDeleteRecord, onDeleteRecords, onRecordRestored, onDeleteCasualThreadRecords }: { settings: AppSettings; records: ActivityRecord[]; restoreRecord: ActivityRecord | null; onNeedSettings: () => void; onActivity: (record: ActivityRecordDraft, earnsCheckIn: boolean) => void; onOpenRecord: (record: ActivityRecord) => void; onDeleteRecord: (recordId: string) => void; onDeleteRecords: (recordIds: string[]) => void; onRecordRestored: () => void; onDeleteCasualThreadRecords: (threadId: string) => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [mode, setMode] = useState<ChatMode>('course');
  const initialThread = useRef(newCasualThread()).current;
  const [course, setCourse] = useState<RoleplayState>({ courseId: 'jlpt-original', courseStage: 'N5', lessonNumber: 1, progress: 0, messages: [], lessonProgress: {}, lessonSessions: {}, casualMessages: [], casualReplyDetails: null, casualThreads: [initialThread], activeCasualThreadId: initialThread.id, mioFacts: [], savedCourses: {} });
  const [roleplayHydrated, setRoleplayHydrated] = useState(false);
  const [replyDetails, setReplyDetails] = useState<RoleplayReply | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coursePanelOpen, setCoursePanelOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const memoryJobs = useRef(new Set<string>());

  useEffect(() => {
    loadRoleplay().then((saved) => {
      setCourse(saved);
      const key = `${saved.courseStage}:${saved.lessonNumber}`;
      setReplyDetails(saved.lessonSessions[key]?.replyDetails || [...saved.messages].reverse().find((message) => message.details)?.details || null);
      setRoleplayHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (roleplayHydrated) saveRoleplay(course);
  }, [course, roleplayHydrated]);

  const track = getCourseTrack(course.courseId);
  const stage = track.stages.includes(course.courseStage) ? course.courseStage : track.stages[0];
  const lesson = getTrackLesson(track, stage, course.lessonNumber);
  const lessonKey = `${stage}:${lesson.number}`;
  const overallProgress = Math.round(
    Object.values(course.lessonProgress).reduce((sum, value) => sum + Math.max(0, Math.min(100, value)), 0)
      / Math.max(1, track.lessons.length),
  );
  const activeCasualThread = course.casualThreads.find((thread) => thread.id === course.activeCasualThreadId) || course.casualThreads[0] || initialThread;
  const sharedMemories = course.casualThreads.flatMap((thread) => thread.memories);
  const latestMoodThread = course.casualThreads.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const displayedReplyDetails = replyDetails
    ? enforceLearnerNameInReply(replyDetails, settings.learnerName, settings.learnerNameReading)
    : null;
  const displayedRecords = records
    .filter((record) => !(record.snapshot?.kind === 'roleplay' && record.snapshot.mode === 'casual'))
    .map((record) => ({
      ...record,
      resultJapanese: enforceLearnerNameReading(record.resultJapanese, settings.learnerName, settings.learnerNameReading),
    }));
  const currentMood = latestMoodThread?.replyDetails?.mood
    ? `${latestMoodThread.replyDetails.mood}: ${latestMoodThread.replyDetails.moodReason || 'reason not stated'}`
    : 'calm; no unresolved issue';
  const messages = mode === 'course' ? course.messages : activeCasualThread.messages;

  useEffect(() => {
    if (!restoreRecord || restoreRecord.type !== 'roleplay') return;
    const legacyMessages: RoleplayMessage[] = [
      ...(restoreRecord.sourceText ? [{ id: `${restoreRecord.id}-user`, role: 'user' as const, text: restoreRecord.sourceText, timestamp: restoreRecord.timestamp - 1 }] : []),
      ...(restoreRecord.resultJapanese?.length ? [{ id: `${restoreRecord.id}-mio`, role: 'mio' as const, japanese: restoreRecord.resultJapanese, englishHelp: restoreRecord.resultText, timestamp: restoreRecord.timestamp }] : []),
    ];
    const snapshot = restoreRecord.snapshot?.kind === 'roleplay' ? restoreRecord.snapshot : {
      kind: 'roleplay' as const,
      mode: 'casual' as const,
      messages: legacyMessages,
      replyDetails: null,
    };
    setMode(snapshot.mode);
    setReplyDetails(snapshot.replyDetails);
    setError('');
    onRecordRestored();
    if (snapshot.mode === 'casual') {
      setCourse((current) => {
        const threadId = snapshot.casualThreadId || current.activeCasualThreadId;
        const existing = current.casualThreads.find((thread) => thread.id === threadId);
        const restoredThread: CasualThread = {
          ...(existing || newCasualThread()),
          id: threadId,
          title: snapshot.casualThreadTitle || existing?.title || '恢复的聊天',
          messages: snapshot.messages,
          replyDetails: snapshot.replyDetails,
          updatedAt: restoreRecord.timestamp,
        };
        const casualThreads = existing
          ? current.casualThreads.map((thread) => thread.id === threadId ? restoredThread : thread)
          : [...current.casualThreads, restoredThread];
        return {
          ...current,
          casualThreads,
          activeCasualThreadId: threadId,
          casualMessages: snapshot.messages,
          casualReplyDetails: snapshot.replyDetails,
        };
      });
      return;
    }

    setCourse((current) => {
      const currentKey = `${current.courseStage}:${current.lessonNumber}`;
      const currentSessions = {
        ...current.lessonSessions,
        [currentKey]: {
          messages: current.messages,
          replyDetails: current.lessonSessions[currentKey]?.replyDetails || null,
          updatedAt: Date.now(),
        },
      };
      const savedCourses = {
        ...current.savedCourses,
        [current.courseId]: {
          courseStage: current.courseStage,
          lessonNumber: current.lessonNumber,
          progress: current.progress,
          messages: current.messages,
          lessonProgress: current.lessonProgress,
          lessonSessions: currentSessions,
        },
      };
      const targetId = snapshot.courseId || current.courseId;
      const targetTrack = getCourseTrack(targetId);
      const restored = targetId === current.courseId ? { ...current, lessonSessions: currentSessions } : savedCourses[targetId];
      const targetStage = snapshot.courseStage && targetTrack.stages.includes(snapshot.courseStage)
        ? snapshot.courseStage
        : restored?.courseStage || targetTrack.stages[0];
      const targetLesson = getTrackLesson(targetTrack, targetStage, snapshot.lessonNumber || restored?.lessonNumber || 1);
      const targetKey = `${targetStage}:${targetLesson.number}`;
      const targetProgress = snapshot.progress ?? restored?.lessonProgress?.[targetKey] ?? 0;
      const lessonSessions = {
        ...(restored?.lessonSessions || {}),
        [targetKey]: { messages: snapshot.messages, replyDetails: snapshot.replyDetails, updatedAt: restoreRecord.timestamp },
      };
      return {
        ...current,
        courseId: targetId,
        courseStage: targetStage,
        lessonNumber: targetLesson.number,
        progress: targetProgress,
        messages: snapshot.messages,
        lessonProgress: { ...(restored?.lessonProgress || {}), [targetKey]: targetProgress },
        lessonSessions,
        savedCourses,
      };
    });
  }, [restoreRecord]);

  const ensureKey = () => {
    if (getFeatureProfile(settings, 'roleplay').apiKey) return true;
    onNeedSettings();
    return false;
  };

  const updateCasualThread = (threadId: string, update: (thread: CasualThread) => CasualThread) =>
    setCourse((current) => {
      const casualThreads = current.casualThreads.map((thread) => thread.id === threadId ? update(thread) : thread);
      const active = casualThreads.find((thread) => thread.id === current.activeCasualThreadId) || casualThreads[0];
      return {
        ...current,
        casualThreads,
        activeCasualThreadId: active.id,
        casualMessages: active.messages,
        casualReplyDetails: active.replyDetails,
      };
    });

  const refreshCasualMemory = async (thread: CasualThread, nextMessages: RoleplayMessage[]) => {
    if (nextMessages.length < 10 || nextMessages.length - thread.summarizedMessageCount < 6 || memoryJobs.current.has(thread.id)) return;
    memoryJobs.current.add(thread.id);
    const transcript = nextMessages.slice(-24).map((message) => (
      `${message.role === 'mio' ? `Mio [${message.details?.mood || 'unspecified mood'}${message.details?.moodReason ? `; ${message.details.moodReason}` : ''}]` : 'Learner'}: ${message.text || plainJapanese(message.japanese || [])}`
    )).join('\n');
    try {
      const digest = await requestJson<CasualMemoryDigest>(settings, [
        { role: 'system', content: casualMemoryPrompt(thread.summary, thread.memories, course.mioFacts) },
        { role: 'user', content: transcript },
      ], 0.1, 'roleplay');
      updateCasualThread(thread.id, (current) => ({
        ...current,
        title: current.titleLocked ? current.title : digest.title?.trim() || current.title,
        summary: digest.summary?.trim() || current.summary,
        memories: Array.isArray(digest.memories) ? digest.memories.filter(Boolean).slice(0, 12) : current.memories,
        summarizedMessageCount: nextMessages.length,
      }));
      if (Array.isArray(digest.mioFacts)) {
        setCourse((current) => ({ ...current, mioFacts: normalizeMioFacts(digest.mioFacts) }));
      }
    } catch {
      // Memory refresh is best-effort and must never interrupt the visible chat.
    } finally {
      memoryJobs.current.delete(thread.id);
    }
  };

  const setCourseMessages = (next: RoleplayMessage[], progress?: number, details?: RoleplayReply | null) =>
    setCourse((current) => {
      const nextProgress = progress ?? current.progress;
      const nextDetails = details === undefined
        ? current.lessonSessions[lessonKey]?.replyDetails || null
        : details;
      return {
        ...current,
        messages: next,
        progress: nextProgress,
        lessonSessions: {
          ...current.lessonSessions,
          [lessonKey]: { messages: next, replyDetails: nextDetails, updatedAt: Date.now() },
        },
        lessonProgress: progress === undefined
          ? current.lessonProgress
          : { ...current.lessonProgress, [lessonKey]: Math.max(current.lessonProgress[lessonKey] || 0, nextProgress) },
      };
    });

  const askMio = async (userText: string, isStarter = false) => {
    if (!ensureKey() || loading) return;
    setLoading(true);
    setError('');

    const requestThread = activeCasualThread;
    const currentMessages = mode === 'course' ? course.messages : requestThread.messages;
    const userMessage: RoleplayMessage | null = isStarter ? null : {
      id: `u-${Date.now()}`,
      role: 'user',
      text: userText,
      timestamp: Date.now(),
    };
    const visibleMessages = userMessage ? [...currentMessages, userMessage] : currentMessages;
    if (mode === 'course') setCourseMessages(visibleMessages);
    else updateCasualThread(requestThread.id, (thread) => ({ ...thread, messages: visibleMessages, updatedAt: Date.now() }));
    setInput('');

    const system = mode === 'course'
      ? roleplaySystemPrompt(lesson, settings.learnerName, settings.learnerNameReading, settings.learnerProfile, settings.level, track, settings.roleplayEnglishHelp)
      : casualRoleplaySystemPrompt(settings.learnerName, settings.learnerNameReading, settings.learnerProfile, settings.level, {
          currentSummary: requestThread.summary,
          sharedMemory: sharedMemories,
          mioFacts: course.mioFacts,
          currentTime: deviceTimeContext(),
          currentMood,
          showEnglishHelp: settings.roleplayEnglishHelp,
        });
    const history = currentMessages.slice(-10).map((message) => ({
      role: message.role === 'mio' ? ('assistant' as const) : ('user' as const),
      content: message.role === 'mio'
        ? structuredHistory(message, course.progress)
        : message.text || plainJapanese(message.japanese || []),
    }));

    try {
      const data = await requestJson<RoleplayReply>(settings, [
        { role: 'system', content: system },
        ...history,
        { role: 'user', content: userText },
      ], mode === 'casual' ? 0.85 : 0.65, 'roleplay');
      const normalizedData = enforceLearnerNameInReply(data, settings.learnerName, settings.learnerNameReading);
      const mioMessage: RoleplayMessage = {
        id: `m-${Date.now()}`,
        role: 'mio',
        japanese: normalizedData.japanese,
        englishHelp: normalizedData.englishHelp,
        details: normalizedData,
        timestamp: Date.now(),
      };
      const next = [...visibleMessages, mioMessage];
      const nextProgress = Math.max(course.progress, normalizedData.lessonProgress || 0);
      const firstTopic = (isStarter ? plainJapanese(normalizedData.japanese) : userText).trim().slice(0, 14);
      const generatedTitle = normalizedData.conversationTitle?.trim().slice(0, 24);
      const casualThreadTitle = requestThread.title === '新的聊天'
        ? generatedTitle || firstTopic || requestThread.title
        : requestThread.title;
      if (mode === 'course') setCourseMessages(next, nextProgress, normalizedData);
      else {
        updateCasualThread(requestThread.id, (thread) => ({
          ...thread,
          title: casualThreadTitle,
          messages: next,
          replyDetails: normalizedData,
          updatedAt: Date.now(),
        }));
        if (normalizedData.newMioFacts?.length) {
          setCourse((current) => ({ ...current, mioFacts: mergeMioFacts(current.mioFacts, normalizedData.newMioFacts) }));
        }
        void refreshCasualMemory(requestThread, next);
      }
      setReplyDetails(normalizedData);
      onActivity({
        type: 'roleplay',
        sourceText: isStarter ? (mode === 'course' ? `开始：${lesson.scene}` : '美绪主动发起话题') : userText,
        resultJapanese: normalizedData.japanese,
        resultText: settings.roleplayEnglishHelp ? normalizedData.englishHelp || undefined : undefined,
        note: mode === 'course' ? `${track.shortTitle} · 第 ${lesson.number} 课` : '随聊',
        snapshot: {
          kind: 'roleplay',
          mode,
          courseId: mode === 'course' ? track.id : undefined,
          courseStage: mode === 'course' ? stage : undefined,
          lessonNumber: mode === 'course' ? lesson.number : undefined,
          progress: mode === 'course' ? nextProgress : undefined,
          casualThreadId: mode === 'casual' ? requestThread.id : undefined,
          casualThreadTitle: mode === 'casual' ? casualThreadTitle : undefined,
          messages: next,
          replyDetails: normalizedData,
        },
      }, true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : '美绪暂时没有回复，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const startCourse = () => askMio(initialRoleplayPrompt(lesson), true);
  const startTopic = () => askMio(randomTopicPrompt, true);

  const createCasualChat = () => {
    const thread = newCasualThread();
    setCourse((current) => ({
      ...current,
      casualThreads: [...current.casualThreads, thread],
      activeCasualThreadId: thread.id,
      casualMessages: [],
      casualReplyDetails: null,
    }));
    setMode('casual');
    setReplyDetails(null);
    setThreadsOpen(false);
  };

  const selectCasualChat = (threadId: string) => {
    const selected = course.casualThreads.find((thread) => thread.id === threadId);
    if (!selected) return;
    setCourse((current) => ({
      ...current,
      activeCasualThreadId: threadId,
      casualMessages: selected.messages,
      casualReplyDetails: selected.replyDetails,
    }));
    setMode('casual');
    setReplyDetails(selected.replyDetails);
    setThreadsOpen(false);
  };

  const deleteCasualChat = (threadId: string) => {
    let nextThreads = course.casualThreads.filter((thread) => thread.id !== threadId);
    if (!nextThreads.length) nextThreads = [newCasualThread()];
    const nextActive = course.activeCasualThreadId === threadId
      ? nextThreads.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]
      : nextThreads.find((thread) => thread.id === course.activeCasualThreadId) || nextThreads[0];
    setReplyDetails(nextActive.replyDetails);
    setCourse((current) => ({
      ...current,
      casualThreads: nextThreads,
      activeCasualThreadId: nextActive.id,
      casualMessages: nextActive.messages,
      casualReplyDetails: nextActive.replyDetails,
    }));
    onDeleteCasualThreadRecords(threadId);
  };

  const changeStage = (nextStage: string) => {
    const firstLesson = getTrackLesson(track, nextStage, 1);
    const key = `${nextStage}:${firstLesson.number}`;
    const session = course.lessonSessions[key];
    setCourse((current) => ({ ...current, courseStage: nextStage, lessonNumber: firstLesson.number, progress: current.lessonProgress[key] || 0, messages: session?.messages || [] }));
    setReplyDetails(session?.replyDetails || null);
  };

  const changeTrack = (courseId: string) => {
    const nextTrack = getCourseTrack(courseId);
    const restoredPreview = courseId === course.courseId ? course : course.savedCourses[courseId];
    const previewStage = restoredPreview?.courseStage || nextTrack.stages[0];
    const previewLesson = restoredPreview?.lessonNumber || 1;
    const previewSession = restoredPreview?.lessonSessions?.[`${previewStage}:${previewLesson}`];
    setReplyDetails(previewSession?.replyDetails || null);
    setCourse((current) => {
      const currentSnapshot: CourseSnapshot = {
        courseStage: stage,
        lessonNumber: current.lessonNumber,
        progress: current.progress,
        messages: current.messages,
        lessonProgress: current.lessonProgress,
        lessonSessions: current.lessonSessions,
      };
      const savedCourses = { ...current.savedCourses, [current.courseId]: currentSnapshot };
      const restored = savedCourses[courseId] || {
        courseStage: nextTrack.stages[0], lessonNumber: 1, progress: 0, messages: [], lessonProgress: {}, lessonSessions: {},
      };
      const restoredKey = `${restored.courseStage}:${restored.lessonNumber}`;
      const restoredSession = restored.lessonSessions?.[restoredKey];
      return {
        ...current,
        courseId,
        ...restored,
        lessonSessions: restored.lessonSessions || {},
        messages: restoredSession?.messages || restored.messages || [],
        savedCourses,
      };
    });
    setMaterialOpen(false);
    setLessonPickerOpen(false);
  };

  const changeLesson = (delta: number) => {
    const max = getTrackLessons(track, stage).length;
    const next = Math.min(max, Math.max(1, course.lessonNumber + delta));
    if (next === course.lessonNumber) return;
    const nextLesson = getTrackLesson(track, stage, next);
    const key = `${stage}:${nextLesson.number}`;
    const session = course.lessonSessions[key];
    setCourse((current) => ({ ...current, lessonNumber: next, progress: current.lessonProgress[key] || 0, messages: session?.messages || [] }));
    setReplyDetails(session?.replyDetails || null);
  };

  const selectLesson = (lessonNumber: number) => {
    const nextLesson = getTrackLesson(track, stage, lessonNumber);
    const key = `${stage}:${nextLesson.number}`;
    const session = course.lessonSessions[key];
    setCourse((current) => ({
      ...current,
      lessonNumber: nextLesson.number,
      progress: current.lessonProgress[key] || 0,
      messages: session?.messages || [],
    }));
    setReplyDetails(session?.replyDetails || null);
    setLessonPickerOpen(false);
  };

  const renameCasualChat = (threadId: string, title: string) => {
    updateCasualThread(threadId, (thread) => ({ ...thread, title, titleLocked: true, updatedAt: Date.now() }));
  };

  const courseHistoryIds = (lessonOnly: boolean) => records.filter((record) => {
    const snapshot = record.snapshot?.kind === 'roleplay' ? record.snapshot : null;
    if (!snapshot || snapshot.mode !== 'course') return false;
    if ((snapshot.courseId || 'jlpt-original') !== track.id) return false;
    if (!lessonOnly) return true;
    return snapshot.courseStage === stage && snapshot.lessonNumber === lesson.number;
  }).map((record) => record.id);

  const resetLesson = () => Alert.alert(
    '重学本课？',
    `将清零第 ${lesson.number} 课“${lesson.title}”的进度和对话，并删除本课历史记录。打卡日期和其他课次不受影响。`,
    [
      { text: '取消', style: 'cancel' },
      {
        text: '重置本课', style: 'destructive', onPress: () => {
          setCourse((current) => {
            const lessonProgress = { ...current.lessonProgress };
            const lessonSessions = { ...current.lessonSessions };
            delete lessonProgress[lessonKey];
            delete lessonSessions[lessonKey];
            return { ...current, progress: 0, messages: [], lessonProgress, lessonSessions };
          });
          setReplyDetails(null);
          setLessonPickerOpen(false);
          onDeleteRecords(courseHistoryIds(true));
        },
      },
    ],
  );

  const resetTrack = () => Alert.alert(
    '重置教材进度？',
    `将清零“${track.title}”的全部课次、对话和学习百分比，并删除这套教材的课程历史。打卡日期不会删除。`,
    [
      { text: '取消', style: 'cancel' },
      {
        text: '重置进度', style: 'destructive', onPress: () => {
          setCourse((current) => ({ ...current, courseStage: track.stages[0], lessonNumber: 1, progress: 0, messages: [], lessonProgress: {}, lessonSessions: {} }));
          setReplyDetails(null);
          onDeleteRecords(courseHistoryIds(false));
        },
      },
    ],
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}>
      <View style={styles.top}>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>み</Text></View>
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.name}>美緒</Text>
              <View style={styles.online} />
            </View>
            <Text style={styles.status}>{mode === 'course' ? '课程对话' : '同じクラス · オンライン'}</Text>
          </View>
        </View>
        <View style={styles.topActions}>
          {mode === 'course' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="打开课程记录" onPress={() => setHistoryOpen(true)} style={styles.historyIcon}>
              <Clock3 size={17} color={colors.charcoal} />
              <Text style={styles.historyText}>记录</Text>
            </Pressable>
          ) : null}
          <View style={styles.modeTabs}>
            <Pressable onPress={() => { setMode('course'); setReplyDetails(course.lessonSessions[lessonKey]?.replyDetails || null); }} style={[styles.modeTab, mode === 'course' && styles.modeActive]}>
              <Text style={[styles.modeText, mode === 'course' && styles.modeTextActive]}>课程</Text>
            </Pressable>
            <Pressable onPress={() => { setMode('casual'); setReplyDetails(activeCasualThread.replyDetails); }} style={[styles.modeTab, mode === 'casual' && styles.modeActive]}>
              <Text style={[styles.modeText, mode === 'casual' && styles.modeTextActive]}>随聊</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {mode === 'course' ? (
        <View style={styles.courseBar}>
          <View style={styles.courseSummary}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={coursePanelOpen ? '收起课程选择' : '展开课程选择'}
              onPress={() => { setCoursePanelOpen((current) => !current); setMaterialOpen(false); }}
              style={styles.summaryMain}
            >
              <View style={styles.trackIcon}><BookOpen size={16} color={colors.accent} /></View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle} numberOfLines={1}>{coursePanelOpen ? track.shortTitle : `${track.shortTitle} · 第 ${lesson.number} 课`}</Text>
                <Text style={styles.summaryMeta} numberOfLines={1}>{coursePanelOpen ? stage : `${lesson.title} · ${lesson.scene}`}</Text>
              </View>
              {!coursePanelOpen ? <Text style={styles.summaryProgress}>{course.progress}%</Text> : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="选择教材"
              onPress={() => { setMaterialOpen((current) => !current); setCoursePanelOpen(false); setLessonPickerOpen(false); }}
              style={[styles.changeMaterialButton, materialOpen && styles.changeMaterialActive]}
            >
              <Text style={[styles.changeMaterialText, materialOpen && styles.changeMaterialTextActive]}>换教材</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={coursePanelOpen ? '收起课程选择' : '展开课程选择'}
              onPress={() => { setCoursePanelOpen((current) => !current); setMaterialOpen(false); }}
              style={styles.courseExpandButton}
            >
              {coursePanelOpen ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />}
            </Pressable>
          </View>

          {materialOpen ? (
            <ScrollView style={styles.pickerScroll} nestedScrollEnabled contentContainerStyle={styles.pickerContent}>
              {courseTracks.map((item) => {
                const selected = item.id === track.id;
                return (
                  <Pressable key={item.id} onPress={() => changeTrack(item.id)} style={[styles.pickerRow, selected && styles.pickerRowSelected]}>
                    <View style={styles.pickerCopy}>
                      <Text style={[styles.pickerTitle, selected && styles.pickerTitleSelected]} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.pickerMeta} numberOfLines={1}>{item.subtitle}</Text>
                    </View>
                    {selected ? <Check size={16} color={colors.green} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {coursePanelOpen ? (
            <View style={styles.coursePanel}>
              <View style={styles.overallRow}>
                <Text style={styles.overallLabel}>教材进度</Text>
                <View style={styles.overallTrack}><View style={[styles.overallFill, { width: `${overallProgress}%` }]} /></View>
                <Text style={styles.overallValue}>{overallProgress}%</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="重学并重置本教材进度" onPress={resetTrack} style={styles.resetButton}>
                  <RotateCcw size={15} color={colors.muted} />
                </Pressable>
              </View>

              <View style={styles.lessonControl}>
                <Pressable accessibilityLabel="上一课" onPress={() => changeLesson(-1)} style={styles.arrowButton}><ChevronLeft size={19} color={colors.charcoal} /></Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLessonPickerOpen((current) => !current)}
                  style={styles.lessonSelector}
                >
                  <View style={styles.lessonSelectorCopy}>
                    <Text style={styles.accordionLabel}>课次</Text>
                    <Text style={styles.accordionValue} numberOfLines={1}>第 {lesson.number} 课 · {lesson.title}</Text>
                  </View>
                  <View style={[styles.lessonListIcon, lessonPickerOpen && styles.lessonListIconActive]}>
                    <List size={16} color={lessonPickerOpen ? colors.onPrimary : colors.muted} />
                  </View>
                </Pressable>
                <Pressable accessibilityLabel="下一课" onPress={() => changeLesson(1)} style={styles.arrowButton}><ChevronRight size={19} color={colors.charcoal} /></Pressable>
              </View>
              {lessonPickerOpen ? (
                <View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.levels}>
                    {track.stages.map((item) => (
                      <Pressable key={item} onPress={() => changeStage(item)} style={[styles.levelChip, stage === item && styles.levelChipActive]}>
                        <Text style={[styles.levelChipText, stage === item && styles.levelChipTextActive]}>{item}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <ScrollView style={styles.pickerScroll} nestedScrollEnabled contentContainerStyle={styles.pickerContent}>
                    {getTrackLessons(track, stage).map((item) => {
                      const selected = item.number === lesson.number;
                      const itemKey = `${stage}:${item.number}`;
                      return (
                        <Pressable key={item.number} onPress={() => selectLesson(item.number)} style={[styles.pickerRow, selected && styles.pickerRowSelected]}>
                          <Text style={styles.lessonIndex}>{item.number}</Text>
                          <Text style={[styles.pickerTitle, styles.lessonPickerTitle, selected && styles.pickerTitleSelected]} numberOfLines={1}>{item.title}</Text>
                          <Text style={styles.lessonProgressValue}>{course.lessonProgress[itemKey] || 0}%</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.lessonProgressRow}>
                <Text style={styles.lessonProgressLabel}>本课</Text>
                <View style={styles.lessonProgressTrack}><View style={[styles.progressFill, { width: `${course.progress}%` }]} /></View>
                <Text style={styles.lessonProgressText}>{course.progress}%</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="重置本课进度" onPress={resetLesson} style={styles.resetLessonButton}>
                  <RotateCcw size={13} color={colors.muted} />
                  <Text style={styles.resetLessonText}>重置本课</Text>
                </Pressable>
              </View>
              <View style={styles.sceneRow}>
                <MapPin size={15} color={colors.accent} />
                <View style={styles.sceneCopy}>
                  <Text style={styles.sceneLabel}>本课场景</Text>
                  <Text style={styles.sceneText}>{lesson.scene}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.casualBar}>
          <Pressable accessibilityRole="button" onPress={() => setThreadsOpen(true)} style={styles.threadSelector}>
            <PanelLeft size={18} color={colors.green} />
            <View style={styles.threadSelectorCopy}>
              <Text style={styles.activeThreadTitle} numberOfLines={1}>{activeCasualThread.title}</Text>
              <View style={styles.memoryMeta}>
                <Brain size={11} color={colors.muted} />
                <Text style={styles.activeThreadMeta}>{sharedMemories.length} 条共享记忆</Text>
              </View>
            </View>
          </Pressable>
          <Pressable onPress={startTopic} disabled={loading} style={styles.topicButton}>
            <Shuffle size={16} color={colors.accent} />
            <Text style={styles.topicLabel}>让美绪找话题</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.chatEmpty}>
            <MessageCircleMore size={31} color={colors.accent} />
            <Text style={styles.emptyTitle}>{mode === 'course' ? lesson.scene : '今日は何を話そう？'}</Text>
            <Text style={styles.emptyText}>
              {mode === 'course'
                ? `本课会自然练习：${lesson.grammar.join('、')}`
                : '你可以直接说任何话题，也可以让美绪先开口。'}
            </Text>
            <PrimaryButton
              label={mode === 'course' ? '开始本课对话' : '让美绪先说'}
              icon={mode === 'course' ? Sparkles : Shuffle}
              onPress={mode === 'course' ? startCourse : startTopic}
              loading={loading}
              style={styles.startButton}
            />
          </View>
        ) : null}

        {messages.map((message) => (
          <View key={message.id} style={[styles.messageRow, message.role === 'user' && styles.messageRowUser]}>
            {message.role === 'mio' ? (
              <View style={styles.mioBubble}>
                <RubyText segments={enforceLearnerNameReading(message.japanese, settings.learnerName, settings.learnerNameReading)} size={18} />
                {settings.roleplayEnglishHelp && message.englishHelp ? <Text selectable style={styles.englishHelp}>{message.englishHelp}</Text> : null}
              </View>
            ) : (
              <View style={styles.userBubble}><Text selectable style={styles.userText}>{message.text}</Text></View>
            )}
          </View>
        ))}

        {loading && messages.length > 0 ? (
          <View style={styles.typing}><ActivityIndicator size="small" color={colors.accent} /><Text style={styles.typingText}>美緒が入力中…</Text></View>
        ) : null}

        {error ? <ErrorNotice message={error} /> : null}

        {displayedReplyDetails && !loading ? (
          <View style={styles.learningNotes}>
            {displayedReplyDetails.newWords?.length ? (
              <View style={styles.noteSection}>
                <SectionTitle eyebrow="PICK UP">这句话里的词</SectionTitle>
                {displayedReplyDetails.newWords.map((word, index) => (
                  <View key={`${word.surface}-${index}`} style={styles.noteRow}>
                    <Text selectable style={styles.noteWord}>{word.surface}{word.reading ? ` · ${word.reading}` : ''}</Text>
                    <Text selectable style={styles.noteMeaning}>{word.meaning}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {displayedReplyDetails.grammar?.slice(0, 1).map((item, index) => (
              <View key={`${item.pattern}-${index}`} style={styles.grammarNote}>
                <Text selectable style={styles.grammarPattern}>{item.pattern}</Text>
                <Text selectable style={styles.grammarEnglish}>{item.explanation}</Text>
              </View>
            ))}
            {displayedReplyDetails.suggestedReplies?.length ? (
              <View style={styles.suggestions}>
                <Text style={styles.suggestionLabel}>不知道怎么回？</Text>
                {displayedReplyDetails.suggestedReplies.map((suggestion, index) => {
                  const text = suggestion.japanese.map((part) => part.text).join('');
                  return (
                    <Pressable key={index} onPress={() => setInput(text)} style={styles.suggestion}>
                      <RubyText segments={suggestion.japanese} size={15} />
                      <Text selectable style={styles.suggestionMeaning}>{suggestion.meaning}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="美緒にメッセージ…"
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={600}
          style={styles.input}
        />
        <Pressable accessibilityLabel="发送消息" onPress={() => askMio(input.trim())} disabled={!input.trim() || loading} style={[styles.sendButton, (!input.trim() || loading) && styles.sendDisabled]}>
          <Send size={19} color={colors.onPrimary} />
        </Pressable>
      </View>
      <FeatureHistoryModal
        visible={historyOpen}
        kind="roleplay"
        records={displayedRecords}
        onSelect={(record) => { setHistoryOpen(false); onOpenRecord(record); }}
        onDelete={onDeleteRecord}
        onClose={() => setHistoryOpen(false)}
      />
      <CasualThreadsModal
        visible={threadsOpen}
        threads={course.casualThreads}
        activeId={course.activeCasualThreadId}
        onSelect={selectCasualChat}
        onCreate={createCasualChat}
        onDelete={deleteCasualChat}
        onRename={renameCasualChat}
        onClose={() => setThreadsOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 41, height: 41, borderRadius: 21, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accent, fontSize: 19, fontWeight: '800', letterSpacing: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: 0 },
  online: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  status: { color: colors.muted, fontSize: 10, marginTop: 1, letterSpacing: 0 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  historyIcon: { height: 38, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  historyText: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0 },
  modeTabs: { flexDirection: 'row', backgroundColor: colors.segment, padding: 3, borderRadius: radii.md },
  modeTab: { minWidth: 50, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  modeActive: { backgroundColor: colors.surface },
  modeText: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  modeTextActive: { color: colors.ink },
  courseBar: { backgroundColor: colors.sunken, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  courseSummary: { minHeight: 56, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryMain: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9 },
  trackIcon: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  summaryTitle: { color: colors.ink, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  summaryMeta: { color: colors.muted, fontSize: 9, letterSpacing: 0 },
  summaryProgress: { color: colors.green, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  changeMaterialButton: { height: 30, minWidth: 48, paddingHorizontal: 7, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  changeMaterialActive: { backgroundColor: colors.ink },
  changeMaterialText: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  changeMaterialTextActive: { color: colors.onPrimary },
  courseExpandButton: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  coursePanel: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingBottom: 6 },
  overallRow: { height: 30, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 7 },
  overallLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0 },
  overallTrack: { flex: 1, height: 4, backgroundColor: colors.track, borderRadius: 2, overflow: 'hidden' },
  overallFill: { height: 4, backgroundColor: colors.green, borderRadius: 2 },
  overallValue: { width: 31, color: colors.green, fontSize: 9, fontWeight: '800', textAlign: 'right', letterSpacing: 0 },
  resetButton: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' },
  accordionLabel: { width: 32, color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  accordionValue: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  pickerScroll: { maxHeight: 188, marginHorizontal: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  pickerContent: { paddingVertical: 4 },
  pickerRow: { minHeight: 48, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  pickerRowSelected: { backgroundColor: colors.greenSoft },
  pickerCopy: { flex: 1, minWidth: 0, gap: 2 },
  pickerTitle: { color: colors.charcoal, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  pickerTitleSelected: { color: colors.ink, fontWeight: '800' },
  pickerMeta: { color: colors.muted, fontSize: 9, letterSpacing: 0 },
  levels: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  levelChip: { minWidth: 42, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  levelChipActive: { backgroundColor: colors.ink },
  levelChipText: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  levelChipTextActive: { color: colors.onPrimary },
  lessonIndex: { width: 24, color: colors.accent, fontSize: 10, fontWeight: '800', textAlign: 'center', letterSpacing: 0 },
  lessonPickerTitle: { flex: 1, minWidth: 0 },
  lessonProgressValue: { width: 34, color: colors.muted, fontSize: 9, textAlign: 'right', letterSpacing: 0 },
  lessonControl: { minHeight: 46, marginHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center' },
  lessonSelector: { flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 7 },
  lessonSelectorCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lessonListIcon: { width: 27, height: 27, borderRadius: 6, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  lessonListIconActive: { backgroundColor: colors.accent },
  arrowButton: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  lessonProgressRow: { height: 32, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 7 },
  lessonProgressLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0 },
  lessonProgressTrack: { flex: 1, height: 4, backgroundColor: colors.track, borderRadius: 2, overflow: 'hidden' },
  lessonProgressText: { width: 30, color: colors.accent, fontSize: 9, fontWeight: '800', textAlign: 'right', letterSpacing: 0 },
  resetLessonButton: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  resetLessonText: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0 },
  progressFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  sceneRow: { minHeight: 47, marginHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sceneCopy: { flex: 1, gap: 2 },
  sceneLabel: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0 },
  sceneText: { color: colors.charcoal, fontSize: 11, lineHeight: 16, letterSpacing: 0 },
  casualBar: { minHeight: 62, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: colors.sunken, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  threadSelector: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7 },
  threadSelectorCopy: { flex: 1, minWidth: 0, gap: 2 },
  activeThreadTitle: { color: colors.ink, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  memoryMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  activeThreadMeta: { color: colors.muted, fontSize: 9, letterSpacing: 0 },
  topicButton: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6 },
  topicLabel: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  chat: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 24, gap: 13 },
  chatEmpty: { minHeight: 310, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 22 },
  emptyTitle: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: '800', textAlign: 'center', letterSpacing: 0 },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', letterSpacing: 0 },
  startButton: { alignSelf: 'stretch', marginTop: 8 },
  messageRow: { alignItems: 'flex-start' },
  messageRowUser: { alignItems: 'flex-end' },
  mioBubble: { maxWidth: '88%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, borderTopLeftRadius: 2, padding: 12, gap: 7 },
  userBubble: { maxWidth: '84%', backgroundColor: colors.ink, borderRadius: radii.md, borderTopRightRadius: 2, paddingVertical: 10, paddingHorizontal: 13 },
  userText: { color: colors.onPrimary, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  englishHelp: { color: colors.muted, fontSize: 11, lineHeight: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 6, letterSpacing: 0 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  typingText: { color: colors.muted, fontSize: 11, letterSpacing: 0 },
  learningNotes: { marginTop: 5, borderTopWidth: 1, borderColor: colors.line, paddingTop: 16, gap: 15 },
  noteSection: { gap: 7 },
  noteRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  noteWord: { color: colors.ink, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  noteMeaning: { flex: 1, color: colors.muted, fontSize: 12, textAlign: 'right', letterSpacing: 0 },
  grammarNote: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 11, gap: 4 },
  grammarPattern: { color: colors.ink, fontSize: 14, fontWeight: '800', letterSpacing: 0 },
  grammarEnglish: { color: colors.muted, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  suggestions: { gap: 7 },
  suggestionLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  suggestion: { backgroundColor: colors.raised, borderRadius: 6, padding: 10, gap: 4 },
  suggestionMeaning: { color: colors.muted, fontSize: 10, letterSpacing: 0 },
  composer: { paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.paper, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 43, maxHeight: 96, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  sendButton: { width: 43, height: 43, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.35 },
});
