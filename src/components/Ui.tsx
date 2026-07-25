import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { AppColors, radii, useThemedStyles } from '../theme';

export function SectionTitle({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.headingWrap}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  icon: Icon,
  onPress,
  loading,
  disabled,
  style,
}: {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} size="small" />
      ) : Icon ? (
        <Icon size={19} color={colors.onPrimary} strokeWidth={2.2} />
      ) : null}
      <Text style={styles.primaryLabel}>{loading ? '请稍候' : label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
    >
      <Icon size={21} color={colors.charcoal} strokeWidth={2} />
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { label, style, ...inputProps } = props;
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.placeholder}
        {...inputProps}
        style={[styles.field, style]}
      />
    </View>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.errorNotice}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  headingWrap: { gap: 3 },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0,
  },
  primaryButton: {
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
  },
  primaryLabel: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.raised,
  },
  iconPressed: { opacity: 0.65 },
  fieldWrap: { gap: 7 },
  fieldLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  field: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
    letterSpacing: 0,
  },
  errorNotice: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  errorText: { color: colors.dangerText, fontSize: 13, lineHeight: 19, letterSpacing: 0 },
});
