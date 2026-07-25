import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookMarked, CheckSquare2, Languages, ListChecks, Plus, RefreshCw, Search, Square, Trash2, X } from 'lucide-react-native';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { WordbookEntry } from '../lib/wordbook';
import { AppColors, radii, useThemedStyles } from '../theme';
import { RubyText } from '../components/RubyText';

export function WordbookScreen({
  entries,
  onAdd,
  onDelete,
  onDeleteMany,
  onRefreshDefinition,
  loadingIds,
  onLookup,
}: {
  entries: WordbookEntry[];
  onAdd: (text: string) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onRefreshDefinition: (entry: WordbookEntry) => void;
  loadingIds: Set<string>;
  onLookup: (entry: WordbookEntry) => void;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const addInputRef = useRef<TextInput>(null);
  const filtered = useMemo(() => {
    const key = query.trim().toLocaleLowerCase();
    return entries.filter((entry) => !key || entry.text.toLocaleLowerCase().includes(key)).slice().reverse();
  }, [entries, query]);

  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
    setAdding(false);
  };

  useEffect(() => {
    if (adding) setTimeout(() => addInputRef.current?.focus(), 80);
  }, [adding]);

  const toggleSelection = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const leaveSelection = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const confirmBatchDelete = () => {
    if (!selectedIds.size) return;
    Alert.alert('删除选中的生词？', `将永久删除 ${selectedIds.size} 条生词。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { onDeleteMany([...selectedIds]); leaveSelection(); } },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.kicker}>WORD BOOK</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>生词本</Text>
          <Text style={styles.count}>{entries.length}</Text>
          <View style={styles.titleSpacer} />
          <Pressable accessibilityRole="button" accessibilityLabel={adding ? '收起手动添加' : '手动添加生词'} onPress={() => setAdding((current) => !current)} style={[styles.titleIconButton, adding && styles.titleIconButtonActive]}>
            {adding ? <X size={18} color={colors.accent} /> : <Plus size={18} color={colors.charcoal} />}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => selecting ? leaveSelection() : setSelecting(true)} style={styles.manageButton}>
            {selecting ? <X size={16} color={colors.charcoal} /> : <ListChecks size={16} color={colors.charcoal} />}
            <Text style={styles.manageText}>{selecting ? '完成' : '批量管理'}</Text>
          </Pressable>
        </View>
      </View>

      {selecting ? (
        <View style={styles.batchBar}>
          <Pressable onPress={() => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((entry) => entry.id)))} style={styles.batchAction}>
            {selectedIds.size === filtered.length && filtered.length ? <CheckSquare2 size={17} color={colors.accent} /> : <Square size={17} color={colors.muted} />}
            <Text style={styles.batchLabel}>{selectedIds.size === filtered.length && filtered.length ? '取消全选' : '全选'}</Text>
          </Pressable>
          <Text style={styles.selectedCount}>已选 {selectedIds.size} 条</Text>
          <Pressable disabled={!selectedIds.size} onPress={confirmBatchDelete} style={[styles.batchAction, !selectedIds.size && styles.disabled]}>
            <Trash2 size={17} color={colors.accent} />
            <Text style={[styles.batchLabel, { color: colors.accent }]}>删除</Text>
          </Pressable>
        </View>
      ) : null}

      {adding ? (
        <View style={styles.addRow}>
          <TextInput ref={addInputRef} value={draft} onChangeText={setDraft} onSubmitEditing={add} placeholder="添加单词或短语" placeholderTextColor={colors.placeholder} returnKeyType="done" style={styles.addInput} />
          <Pressable accessibilityRole="button" accessibilityLabel="添加到生词本" disabled={!draft.trim()} onPress={add} style={[styles.addButton, !draft.trim() && styles.disabled]}>
            <Plus size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <Search size={17} color={colors.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="搜索生词" placeholderTextColor={colors.placeholder} style={styles.searchInput} />
      </View>

      {filtered.length ? (
        <View style={styles.list}>
          {filtered.map((entry) => {
            const selected = selectedIds.has(entry.id);
            const loading = loadingIds.has(entry.id);
            return (
              <View key={entry.id} style={[styles.entry, selected && styles.entrySelected]}>
                <Pressable accessibilityRole="button" accessibilityLabel={selecting ? `选择${entry.text}` : `查询${entry.text}`} onPress={() => selecting ? toggleSelection(entry.id) : onLookup(entry)} style={({ pressed }) => [styles.entryMain, pressed && styles.pressed]}>
                  {selecting ? (selected ? <CheckSquare2 size={19} color={colors.accent} /> : <Square size={19} color={colors.muted} />) : <BookMarked size={18} color={colors.accent} />}
                  <View style={styles.entryCopy}>
                    <Text selectable style={styles.word}>{entry.text}</Text>
                    {entry.definition?.japanese?.length ? <RubyText segments={entry.definition.japanese} size={16} /> : null}
                    {entry.definition?.meanings?.length ? <Text selectable style={styles.meaning}>{entry.definition.meanings.join('；')}</Text> : null}
                    {entry.definition?.partOfSpeech || entry.definition?.usage ? <Text selectable style={styles.usage}>{[entry.definition.partOfSpeech, entry.definition.usage].filter(Boolean).join(' · ')}</Text> : null}
                    {entry.definition?.examples?.[0] ? (
                      <View style={styles.example}>
                        <RubyText segments={entry.definition.examples[0].japanese} size={14} />
                        <Text selectable style={styles.exampleMeaning}>{entry.definition.examples[0].chinese}</Text>
                      </View>
                    ) : null}
                    {loading ? <View style={styles.definitionStatus}><ActivityIndicator size="small" color={colors.accent} /><Text style={styles.statusText}>正在生成释义</Text></View> : null}
                    {!loading && entry.definitionError ? <Text selectable style={styles.definitionError}>{entry.definitionError}</Text> : null}
                    <Text style={styles.date}>{new Date(entry.createdAt).toLocaleDateString()} · {entry.source === 'selection' ? '划词收藏' : '手动添加'}</Text>
                  </View>
                  {!selecting ? <Languages size={17} color={colors.muted} /> : null}
                </Pressable>
                {!selecting ? (
                  <View style={styles.entryActions}>
                    {(!entry.definition || entry.definitionError) && !loading ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`获取${entry.text}的释义`} onPress={() => onRefreshDefinition(entry)} style={styles.deleteButton}>
                        <RefreshCw size={16} color={colors.accent} />
                      </Pressable>
                    ) : null}
                    <Pressable accessibilityRole="button" accessibilityLabel={`删除${entry.text}`} onPress={() => onDelete(entry.id)} style={styles.deleteButton}>
                      <Trash2 size={17} color={colors.muted} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <BookMarked size={30} color={colors.muted} />
          <Text style={styles.emptyTitle}>{query ? '没有匹配的生词' : '还没有收藏'}</Text>
          <Text style={styles.emptyText}>长按并选择应用内文字，可直接查询或加入生词本。</Text>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 38, gap: 18 },
  intro: { paddingTop: 6, gap: 5 },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: colors.ink, fontSize: 29, lineHeight: 36, fontWeight: '800', letterSpacing: 0 },
  count: { minWidth: 25, height: 25, borderRadius: 13, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.accentSoft, color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  titleSpacer: { flex: 1 },
  titleIconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  titleIconButtonActive: { borderBottomColor: colors.accent, backgroundColor: colors.accentSoft },
  manageButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 7 },
  manageText: { color: colors.charcoal, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  batchBar: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  batchAction: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 5 },
  batchLabel: { color: colors.charcoal, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  selectedCount: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0 },
  addRow: { flexDirection: 'row', gap: 9 },
  addInput: { flex: 1, height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.ink, paddingHorizontal: 13, fontSize: 14, letterSpacing: 0 },
  addButton: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  searchRow: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  searchInput: { flex: 1, color: colors.ink, fontSize: 13, letterSpacing: 0 },
  list: { borderTopWidth: 1, borderColor: colors.line },
  entry: { minHeight: 68, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: colors.line },
  entrySelected: { backgroundColor: colors.accentSoft },
  entryMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  entryCopy: { flex: 1, gap: 3 },
  word: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '700', letterSpacing: 0 },
  meaning: { color: colors.charcoal, fontSize: 13, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  usage: { color: colors.muted, fontSize: 11, lineHeight: 17, letterSpacing: 0 },
  example: { marginTop: 3, padding: 9, borderRadius: radii.sm, backgroundColor: colors.sunken, gap: 3 },
  exampleMeaning: { color: colors.muted, fontSize: 10, lineHeight: 15, letterSpacing: 0 },
  definitionStatus: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusText: { color: colors.accent, fontSize: 10, letterSpacing: 0 },
  definitionError: { color: colors.dangerText, fontSize: 10, lineHeight: 15, letterSpacing: 0 },
  date: { color: colors.muted, fontSize: 9, letterSpacing: 0 },
  deleteButton: { width: 42, alignItems: 'center', justifyContent: 'center' },
  entryActions: { justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  empty: { minHeight: 310, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: 0 },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', letterSpacing: 0 },
});
