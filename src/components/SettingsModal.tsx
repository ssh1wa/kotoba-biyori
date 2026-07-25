import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  MessageCircleMore,
  Plus,
  PlugZap,
  RefreshCw,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { listAvailableModels, requestJson } from '../lib/deepseek';
import { loadRoleplay, MIO_FACT_MAX_LENGTH, normalizeMioFacts, updateMioFacts } from '../lib/storage';
import { AppColors, radii, themeOptions, useThemedStyles } from '../theme';
import { AppSettings, ModelFeature, Provider } from '../types';
import { Field, IconButton, PrimaryButton } from './Ui';

type SettingsSection = 'api' | 'personal' | 'mio';
type OperationStatus = { type: 'success' | 'error'; message: string } | null;

const levels: AppSettings['level'][] = ['入门', 'N5', 'N4', 'N3', 'N2', 'N1'];
const featureOptions: Array<{ key: ModelFeature; label: string }> = [
  { key: 'translation', label: '互译' },
  { key: 'practice', label: '练习' },
  { key: 'roleplay', label: '美绪' },
];
const sections = [
  { key: 'api' as const, label: 'API', icon: PlugZap },
  { key: 'personal' as const, label: '个人', icon: UserRound },
  { key: 'mio' as const, label: '美绪', icon: MessageCircleMore },
];

const normalizeSettings = (settings: AppSettings): AppSettings => {
  const cleanProfile = (profile: AppSettings['openai']) => {
    const fallback = profile.model.trim();
    const models = {
      translation: profile.models.translation.trim() || fallback,
      practice: profile.models.practice.trim() || fallback,
      roleplay: profile.models.roleplay.trim() || fallback,
    };
    return {
      ...profile,
      baseUrl: profile.baseUrl.trim().replace(/\/+$/, ''),
      model: models.translation,
      models,
    };
  };

  return {
    ...settings,
    learnerName: settings.learnerName.trim() || '同学',
    learnerNameReading: settings.learnerNameReading.trim(),
    learnerProfile: settings.learnerProfile.trim(),
    openai: cleanProfile(settings.openai),
    gemini: cleanProfile(settings.gemini),
  };
};

