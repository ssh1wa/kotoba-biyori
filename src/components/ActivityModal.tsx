import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Languages,
  MessageCircleMore,
  NotebookPen,
  X,
} from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityRecord, ActivityState, currentStreak, localDateKey, parseLocalDate } from '../lib/activity';
import { AppColors, radii, useThemedStyles } from '../theme';
import { RubyText } from './RubyText';
import { IconButton } from './Ui';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const plainJapanese = (segments?: ActivityRecord['resultJapanese']) =>
  segments?.map((segment) => segment.text).join('') || '';

export function ActivityModal({
  visible,
  activity,
  onSelectRecord,
  onClose,
}: {
  visible: boolean;
  activity: ActivityState;
  onSelectRecord: (record: ActivityRecord) => void;
  onClose: () => void;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  const kindMeta = {
    translation: { label: '互译', icon: Languages, color: colors.accent },
    practice: { label: '练习', icon: NotebookPen, color: colors.amber },
    roleplay: { label: '美绪', icon: MessageCircleMore, color: colors.green },
  } as const;
  const today = localDateKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  useEffect(() => {
    if (!visible) return;
    const now = new Date();
    setSelectedDate(localDateKey(now));
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, [visible]);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, ActivityRecord[]>();
    activity.records.forEach((record) => map.set(record.date, [...(map.get(record.date) || []), record]));
    return map;
  }, [activity.records]);

  const days = useMemo(() => {
    const mondayOffset = (month.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - mondayOffset + 1;
      return day >= 1 && day <= count ? day : null;
    });
  }, [month]);

  const selectedRecords = (recordsByDate.get(selectedDate) || []).slice().reverse();
  const selected = parseLocalDate(selectedDate);
  const checkInSet = new Set(activity.checkIns);

  const moveMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelectedDate(localDateKey(next));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>LEARNING LOG</Text>
            <Text style={styles.title}>学习日历</Text>
          </View>
          <IconButton icon={X} label="关闭学习日历" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Flame size={20} color={colors.accent} />
              <Text style={styles.statValue}>{currentStreak(activity.checkIns)}</Text>
              <Text style={styles.statLabel}>连续天数</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <CalendarCheck2 size={20} color={colors.green} />
              <Text style={styles.statValue}>{activity.checkIns.length}</Text>
              <Text style={styles.statLabel}>累计打卡</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <NotebookPen size={20} color={colors.amber} />
              <Text style={styles.statValue}>{activity.records.length}</Text>
              <Text style={styles.statLabel}>学习记录</Text>
            </View>
          </View>

          <View style={styles.calendarHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="上个月" onPress={() => moveMonth(-1)} style={styles.monthButton}>
              <ChevronLeft size={20} color={colors.charcoal} />
            </Pressable>
            <Text style={styles.monthTitle}>{month.getFullYear()} 年 {month.getMonth() + 1} 月</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="下个月" onPress={() => moveMonth(1)} style={styles.monthButton}>
              <ChevronRight size={20} color={colors.charcoal} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
          </View>
          <View style={styles.calendarGrid}>
            {days.map((day, index) => {
              if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const date = localDateKey(new Date(month.getFullYear(), month.getMonth(), day));
              const checked = checkInSet.has(date);
              const hasRecords = recordsByDate.has(date);
              const active = selectedDate === date;
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${date}${checked ? '，已打卡' : ''}${hasRecords ? '，有学习记录' : ''}`}
                  onPress={() => setSelectedDate(date)}
                  style={styles.dayCell}
                >
                  <View style={[styles.dayCircle, checked && styles.checkedDay, active && styles.activeDay]}>
                    <Text style={[styles.dayText, checked && styles.checkedDayText]}>{day}</Text>
                  </View>
                  {hasRecords && !checked ? <View style={styles.recordDot} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.historyDate}>{selected.getMonth() + 1} 月 {selected.getDate()} 日</Text>
              <Text style={styles.historyMeta}>{checkInSet.has(selectedDate) ? '已完成今日打卡' : '当天未打卡'}</Text>
            </View>
            <Text style={styles.historyCount}>{selectedRecords.length} 条</Text>
          </View>

          {selectedRecords.length ? selectedRecords.map((record) => {
            const meta = kindMeta[record.type];
            const Icon = meta.icon;
            const resultPlain = plainJapanese(record.resultJapanese);
            return (
              <Pressable key={record.id} accessibilityRole="button" accessibilityLabel="打开并重现这条学习记录" onPress={() => onSelectRecord(record)} style={({ pressed }) => [styles.record, pressed && styles.recordPressed]}>
                <View style={styles.recordTop}>
                  <View style={styles.kind}>
                    <Icon size={15} color={meta.color} />
                    <Text style={[styles.kindLabel, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <View style={styles.timeRow}>
                    <Text style={styles.time}>{new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    <ChevronRight size={16} color={colors.muted} />
                  </View>
                </View>
                {record.sourceJapanese?.length ? <RubyText segments={record.sourceJapanese} size={17} /> : null}
                {record.sourceText && !record.sourceJapanese?.length ? <Text selectable style={styles.source}>{record.sourceText}</Text> : null}
                {record.userAnswer ? <Text selectable style={styles.answer}>你的回答：{record.userAnswer}</Text> : null}
                {record.resultJapanese?.length ? <RubyText segments={record.resultJapanese} size={17} /> : null}
                {record.resultText && record.resultText !== resultPlain ? <Text selectable style={styles.resultText}>{record.resultText}</Text> : null}
                <View style={styles.recordBottom}>
                  {typeof record.score === 'number' ? <Text style={styles.score}>{Math.round(record.score)} 分</Text> : <View />}
                  {record.note ? <Text selectable style={styles.note}>{record.note}</Text> : null}
                </View>
              </Pressable>
            );
          }) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>这一天还没有记录</Text>
              <Text style={styles.emptyText}>完成一次翻译、练习或角色对话后，会自动保存在这里。</Text>
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
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: 0 },
  content: { padding: 20, paddingBottom: 38 },
  stats: { height: 72, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 6 },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: '800', letterSpacing: 0 },
  statLabel: { width: '100%', color: colors.muted, fontSize: 9, textAlign: 'center', marginTop: 2, letterSpacing: 0 },
  statDivider: { height: 32, width: 1, backgroundColor: colors.line },
  calendarHeader: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', letterSpacing: 0 },
  weekRow: { flexDirection: 'row' },
  weekday: { width: '14.2857%', color: colors.muted, fontSize: 10, fontWeight: '700', textAlign: 'center', paddingBottom: 7, letterSpacing: 0 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', height: 43, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  checkedDay: { backgroundColor: colors.accent },
  activeDay: { borderWidth: 2, borderColor: colors.ink },
  dayText: { color: colors.charcoal, fontSize: 12, fontWeight: '600', letterSpacing: 0 },
  checkedDayText: { color: colors.onPrimary, fontWeight: '800' },
  recordDot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green },
  historyHeader: { marginTop: 20, paddingTop: 17, borderTopWidth: 2, borderTopColor: colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyDate: { color: colors.ink, fontSize: 19, fontWeight: '800', letterSpacing: 0 },
  historyMeta: { color: colors.muted, fontSize: 10, marginTop: 2, letterSpacing: 0 },
  historyCount: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  record: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 9 },
  recordPressed: { opacity: 0.58 },
  recordTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  time: { color: colors.muted, fontSize: 10, letterSpacing: 0 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  source: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '600', letterSpacing: 0 },
  answer: { color: colors.charcoal, fontSize: 13, lineHeight: 20, backgroundColor: colors.raised, padding: 9, borderRadius: radii.sm, letterSpacing: 0 },
  resultText: { color: colors.muted, fontSize: 13, lineHeight: 20, letterSpacing: 0 },
  recordBottom: { minHeight: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  score: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  note: { flex: 1, color: colors.muted, fontSize: 10, textAlign: 'right', letterSpacing: 0 },
  empty: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 25 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  emptyText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', letterSpacing: 0 },
});
