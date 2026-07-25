import React, { useEffect, useRef, useState } from 'react';
import { Check, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react-native';
import { Alert, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CasualThread } from '../lib/storage';
import { AppColors, useThemedStyles } from '../theme';
import { IconButton } from './Ui';

export function CasualThreadsModal({
  visible,
  threads,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onClose,
}: {
  visible: boolean;
  threads: CasualThread[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose: () => void;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  const reveal = useRef(new Animated.Value(0)).current;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const sharedMemoryCount = new Set(threads.flatMap((thread) => thread.memories)).size;

  useEffect(() => {
    if (!visible) return;
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 210, useNativeDriver: true }).start();
  }, [visible, reveal]);

  const finish = (action: () => void) => {
    Animated.timing(reveal, { toValue: 0, duration: 150, useNativeDriver: true }).start(action);
  };

  const confirmDelete = (thread: CasualThread) => Alert.alert(
    '删除这段随聊？',
    `“${thread.title}”的消息、摘要、记忆和对应学习记录都会删除。`,
    [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete(thread.id) },
    ],
  );

  const beginRename = (thread: CasualThread) => {
    setEditingId(thread.id);
    setEditingTitle(thread.title);
  };

  const saveRename = () => {
    const title = editingTitle.trim();
    if (editingId && title) onRename(editingId, title);
    setEditingId(null);
    setEditingTitle('');
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => finish(onClose)}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: reveal }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭会话栏" onPress={() => finish(onClose)} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            { transform: [{ translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [-340, 0] }) }] },
          ]}
        >
          <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left']}>
            <View style={styles.header}>
              <Text style={styles.title}>随聊</Text>
              <IconButton icon={X} label="关闭会话栏" onPress={() => finish(onClose)} />
            </View>

            <Pressable accessibilityRole="button" onPress={() => finish(onCreate)} style={({ pressed }) => [styles.newChat, pressed && styles.pressed]}>
              <MessageSquarePlus size={18} color={colors.ink} />
              <Text style={styles.newChatText}>新建聊天</Text>
            </Pressable>

            <Text style={styles.sectionLabel}>最近对话</Text>
            <ScrollView contentContainerStyle={styles.content}>
              {threads.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((thread) => {
                const active = thread.id === activeId;
                if (editingId === thread.id) {
                  return (
                    <View key={thread.id} style={[styles.row, styles.rowActive, styles.editRow]}>
                      <TextInput
                        value={editingTitle}
                        onChangeText={setEditingTitle}
                        autoFocus
                        maxLength={24}
                        selectTextOnFocus
                        returnKeyType="done"
                        onSubmitEditing={saveRename}
                        style={styles.renameInput}
                      />
                      <Pressable accessibilityRole="button" accessibilityLabel="保存标题" onPress={saveRename} style={styles.rowIconButton}>
                        <Check size={17} color={colors.green} />
                      </Pressable>
                    </View>
                  );
                }
                return (
                  <View key={thread.id} style={[styles.row, active && styles.rowActive]}>
                    <Pressable accessibilityRole="button" onPress={() => finish(() => onSelect(thread.id))} style={({ pressed }) => [styles.threadButton, pressed && styles.pressed]}>
                      <View style={styles.threadCopy}>
                        <Text style={[styles.threadTitle, active && styles.threadTitleActive]} numberOfLines={1}>{thread.title}</Text>
                        <Text style={styles.threadMeta}>{new Date(thread.updatedAt).toLocaleDateString()} · {thread.messages.length} 条</Text>
                      </View>
                      {active ? <Check size={16} color={colors.green} /> : null}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`重命名${thread.title}`} onPress={() => beginRename(thread)} style={styles.rowIconButton}>
                      <Pencil size={15} color={colors.muted} />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`删除${thread.title}`} onPress={() => confirmDelete(thread)} style={styles.deleteButton}>
                      <Trash2 size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <Text style={styles.memoryText}>{sharedMemoryCount} 条记忆在随聊中共享</Text>
            </View>
          </SafeAreaView>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000066' },
  drawer: { width: '86%', maxWidth: 340, height: '100%', backgroundColor: colors.paper, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.line },
  safe: { flex: 1 },
  header: { height: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.ink, fontSize: 20, fontWeight: '800', letterSpacing: 0 },
  newChat: { marginHorizontal: 12, height: 46, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 9 },
  newChatText: { color: colors.ink, fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, letterSpacing: 0 },
  content: { paddingHorizontal: 8, paddingBottom: 20 },
  row: { minHeight: 58, borderRadius: 7, flexDirection: 'row', alignItems: 'center' },
  rowActive: { backgroundColor: colors.raised },
  threadButton: { flex: 1, minWidth: 0, minHeight: 58, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressed: { opacity: 0.58 },
  threadCopy: { flex: 1, minWidth: 0, gap: 4 },
  threadTitle: { color: colors.charcoal, fontSize: 13, fontWeight: '600', letterSpacing: 0 },
  threadTitleActive: { color: colors.ink, fontWeight: '800' },
  threadMeta: { color: colors.muted, fontSize: 9, letterSpacing: 0 },
  deleteButton: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
  rowIconButton: { width: 36, height: 46, alignItems: 'center', justifyContent: 'center' },
  editRow: { paddingLeft: 10 },
  renameInput: { flex: 1, minWidth: 0, height: 40, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.accent, fontSize: 13, fontWeight: '700', paddingHorizontal: 4, letterSpacing: 0 },
  footer: { minHeight: 48, marginHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line, justifyContent: 'center' },
  memoryText: { color: colors.muted, fontSize: 10, letterSpacing: 0 },
});