export function SettingsModal({
  visible,
  settings,
  onClose,
  onSave,
  onExport,
  onImport,
  onMioFactsSaved,
}: {
  visible: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  onExport: () => Promise<void>;
  onImport: () => Promise<boolean>;
  onMioFactsSaved: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [section, setSection] = useState<SettingsSection>('api');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<Partial<Record<Provider, string[]>>>({});
  const [modelChoicesFeature, setModelChoicesFeature] = useState<ModelFeature | null>(null);
  const [testStatus, setTestStatus] = useState<OperationStatus>(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  const [backupStatus, setBackupStatus] = useState<OperationStatus>(null);
  const [mioFacts, setMioFacts] = useState<string[]>([]);
  const [newMioFact, setNewMioFact] = useState('');
  const [mioFactsOpen, setMioFactsOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { colors, styles } = useThemedStyles(createStyles);

  useEffect(() => {
    setDraft(settings);
    setTestStatus(null);
    setBackupStatus(null);
    setModelChoicesFeature(null);
    if (visible) {
      loadRoleplay().then((roleplay) => setMioFacts(normalizeMioFacts(roleplay.mioFacts)));
      setNewMioFact('');
    }
  }, [settings, visible]);

  const save = async () => {
    setSaving(true);
    try {
      await updateMioFacts(mioFacts);
      onMioFactsSaved();
      await onSave(normalizeSettings(draft));
    } finally {
      setSaving(false);
    }
  };

  const addMioFact = () => {
    const next = normalizeMioFacts([...mioFacts, newMioFact]);
    if (next.length === mioFacts.length) return;
    setMioFacts(next);
    setNewMioFact('');
  };

  const editMioFact = (index: number, value: string) =>
    setMioFacts((current) => current.map((fact, factIndex) => factIndex === index ? value : fact));

  const deleteMioFact = (index: number) =>
    setMioFacts((current) => current.filter((_, factIndex) => factIndex !== index));

  const profile = draft[draft.provider];
  const setProfile = (next: Partial<typeof profile>) => {
    setTestStatus(null);
    setDraft((current) => ({
      ...current,
      [current.provider]: { ...current[current.provider], ...next },
    }));
  };

  const selectProvider = (provider: Provider) => {
    setTestStatus(null);
    setDraft((current) => ({ ...current, provider }));
  };

  const setFeatureProvider = (feature: ModelFeature, provider: Provider) =>
    setDraft((current) => ({
      ...current,
      featureProviders: { ...current.featureProviders, [feature]: provider },
    }));

  const setFeatureModel = (feature: ModelFeature, model: string) =>
    setDraft((current) => {
      const provider = current.featureProviders[feature];
      const target = current[provider];
      return {
        ...current,
        [provider]: {
          ...target,
          models: { ...target.models, [feature]: model },
        },
      };
    });

  const testConnection = async () => {
    const current = normalizeSettings(draft);
    const provider = current.provider;
    const currentProfile = current[provider];
    if (!currentProfile.apiKey.trim()) {
      setTestStatus({ type: 'error', message: '请先填写 API Key。' });
      return;
    }
    if (!currentProfile.baseUrl.trim()) {
      setTestStatus({ type: 'error', message: '请先填写 API Base URL。' });
      return;
    }
    if (!currentProfile.models.translation.trim()) {
      setTestStatus({ type: 'error', message: '请先填写互译功能使用的模型名称。' });
      return;
    }

    setTesting(true);
    setTestStatus(null);
    try {
      const testSettings: AppSettings = {
        ...current,
        featureProviders: { ...current.featureProviders, translation: provider },
      };
      const result = await requestJson<{ ok?: boolean }>(
        testSettings,
        [
          { role: 'system', content: 'Return valid JSON only.' },
          { role: 'user', content: 'Return exactly {"ok":true}.' },
        ],
        0,
        'translation',
      );
      if (result.ok !== true) throw new Error('接口已响应，但没有返回预期的 JSON。');
      setTestStatus({
        type: 'success',
        message: `${provider === 'gemini' ? 'Gemini' : 'OpenAI 兼容'} · ${currentProfile.models.translation} 连接成功`,
      });
    } catch (error) {
      setTestStatus({ type: 'error', message: error instanceof Error ? error.message : '连接失败，请检查接口配置。' });
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    const current = normalizeSettings(draft);
    setFetchingModels(true);
    setTestStatus(null);
    try {
      const models = await listAvailableModels(current, current.provider);
      setAvailableModels((saved) => ({ ...saved, [current.provider]: models }));
      setTestStatus({
        type: 'success',
        message: `已识别 ${models.length} 个可用模型，可在下方各功能中选择。`,
      });
    } catch (error) {
      setTestStatus({ type: 'error', message: error instanceof Error ? error.message : '获取模型列表失败。' });
    } finally {
      setFetchingModels(false);
    }
  };

  const runExport = async () => {
    setBackupBusy('export');
    setBackupStatus(null);
    try {
      await onExport();
      setBackupStatus({ type: 'success', message: '备份文件已交给系统分享面板。' });
    } catch (error) {
      setBackupStatus({ type: 'error', message: error instanceof Error ? error.message : '导出失败，请重试。' });
    } finally {
      setBackupBusy(null);
    }
  };

  const confirmImport = () => Alert.alert(
    '导入学习备份？',
    '当前历史、打卡日期和课程进度将替换为备份中的数据。API Key 不会被覆盖。',
    [
      { text: '取消', style: 'cancel' },
      {
        text: '选择备份文件',
        onPress: async () => {
          setBackupBusy('import');
          setBackupStatus(null);
          try {
            const imported = await onImport();
            if (imported) setBackupStatus({ type: 'success', message: '导入完成，学习数据已经恢复。' });
          } catch (error) {
            setBackupStatus({ type: 'error', message: error instanceof Error ? error.message : '导入失败，请检查备份文件。' });
          } finally {
            setBackupBusy(null);
          }
        },
      },
    ],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>设置与偏好</Text>
            <Text style={styles.title}>设置</Text>
          </View>
          <IconButton icon={X} label="关闭设置" onPress={onClose} />
        </View>

        <View style={styles.tabs}>
          {sections.map((item) => {
            const selected = section === item.key;
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setSection(item.key)}
                style={[styles.tab, selected && styles.tabSelected]}
              >
                <Icon size={17} color={selected ? colors.ink : colors.muted} />
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          key={section}
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {section === 'api' ? (
            <>
              <View style={styles.levelWrap}>
                <Text style={styles.fieldLabel}>编辑接口凭据</Text>
                <View style={styles.segmented}>
                  <Pressable onPress={() => selectProvider('openai')} style={[styles.provider, draft.provider === 'openai' && styles.levelSelected]}>
                    <Text style={[styles.levelText, draft.provider === 'openai' && styles.levelTextSelected]}>OpenAI 兼容</Text>
                  </Pressable>
                  <Pressable onPress={() => selectProvider('gemini')} style={[styles.provider, draft.provider === 'gemini' && styles.levelSelected]}>
                    <Text style={[styles.levelText, draft.provider === 'gemini' && styles.levelTextSelected]}>Gemini 原生</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.keyRow}>
                <Field
                  label={`${draft.provider === 'gemini' ? 'Gemini' : 'OpenAI 兼容'} API Key`}
                  value={profile.apiKey}
                  onChangeText={(apiKey) => setProfile({ apiKey })}
                  placeholder={draft.provider === 'gemini' ? 'AIza...' : 'sk-...'}
                  secureTextEntry={!showKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.flexField}
                />
                <Pressable accessibilityLabel={showKey ? '隐藏密钥' : '显示密钥'} onPress={() => setShowKey(!showKey)} style={styles.eyeButton}>
                  {showKey ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}
                </Pressable>
              </View>
              <Field
                label="API Base URL"
                value={profile.baseUrl}
                onChangeText={(baseUrl) => setProfile({ baseUrl })}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.apiActionRow}>
                <Pressable accessibilityRole="button" onPress={testConnection} disabled={testing || fetchingModels} style={({ pressed }) => [styles.testButton, pressed && styles.buttonPressed, (testing || fetchingModels) && styles.buttonDisabled]}>
                  {testing ? <ActivityIndicator size="small" color={colors.charcoal} /> : <PlugZap size={18} color={colors.charcoal} />}
                  <Text style={styles.testButtonText}>{testing ? '正在测试' : '测试连接'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={fetchModels} disabled={testing || fetchingModels} style={({ pressed }) => [styles.testButton, pressed && styles.buttonPressed, (testing || fetchingModels) && styles.buttonDisabled]}>
                  {fetchingModels ? <ActivityIndicator size="small" color={colors.charcoal} /> : <RefreshCw size={18} color={colors.charcoal} />}
                  <Text style={styles.testButtonText}>{fetchingModels ? '正在获取' : '获取模型'}</Text>
                </Pressable>
              </View>
              {testStatus ? <StatusLine status={testStatus} colors={colors} styles={styles} /> : null}

              <View style={styles.rule} />
              <View style={styles.modelHeading}>
                <Text style={styles.sectionTitle}>功能调用</Text>
                <Text style={styles.modelHint}>每项可独立选择接口与模型</Text>
              </View>
              <View style={styles.routeList}>
                {featureOptions.map((feature) => {
                  const selectedProvider = draft.featureProviders[feature.key];
                  const selectedProfile = draft[selectedProvider];
                  return (
                    <View key={feature.key} style={styles.route}>
                      <View style={styles.routeTop}>
                        <Text style={styles.routeLabel}>{feature.label}</Text>
                        <View style={styles.routeSegmented}>
                          <Pressable onPress={() => setFeatureProvider(feature.key, 'openai')} style={[styles.routeProvider, selectedProvider === 'openai' && styles.levelSelected]}>
                            <Text style={[styles.routeProviderText, selectedProvider === 'openai' && styles.levelTextSelected]}>OpenAI</Text>
                          </Pressable>
                          <Pressable onPress={() => setFeatureProvider(feature.key, 'gemini')} style={[styles.routeProvider, selectedProvider === 'gemini' && styles.levelSelected]}>
                            <Text style={[styles.routeProviderText, selectedProvider === 'gemini' && styles.levelTextSelected]}>Gemini</Text>
                          </Pressable>
                        </View>
                      </View>
                      <Field
                        label="模型名称"
                        value={selectedProfile.models[feature.key]}
                        onChangeText={(model) => setFeatureModel(feature.key, model)}
                        onFocus={feature.key === 'roleplay' ? () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 240) : undefined}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {availableModels[selectedProvider]?.length ? (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setModelChoicesFeature((current) => current === feature.key ? null : feature.key)}
                            style={styles.modelChoiceButton}
                          >
                            <Text style={styles.modelChoiceButtonText}>从 {availableModels[selectedProvider]!.length} 个可用模型中选择</Text>
                            {modelChoicesFeature === feature.key ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />}
                          </Pressable>
                          {modelChoicesFeature === feature.key ? (
                            <View style={styles.modelChoices}>
                              {availableModels[selectedProvider]!.slice(0, 40).map((model) => {
                                const selected = selectedProfile.models[feature.key] === model;
                                return (
                                  <Pressable
                                    key={model}
                                    onPress={() => { setFeatureModel(feature.key, model); setModelChoicesFeature(null); }}
                                    style={[styles.modelChoice, selected && styles.modelChoiceSelected]}
                                  >
                                    <Text numberOfLines={1} style={[styles.modelChoiceText, selected && styles.modelChoiceTextSelected]}>{model}</Text>
                                    {selected ? <Check size={15} color={colors.accent} /> : null}
                                  </Pressable>
                                );
                              })}
                              {availableModels[selectedProvider]!.length > 40 ? <Text style={styles.settingDescription}>列表较长，仅显示前 40 个；仍可手动输入其他模型名称。</Text> : null}
                            </View>
                          ) : null}
                        </>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              <View style={styles.note}>
                <Text style={styles.noteTitle}>接口说明</Text>
                <Text style={styles.noteText}>OpenAI 兼容接口可用于 DeepSeek，Gemini 使用原生 generateContent。两套凭据会分别保存。</Text>
              </View>
            </>
          ) : null}

          {section === 'personal' ? (
            <>
              <Field
                label="你的称呼"
                value={draft.learnerName}
                onChangeText={(learnerName) => setDraft((current) => ({ ...current, learnerName }))}
                placeholder="同学"
              />
              <Field
                label="称呼读音（选填）"
                value={draft.learnerNameReading}
                onChangeText={(learnerNameReading) => setDraft((current) => ({ ...current, learnerNameReading }))}
                placeholder="假名读音"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Field
                label="个人信息（选填）"
                value={draft.learnerProfile}
                onChangeText={(learnerProfile) => setDraft((current) => ({ ...current, learnerProfile }))}
                placeholder="例如：22岁，住在东京，喜欢电影和摄影"
                multiline
                maxLength={600}
                textAlignVertical="top"
                style={styles.learnerProfileInput}
              />
              <Text style={styles.settingDescription}>年龄、职业、居住地、兴趣等信息会提供给课程和随聊中的美绪。</Text>
              <View style={styles.levelWrap}>
                <Text style={styles.fieldLabel}>当前水平</Text>
                <View style={styles.segmented}>
                  {levels.map((level) => {
                    const selected = draft.level === level;
                    return (
                      <Pressable key={level} onPress={() => setDraft((current) => ({ ...current, level }))} style={[styles.level, selected && styles.levelSelected]}>
                        <Text style={[styles.levelText, selected && styles.levelTextSelected]}>{level}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.settingDescription}>统一用于互译练习、课程对话和随聊的难度。</Text>
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchTitle}>个性化练习</Text>
                  <Text style={styles.settingDescription}>结合错题和课程中学过的语法、生词出题，并减少近期重复。</Text>
                </View>
                <Switch
                  value={draft.personalizedPractice}
                  onValueChange={(personalizedPractice) => setDraft((current) => ({ ...current, personalizedPractice }))}
                  trackColor={{ false: colors.track, true: colors.green }}
                  thumbColor={colors.surface}
                />
              </View>

              <View style={styles.rule} />
              <View style={styles.themeHeading}>
                <Text style={styles.sectionTitle}>颜色主题</Text>
                <Text style={styles.modelHint}>保存后应用全局配色</Text>
              </View>
              <View style={styles.themeList}>
                {themeOptions.map((theme) => {
                  const selected = draft.theme === theme.id;
                  return (
                    <Pressable
                      key={theme.id}
                      accessibilityRole="button"
                      accessibilityLabel={`选择${theme.name}主题`}
                      onPress={() => setDraft((current) => ({ ...current, theme: theme.id }))}
                      style={[styles.themeOption, selected && styles.themeSelected]}
                    >
                      <View style={styles.swatches}>
                        {theme.swatches.map((swatch) => <View key={swatch} style={[styles.swatch, { backgroundColor: swatch }]} />)}
                      </View>
                      <View style={styles.themeCopy}>
                        <Text style={styles.themeName}>{theme.name}</Text>
                        <Text style={styles.themeDescription}>{theme.description}</Text>
                      </View>
                      {selected ? <Check size={18} color={colors.accent} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.rule} />
              <View style={styles.backupHeading}>
                <Text style={styles.sectionTitle}>数据备份</Text>
                <Text style={styles.modelHint}>换手机时恢复学习状态</Text>
              </View>
              <View style={styles.backupRow}>
                <Pressable accessibilityRole="button" onPress={runExport} disabled={backupBusy !== null} style={({ pressed }) => [styles.backupButton, pressed && styles.buttonPressed, backupBusy !== null && styles.buttonDisabled]}>
                  {backupBusy === 'export' ? <ActivityIndicator size="small" color={colors.charcoal} /> : <Download size={17} color={colors.charcoal} />}
                  <Text style={styles.backupLabel}>{backupBusy === 'export' ? '正在导出' : '导出备份'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={confirmImport} disabled={backupBusy !== null} style={({ pressed }) => [styles.backupButton, pressed && styles.buttonPressed, backupBusy !== null && styles.buttonDisabled]}>
                  {backupBusy === 'import' ? <ActivityIndicator size="small" color={colors.charcoal} /> : <Upload size={17} color={colors.charcoal} />}
                  <Text style={styles.backupLabel}>{backupBusy === 'import' ? '正在导入' : '导入备份'}</Text>
                </Pressable>
              </View>
              {backupStatus ? <StatusLine status={backupStatus} colors={colors} styles={styles} /> : null}

              <View style={styles.rule} />
              <View style={styles.backupHeading}>
                <Text style={styles.sectionTitle}>关于</Text>
                <Text style={styles.modelHint}>v1.7.0-beta.1</Text>
              </View>
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://github.com/ssh1wa/kotoba-biyori')} style={styles.attribution}>
                <Text style={styles.attributionText}>GitHub 项目主页与下载</Text>
                <ExternalLink size={14} color={colors.muted} />
              </Pressable>
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://github.com/ssh1wa/kotoba-biyori/blob/main/LICENSE')} style={styles.attribution}>
                <Text style={styles.attributionText}>原创内容：PolyForm 非商业许可</Text>
                <ExternalLink size={14} color={colors.muted} />
              </Pressable>
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://hanabira.org/about')} style={styles.attribution}>
                <Text style={styles.attributionText}>第三方语法资料：Hanabira</Text>
                <ExternalLink size={14} color={colors.muted} />
              </Pressable>
            </>
          ) : null}

          {section === 'mio' ? (
            <>
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchTitle}>角色回复英文翻译</Text>
                  <Text style={styles.settingDescription}>开启后，每条美绪回复都会附完整英文译文。</Text>
                </View>
                <Switch
                  value={draft.roleplayEnglishHelp}
                  onValueChange={(roleplayEnglishHelp) => setDraft((current) => ({ ...current, roleplayEnglishHelp }))}
                  trackColor={{ false: colors.track, true: colors.green }}
                  thumbColor={colors.surface}
                />
              </View>

              <View style={styles.mioFactsSection}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={mioFactsOpen ? '收起美绪随聊设定' : '展开美绪随聊设定'}
                  onPress={() => setMioFactsOpen((current) => !current)}
                  style={styles.mioFactsHeader}
                >
                  <View style={styles.switchCopy}>
                    <Text style={styles.switchTitle}>美绪随聊设定</Text>
                    <Text style={styles.settingDescription}>{mioFacts.length ? `${mioFacts.length} 条自动固定的身份细节` : '尚无新增身份细节'}</Text>
                  </View>
                  {mioFactsOpen ? <ChevronDown size={18} color={colors.muted} /> : <ChevronRight size={18} color={colors.muted} />}
                </Pressable>
                {mioFactsOpen ? (
                  <View style={styles.mioFactsBody}>
                    <Text style={styles.settingDescription}>随聊会按爱好、经历等类别自动合并和压缩。最多 24 条，每条 240 字；基础档案始终优先。</Text>
                    {mioFacts.map((fact, index) => (
                      <View key={`mio-fact-${index}`} style={styles.mioFactRow}>
                        <TextInput value={fact} onChangeText={(value) => editMioFact(index, value)} maxLength={MIO_FACT_MAX_LENGTH} multiline placeholderTextColor={colors.placeholder} style={styles.mioFactInput} />
                        <Pressable accessibilityRole="button" accessibilityLabel={`删除设定：${fact}`} onPress={() => deleteMioFact(index)} style={styles.mioFactAction}>
                          <Trash2 size={16} color={colors.muted} />
                        </Pressable>
                      </View>
                    ))}
                    <View style={styles.mioFactRow}>
                      <TextInput value={newMioFact} onChangeText={setNewMioFact} onSubmitEditing={addMioFact} maxLength={MIO_FACT_MAX_LENGTH} placeholder="添加一条长期设定" placeholderTextColor={colors.placeholder} returnKeyType="done" style={styles.mioFactInput} />
                      <Pressable accessibilityRole="button" accessibilityLabel="添加美绪设定" disabled={!newMioFact.trim()} onPress={addMioFact} style={[styles.mioFactAction, !newMioFact.trim() && styles.buttonDisabled]}>
                        <Plus size={18} color={colors.green} />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton label="保存设置" icon={Check} loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StatusLine({
  status,
  colors,
  styles,
}: {
  status: Exclude<OperationStatus, null>;
  colors: AppColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const success = status.type === 'success';
  return (
    <View style={[styles.statusLine, success ? styles.statusSuccess : styles.statusError]}>
      {success ? <CheckCircle2 size={16} color={colors.green} /> : <CircleAlert size={16} color={colors.dangerText} />}
      <Text style={[styles.statusText, !success && styles.statusErrorText]}>{status.message}</Text>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 11, color: colors.accent, fontWeight: '700', letterSpacing: 0 },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, lineHeight: 34, letterSpacing: 0 },
  tabs: { marginHorizontal: 20, marginBottom: 18, height: 46, flexDirection: 'row', padding: 3, borderRadius: radii.md, backgroundColor: colors.segment },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 6 },
  tabSelected: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  tabTextSelected: { color: colors.ink, fontWeight: '800' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 36, gap: 18 },
  keyRow: { position: 'relative' },
  flexField: { paddingRight: 52 },
  eyeButton: { position: 'absolute', right: 5, bottom: 3, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  helper: { marginTop: -12, color: colors.muted, fontSize: 12, lineHeight: 17, letterSpacing: 0 },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 2 },
  levelWrap: { gap: 8 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0 },
  settingDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, letterSpacing: 0 },
  learnerProfileInput: { minHeight: 82, maxHeight: 132, paddingTop: 12, paddingBottom: 12, lineHeight: 21 },
  switchRow: { minHeight: 60, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  switchCopy: { flex: 1, gap: 3 },
  switchTitle: { color: colors.ink, fontSize: 13, fontWeight: '800', letterSpacing: 0 },
  mioFactsSection: { borderBottomWidth: 1, borderBottomColor: colors.line },
  mioFactsHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  mioFactsBody: { gap: 9, paddingBottom: 14 },
  mioFactRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mioFactInput: { flex: 1, minHeight: 42, maxHeight: 76, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.ink, fontSize: 12, lineHeight: 17, paddingHorizontal: 11, paddingVertical: 8, letterSpacing: 0 },
  mioFactAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modelHeading: { marginBottom: -8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0 },
  modelHint: { color: colors.muted, fontSize: 10, letterSpacing: 0 },
  routeList: { gap: 18 },
  route: { gap: 10 },
  routeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  routeLabel: { color: colors.ink, fontSize: 14, fontWeight: '800', letterSpacing: 0 },
  routeSegmented: { width: 172, flexDirection: 'row', backgroundColor: colors.segment, padding: 3, borderRadius: radii.md },
  routeProvider: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  routeProviderText: { color: colors.muted, fontWeight: '600', fontSize: 12, letterSpacing: 0 },
  modelChoiceButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm },
  modelChoiceButtonText: { flex: 1, color: colors.charcoal, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  modelChoices: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm, overflow: 'hidden' },
  modelChoice: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  modelChoiceSelected: { backgroundColor: colors.accentSoft },
  modelChoiceText: { flex: 1, color: colors.charcoal, fontSize: 12, letterSpacing: 0 },
  modelChoiceTextSelected: { color: colors.ink, fontWeight: '800' },
  themeHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  themeList: { borderTopWidth: 1, borderTopColor: colors.line },
  themeOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 8 },
  themeSelected: { backgroundColor: colors.accentSoft },
  swatches: { width: 48, flexDirection: 'row' },
  swatch: { width: 20, height: 20, borderRadius: 10, marginRight: -5, borderWidth: 1, borderColor: colors.surface },
  themeCopy: { flex: 1, gap: 2 },
  themeName: { color: colors.ink, fontSize: 14, fontWeight: '800', letterSpacing: 0 },
  themeDescription: { color: colors.muted, fontSize: 11, letterSpacing: 0 },
  segmented: { flexDirection: 'row', backgroundColor: colors.segment, padding: 3, borderRadius: radii.md },
  level: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  provider: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  levelSelected: { backgroundColor: colors.surface },
  levelText: { color: colors.muted, fontWeight: '600', fontSize: 13, letterSpacing: 0 },
  levelTextSelected: { color: colors.ink, fontWeight: '800' },
  apiActionRow: { flexDirection: 'row', gap: 10 },
  testButton: { flex: 1, height: 46, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  testButtonText: { color: colors.charcoal, fontSize: 13, fontWeight: '800', letterSpacing: 0 },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.55 },
  statusLine: { minHeight: 42, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusSuccess: { backgroundColor: colors.greenSoft },
  statusError: { backgroundColor: colors.accentSoft },
  statusText: { flex: 1, color: colors.green, fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
  statusErrorText: { color: colors.dangerText },
  note: { paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, gap: 4 },
  noteTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  noteText: { color: colors.muted, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  backupHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  backupRow: { flexDirection: 'row', gap: 9 },
  backupButton: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  backupLabel: { color: colors.charcoal, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  attribution: { marginTop: 4, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: colors.line },
  attributionText: { color: colors.muted, fontSize: 11, letterSpacing: 0 },
  footer: { padding: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.paper },
});
