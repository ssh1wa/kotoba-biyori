import React from 'react';
import { ChevronDown, ChevronRight, MessageCircleQuestion, Send } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppColors, radii, useThemedStyles } from '../theme';
import { TutorFollowUpTurn } from '../types';
import { RubyText } from './RubyText';
import { PrimaryButton } from './Ui';

export function TutorFollowUpPanel({
  turns,
  open,
  input,
  loading,
  onToggle,
  onChangeInput,
  onSubmit,
}: {
  turns: TutorFollowUpTurn[];
  open: boolean;
  input: string;
  loading: boolean;
  onToggle: () => void;
  onChangeInput: (value: string) => void;
  onSubmit: () => void;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.header}>
        <View style={styles.headerCopy}>
          <MessageCircleQuestion size={18} color={colors.accent} />
          <Text style={styles.title}>继续追问</Text>
          {turns.length ? <Text style={styles.count}>{turns.length}</Text> : null}
        </View>
        {open ? <ChevronDown size={18} color={colors.muted} /> : <ChevronRight size={18} color={colors.muted} />}
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {turns.map((turn) => (
            <View key={turn.id} style={styles.turn}>
              <View style={styles.questionBubble}>
                <Text style={styles.questionLabel}>你</Text>
                <Text selectable style={styles.question}>{turn.question}</Text>
              </View>
              <View style={styles.answer}>
                <Text style={styles.answerLabel}>讲解</Text>
                <Text selectable style={styles.answerText}>{turn.answer}</Text>
                {turn.examples?.map((example, index) => (
                  <View key={`${turn.id}-example-${index}`} style={styles.example}>
                    <RubyText segments={example.japanese} size={17} />
                    <Text selectable style={styles.exampleMeaning}>{example.chinese}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
          <TextInput
            value={input}
            onChangeText={onChangeInput}
            placeholder="哪里还没理解？继续问"
            placeholderTextColor={colors.placeholder}
            multiline
            textAlignVertical="top"
            style={styles.input}
          />
          <PrimaryButton label="发送问题" icon={Send} onPress={onSubmit} loading={loading} disabled={!input.trim()} />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { borderTopWidth: 2, borderBottomWidth: 1, borderColor: colors.ink },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0 },
  count: { minWidth: 20, height: 20, borderRadius: 10, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.accentSoft, color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  body: { gap: 14, paddingBottom: 16 },
  turn: { gap: 10 },
  questionBubble: { alignSelf: 'flex-end', maxWidth: '90%', backgroundColor: colors.raised, borderRadius: radii.md, padding: 11, gap: 3 },
  questionLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0 },
  question: { color: colors.ink, fontSize: 14, lineHeight: 21, letterSpacing: 0 },
  answer: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 11, gap: 7 },
  answerLabel: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  answerText: { color: colors.charcoal, fontSize: 14, lineHeight: 22, letterSpacing: 0 },
  example: { backgroundColor: colors.sunken, borderRadius: radii.sm, padding: 11, gap: 5 },
  exampleMeaning: { color: colors.muted, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  input: { minHeight: 82, maxHeight: 150, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.ink, fontSize: 14, lineHeight: 21, padding: 12, letterSpacing: 0 },
});
