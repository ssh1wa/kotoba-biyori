import React from 'react';
import { BookMarked, MessageCircle, Languages, NotebookPen, LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors, useThemedStyles } from '../theme';

export type TabKey = 'translate' | 'practice' | 'roleplay' | 'wordbook';

const tabs: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'translate', label: '互译', icon: Languages },
  { key: 'practice', label: '练习', icon: NotebookPen },
  { key: 'roleplay', label: '美绪', icon: MessageCircle },
  { key: 'wordbook', label: '生词本', icon: BookMarked },
];

export function BottomTabs({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.bar}>
      {tabs.map(({ key, label, icon: Icon }) => {
        const selected = active === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <View style={[styles.iconWrap, selected && styles.iconActive]}>
              <Icon size={20} color={selected ? colors.onPrimary : colors.muted} strokeWidth={2.1} />
            </View>
            <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  bar: {
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 22,
  },
  item: { flex: 1, height: 62, alignItems: 'center', justifyContent: 'center', gap: 3 },
  pressed: { opacity: 0.65 },
  iconWrap: { width: 34, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.accent },
  label: { fontSize: 11, color: colors.muted, fontWeight: '600', letterSpacing: 0 },
  labelActive: { color: colors.ink, fontWeight: '700' },
});
