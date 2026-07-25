import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { CalendarCheck2, CalendarDays, CheckCircle2, Settings } from 'lucide-react-native';
import { Animated, Dimensions, Keyboard, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabs, TabKey } from './src/components/BottomTabs';
import { ActivityModal } from './src/components/ActivityModal';
import { SettingsModal } from './src/components/SettingsModal';
import { IconButton } from './src/components/Ui';
import {
  ActivityRecordDraft,
  ActivityRecord,
  addActivity,
  emptyActivityState,
  loadActivity,
  localDateKey,
  saveActivity,
} from './src/lib/activity';
import { exportBackup, importBackup } from './src/lib/backup';
import { getFeatureProfile, requestJson } from './src/lib/deepseek';
import { wordbookDefinitionPrompt } from './src/lib/prompts';
import { defaultSettings, loadSettings, saveSettings } from './src/lib/storage';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { RoleplayScreen } from './src/screens/RoleplayScreen';
import { TranslateScreen } from './src/screens/TranslateScreen';
import { WordbookScreen } from './src/screens/WordbookScreen';
import { AppColors, getThemeColors, ThemeContext } from './src/theme';
import { AppSettings, TranslationResult } from './src/types';
import { addWordbookEntry, loadWordbook, saveWordbook, WordbookDefinition, WordbookEntry } from './src/lib/wordbook';

