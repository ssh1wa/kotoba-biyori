import React from 'react';
import { ChevronRight, Languages, MessageCircleMore, NotebookPen, Trash2, X } from 'lucide-react-native';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityKind, ActivityRecord } from '../lib/activity';
import { AppColors, useThemedStyles } from '../theme';
import { RubyText } from './RubyText';
import { IconButton } from './Ui';

export function FeatureHistoryModal({
  visible,
  kind,
  records,
  onSelect,
  onDelete,
  onClose,
}: {
  visible: boolean;
  kind: ActivityKind;
  records: ActivityRecord[];
  onSelect: (record: ActivityRecord) => void;
  onDelete?: (recordId: string) => void;
  onClose: () => void;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  const meta = {
    translation: { title: '互译记录', eyebrow: 'TRANSLATION LOG', icon: Languages, color: colors.accent },
    practice: { title: '练习记录', eyebrow: 'PRACTICE LOG', icon: NotebookPen, color: colors.amber },
    roleplay: { title: '对话记录', eyebrow: 'CHAT LOG', icon: MessageCircleMore, color: colors.green },
  } as const;
  const current = meta[kind];
  const Icon = current.icon;
  const ordered = records.slice().reverse();
  const confirmDelete = (record: ActivityRecord) => Alert.alert(
    '删除这条记录？',
    '记录详情将永久删除，已有打卡日期不会改变。',
    [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete?.(record.id) },
    ],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: current.color }]}>{current.eyebrow}</Text>
            <Text style={styles.title}>{current.title}</Text>
          </View>
          <IconButton icon={X} label={`关闭${current.title}`} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {ordered.length ? ordered.map((record) => (
            <View key={record.id} style={styles.rowShell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="打开这条记录"
                onPress={() => onSelect(record)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={styles.rowTop}>
                  <View style={styles.kind}>
                    <Icon size={15} color={current.color} />
                    <Text style={[styles.kindText, { color: current.color }]}>
                      {new Date(record.timestamp).toLocaleDateString()} · {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.muted} />
                </View>
                {record.sourceJapanese?.length ? <RubyText segments={record.sourceJapanese} size={17} /> : null}
                {record.sourceText && !record.sourceJapanese?.length ? <Text selectable style={styles.source} numberOfLines={2}>{record.sourceText}</Text> : null}
                {record.userAnswer ? <Text selectable style={styles.answer} numberOfLines={2}>你的翻译：{record.userAnswer}</Text> : null}
                {record.resultJapanese?.length ? <RubyText segments={record.resultJapanese} size={16} /> : null}
                {record.resultText ? <Text selectable style={styles.result} numberOfLines={2}>{record.resultText}</Text> : null}
                <View style={styles.footer}>
                  {typeof record.score === 'number' ? <Text style={styles.score}>{Math.round(record.score)} 分</Text> : <View />}
                  {record.note ? <Text selectable style={styles.note} numberOfLines={1}>{record.note}</Text> : null}
                </View>
              </Pressable>
              {onDelete ? (
                <Pressable accessibilityRole="button" accessibilityLabel="删除这条记录" onPress={() => confirmDelete(record)} style={styles.deleteButton}>
                  <Trash2 size={17} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          )) : (
            <View style={styles.empty}>
              <Icon size={30} color={colors.muted} />
              <Text style={styles.emptyTitle}>还没有记录</Text>
              <Text style={styles.emptyText}>完成一次操作后会自动保存在这里。</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: 0 },
  content: { paddingHorizontal: 20, paddingBottom: 38 },
  rowShell: { borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'stretch' },
  row: { flex: 1, paddingVertical: 17, gap: 9 },
  rowPressed: { opacity: 0.58 },
  deleteButton: { width: 44, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  kindText: { fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  source: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '600', letterSpacing: 0 },
  answer: { color: colors.charcoal, fontSize: 12, lineHeight: 18, padding: 8, borderRadius: 5, backgroundColor: colors.raised, letterSpacing: 0 },
  result: { color: colors.muted, fontSize: 13, lineHeight: 20, letterSpacing: 0 },
  footer: { minHeight: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  score: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  note: { flex: 1, color: colors.muted, fontSize: 10, textAlign: 'right', letterSpacing: 0 },
  empty: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: 0 },
  emptyText: { color: colors.muted, fontSize: 12, letterSpacing: 0 },
});
