import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ActivityState, loadActivity, saveActivity } from './activity';
import {
  importPublicSettings,
  loadRoleplay,
  loadSettings,
  publicSettings,
  RoleplayState,
  saveRoleplay,
} from './storage';
import { AppSettings } from '../types';
import { loadWordbook, saveWordbook, WordbookEntry } from './wordbook';

const BACKUP_FORMAT = 'kotoba-biyori-backup';

type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: 1;
  appVersion: string;
  exportedAt: string;
  activity: ActivityState;
  roleplay: RoleplayState;
  wordbook?: WordbookEntry[];
  settings: AppSettings;
};

export type ImportedBackup = {
  activity: ActivityState;
  roleplay: RoleplayState;
  wordbook: WordbookEntry[];
  settings: AppSettings;
};

export async function exportBackup() {
  if (!FileSystem.cacheDirectory) throw new Error('当前设备无法创建备份文件。');
  const [activity, roleplay, wordbook, settings] = await Promise.all([loadActivity(), loadRoleplay(), loadWordbook(), loadSettings()]);
  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    schemaVersion: 1,
    appVersion: '1.7.0-beta.2',
    exportedAt: new Date().toISOString(),
    activity,
    roleplay,
    wordbook,
    settings: publicSettings(settings),
  };
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const uri = `${FileSystem.cacheDirectory}KotobaBiyori-backup-${stamp}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备无法打开系统分享面板。');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: '导出ことば日和学习备份' });
}

const isActivityState = (value: unknown): value is ActivityState => {
  const candidate = value as ActivityState;
  return !!candidate && Array.isArray(candidate.checkIns) && Array.isArray(candidate.records);
};

export async function importBackup(): Promise<ImportedBackup | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (picked.canceled) return null;
  const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri);
  let payload: BackupPayload;
  try {
    payload = JSON.parse(raw) as BackupPayload;
  } catch {
    throw new Error('所选文件不是有效的 JSON 备份。');
  }
  if (payload.format !== BACKUP_FORMAT || payload.schemaVersion !== 1) {
    throw new Error('这不是受支持的ことば日和备份文件。');
  }
  if (!isActivityState(payload.activity) || !payload.roleplay || !payload.settings) {
    throw new Error('备份内容不完整，无法导入。');
  }
  const settings = await importPublicSettings(payload.settings);
  const wordbook = Array.isArray(payload.wordbook) ? payload.wordbook : [];
  await Promise.all([saveActivity(payload.activity), saveRoleplay(payload.roleplay), saveWordbook(wordbook)]);
  return { activity: payload.activity, roleplay: payload.roleplay, wordbook, settings };
}