function AppShell() {
  const [tab, setTab] = useState<TabKey>('translate');
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState(emptyActivityState);
  const [checkInToast, setCheckInToast] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);
  const [restoreRecord, setRestoreRecord] = useState<ActivityRecord | null>(null);
  const [wordbook, setWordbook] = useState<WordbookEntry[]>([]);
  const [translationSeed, setTranslationSeed] = useState<{ text: string; id: number; result?: TranslationResult; autoSubmit?: boolean } | null>(null);
  const [wordbookToast, setWordbookToast] = useState('');
  const [wordbookLoadingIds, setWordbookLoadingIds] = useState<Set<string>>(new Set());
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const activityRef = useRef(emptyActivityState);
  const wordbookRef = useRef<WordbookEntry[]>([]);
  const settingsRef = useRef(settings);
  const activitySaveQueue = useRef(Promise.resolve());
  const wordbookSaveQueue = useRef(Promise.resolve());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordbookToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const baselineWindowHeight = useRef(Dimensions.get('window').height);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardVisible(true);
      const currentHeight = Dimensions.get('window').height;
      const resizedHeight = Math.max(0, baselineWindowHeight.current - currentHeight);
      const uncoveredHeight = Math.max(0, event.endCoordinates.height - resizedHeight);
      setKeyboardInset(Math.ceil(uncoveredHeight));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardInset(0);
      setTimeout(() => { baselineWindowHeight.current = Dimensions.get('window').height; }, 80);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    loadSettings().then(setSettings);
    loadActivity().then((saved) => {
      activityRef.current = saved;
      setActivity(saved);
    });
    loadWordbook().then((saved) => {
      wordbookRef.current = saved;
      setWordbook(saved);
    });
    const handleSelectionUrl = (url: string | null) => {
      if (!url) return;
      const match = url.match(/^kotobabiyori:\/\/selection\/(query|add)(?:\?(.*))?$/i);
      const encodedText = match?.[2]?.match(/(?:^|&)text=([^&]*)/)?.[1];
      if (!match || !encodedText) return;
      const text = decodeURIComponent(encodedText.replace(/\+/g, ' ')).trim();
      if (!text) return;
      if (match[1].toLowerCase() === 'query') lookupText(text);
      else addToWordbook(text, 'selection');
    };
    Linking.getInitialURL().then(handleSelectionUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleSelectionUrl(url));
    Animated.timing(entrance, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (wordbookToastTimer.current) clearTimeout(wordbookToastTimer.current);
      subscription.remove();
    };
  }, [entrance]);

  function showWordbookToast(message: string) {
    setWordbookToast(message);
    if (wordbookToastTimer.current) clearTimeout(wordbookToastTimer.current);
    wordbookToastTimer.current = setTimeout(() => setWordbookToast(''), 2200);
  }

  function addToWordbook(text: string, source: WordbookEntry['source']) {
    const next = addWordbookEntry(wordbookRef.current, text, source);
    if (!next.added) {
      showWordbookToast('生词本中已有这条内容');
      return;
    }
    wordbookRef.current = next.entries;
    setWordbook(next.entries);
    wordbookSaveQueue.current = wordbookSaveQueue.current.then(() => saveWordbook(next.entries));
    showWordbookToast('已加入生词本');
    if (next.entry) void enrichWordbookEntry(next.entry);
  }

  function updateWordbookEntry(id: string, update: Partial<WordbookEntry>) {
    const next = wordbookRef.current.map((entry) => entry.id === id ? { ...entry, ...update } : entry);
    wordbookRef.current = next;
    setWordbook(next);
    wordbookSaveQueue.current = wordbookSaveQueue.current.then(() => saveWordbook(next));
  }

  async function enrichWordbookEntry(entry: WordbookEntry) {
    const currentSettings = settingsRef.current;
    if (!getFeatureProfile(currentSettings, 'translation').apiKey) {
      updateWordbookEntry(entry.id, { definitionError: '请先配置互译功能的 API，再点击重新获取释义。' });
      return;
    }
    setWordbookLoadingIds((current) => new Set(current).add(entry.id));
    updateWordbookEntry(entry.id, { definitionError: undefined });
    try {
      const definition = await requestJson<WordbookDefinition>(currentSettings, [
        { role: 'system', content: wordbookDefinitionPrompt },
        { role: 'user', content: entry.text },
      ], 0.2, 'translation');
      updateWordbookEntry(entry.id, {
        definition: {
          japanese: Array.isArray(definition.japanese) ? definition.japanese : [],
          meanings: Array.isArray(definition.meanings) ? definition.meanings : [],
          partOfSpeech: definition.partOfSpeech || '',
          usage: definition.usage || '',
          examples: Array.isArray(definition.examples) ? definition.examples : [],
        },
        definitionError: undefined,
      });
    } catch (error) {
      updateWordbookEntry(entry.id, { definitionError: error instanceof Error ? error.message : '释义生成失败，请重试。' });
    } finally {
      setWordbookLoadingIds((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  }

  function lookupText(text: string) {
    setTranslationSeed({ text, id: Date.now(), autoSubmit: true });
    changeTab('translate');
  }

  function lookupWordbookEntry(entry: WordbookEntry) {
    const definition = entry.definition;
    if (!definition) {
      lookupText(entry.text);
      return;
    }
    const japaneseSurface = definition.japanese.map((segment) => segment.text).join('');
    const compactInput = entry.text.replace(/\s+/g, '');
    const isJapanese = /[\u3040-\u30ff]/.test(entry.text) || japaneseSurface.replace(/\s+/g, '') === compactInput;
    const result: TranslationResult = {
      direction: isJapanese ? 'ja-zh' : 'zh-ja',
      inputKind: 'word',
      translationJapanese: isJapanese ? [] : definition.japanese,
      translationChinese: isJapanese ? definition.meanings.join('；') : '',
      naturalNote: '',
      dictionaryEntries: [definition],
      words: [],
      grammar: [],
    };
    setTranslationSeed({ text: entry.text, id: Date.now(), result });
    changeTab('translate');
  }

  const changeTab = (next: TabKey) => {
    setTab(next);
    entrance.setValue(0);
    Animated.timing(entrance, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  };

  const persistSettings = async (next: AppSettings) => {
    await saveSettings(next);
    setSettings(next);
    setSettingsOpen(false);
  };

  const activeFeature = tab === 'translate' || tab === 'wordbook' ? 'translation' : tab === 'practice' ? 'practice' : 'roleplay';
  const activeProvider = settings.featureProviders?.[activeFeature] || settings.provider;
  const activeProfile = settings[activeProvider];
  const providerLabel = activeProvider === 'gemini' ? 'Gemini' : 'OpenAI';
  const activeModel = activeProfile.models?.[activeFeature] || activeProfile.model;
  const checkedToday = activity.checkIns.includes(localDateKey());

  const recordActivity = (draft: ActivityRecordDraft, earnsCheckIn: boolean) => {
    const next = addActivity(activityRef.current, draft, earnsCheckIn);
    activityRef.current = next.state;
    setActivity(next.state);
    activitySaveQueue.current = activitySaveQueue.current.then(() => saveActivity(next.state));
    if (next.firstCheckInToday) {
      setCheckInToast(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setCheckInToast(false), 2200);
    }
    return next.record;
  };

  const updateActivityRecord = (recordId: string, patch: Partial<ActivityRecord>) => {
    const next = {
      ...activityRef.current,
      records: activityRef.current.records.map((record) => record.id === recordId ? { ...record, ...patch } : record),
    };
    activityRef.current = next;
    setActivity(next);
    activitySaveQueue.current = activitySaveQueue.current.then(() => saveActivity(next));
  };

  const restoreBackup = async () => {
    const restored = await importBackup();
    if (!restored) return false;
    activityRef.current = restored.activity;
    setActivity(restored.activity);
    wordbookRef.current = restored.wordbook;
    setWordbook(restored.wordbook);
    setSettings(restored.settings);
    setDataRevision((current) => current + 1);
    return true;
  };

  const openActivityRecord = (record: ActivityRecord) => {
    const nextTab: TabKey = record.type === 'translation' ? 'translate' : record.type === 'practice' ? 'practice' : 'roleplay';
    setRestoreRecord({ ...record });
    setActivityOpen(false);
    changeTab(nextTab);
  };

  const deleteCasualThreadRecords = (threadId: string) => {
    const next = {
      ...activityRef.current,
      records: activityRef.current.records.filter((record) => !(
        record.snapshot?.kind === 'roleplay'
        && record.snapshot.mode === 'casual'
        && record.snapshot.casualThreadId === threadId
      )),
    };
    activityRef.current = next;
    setActivity(next);
    activitySaveQueue.current = activitySaveQueue.current.then(() => saveActivity(next));
  };

  const deleteActivityRecords = (recordIds: string[]) => {
    if (!recordIds.length) return;
    const ids = new Set(recordIds);
    const next = {
      ...activityRef.current,
      records: activityRef.current.records.filter((record) => !ids.has(record.id)),
    };
    activityRef.current = next;
    setActivity(next);
    activitySaveQueue.current = activitySaveQueue.current.then(() => saveActivity(next));
  };

  const deleteActivityRecord = (recordId: string) => deleteActivityRecords([recordId]);

  const translationRecords = activity.records.filter((record) => record.type === 'translation');
  const practiceRecords = activity.records.filter((record) => record.type === 'practice');
  const roleplayRecords = activity.records.filter((record) => record.type === 'roleplay');
  const colors = getThemeColors(settings.theme);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ThemeContext.Provider value={colors}>
    <SafeAreaView style={[styles.safe, Platform.OS === 'android' && keyboardInset > 0 && { paddingBottom: keyboardInset }]} edges={['top', 'left', 'right']}>
      <StatusBar style={colors.statusBar} />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>ことば日和</Text>
          <View style={styles.connectionRow}>
            <View style={[styles.connectionDot, tab !== 'wordbook' && !activeProfile.apiKey && styles.connectionOff]} />
            <Text style={styles.connection}>{tab === 'wordbook' ? `本地 · ${wordbook.length} 个生词` : `${providerLabel} · ${activeModel}`}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon={checkedToday ? CalendarCheck2 : CalendarDays} label="打开学习日历" onPress={() => setActivityOpen(true)} />
          <IconButton icon={Settings} label="打开设置" onPress={() => setSettingsOpen(true)} />
        </View>
      </View>

      {checkInToast ? (
        <View pointerEvents="none" style={styles.toast}>
          <CheckCircle2 size={17} color={colors.onPrimary} />
          <Text style={styles.toastText}>今日已打卡</Text>
        </View>
      ) : null}
      {wordbookToast ? (
        <View pointerEvents="none" style={[styles.toast, styles.wordbookToast]}>
          <CheckCircle2 size={17} color={colors.onPrimary} />
          <Text style={styles.toastText}>{wordbookToast}</Text>
        </View>
      ) : null}

      <Animated.View style={[styles.workspace, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }] }>
        {tab === 'translate' ? <TranslateScreen settings={settings} records={translationRecords} restoreRecord={restoreRecord} seedText={translationSeed?.text} seedId={translationSeed?.id} seedResult={translationSeed?.result} seedAutoSubmit={translationSeed?.autoSubmit} onSeedConsumed={() => setTranslationSeed(null)} onNeedSettings={() => setSettingsOpen(true)} onActivity={recordActivity} onUpdateRecord={updateActivityRecord} onOpenRecord={openActivityRecord} onDeleteRecord={deleteActivityRecord} onRecordRestored={() => setRestoreRecord(null)} /> : null}
        {tab === 'practice' ? <PracticeScreen settings={settings} records={practiceRecords} learningRecords={activity.records} restoreRecord={restoreRecord} onNeedSettings={() => setSettingsOpen(true)} onActivity={recordActivity} onUpdateRecord={updateActivityRecord} onOpenRecord={openActivityRecord} onDeleteRecord={deleteActivityRecord} onRecordRestored={() => setRestoreRecord(null)} /> : null}
        {tab === 'roleplay' ? <RoleplayScreen key={`roleplay-${dataRevision}`} settings={settings} records={roleplayRecords} restoreRecord={restoreRecord} onNeedSettings={() => setSettingsOpen(true)} onActivity={recordActivity} onOpenRecord={openActivityRecord} onDeleteRecord={deleteActivityRecord} onDeleteRecords={deleteActivityRecords} onRecordRestored={() => setRestoreRecord(null)} onDeleteCasualThreadRecords={deleteCasualThreadRecords} /> : null}
        {tab === 'wordbook' ? <WordbookScreen entries={wordbook} loadingIds={wordbookLoadingIds} onAdd={(text) => addToWordbook(text, 'manual')} onDelete={(id) => { const next = wordbookRef.current.filter((entry) => entry.id !== id); wordbookRef.current = next; setWordbook(next); wordbookSaveQueue.current = wordbookSaveQueue.current.then(() => saveWordbook(next)); }} onDeleteMany={(ids) => { const targets = new Set(ids); const next = wordbookRef.current.filter((entry) => !targets.has(entry.id)); wordbookRef.current = next; setWordbook(next); wordbookSaveQueue.current = wordbookSaveQueue.current.then(() => saveWordbook(next)); }} onRefreshDefinition={(entry) => void enrichWordbookEntry(entry)} onLookup={lookupWordbookEntry} /> : null}
      </Animated.View>

      {!keyboardVisible ? <BottomTabs active={tab} onChange={changeTab} /> : null}
      <ActivityModal visible={activityOpen} activity={activity} onSelectRecord={openActivityRecord} onClose={() => setActivityOpen(false)} />
      <SettingsModal visible={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onSave={persistSettings} onExport={exportBackup} onImport={restoreBackup} onMioFactsSaved={() => setDataRevision((current) => current + 1)} />
    </SafeAreaView>
    </ThemeContext.Provider>
  );
}

export default function App() {
  return <SafeAreaProvider><AppShell /></SafeAreaProvider>;
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { height: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  brand: { color: colors.ink, fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: 0 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  connectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  connectionOff: { backgroundColor: colors.muted },
  connection: { maxWidth: 245, color: colors.muted, fontSize: 9, letterSpacing: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  toast: { position: 'absolute', zIndex: 20, top: 72, alignSelf: 'center', height: 38, borderRadius: 19, paddingHorizontal: 15, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', gap: 7 },
  toastText: { color: colors.onPrimary, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  wordbookToast: { backgroundColor: colors.charcoal },
  workspace: { flex: 1 },
});
