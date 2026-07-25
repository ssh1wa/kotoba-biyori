import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { AppColors, useThemedStyles } from '../theme';
import { FuriganaSegment } from '../types';
import { furiganaReading, normalizeFuriganaSegments } from '../lib/furigana';

type Props = {
  segments: FuriganaSegment[];
  size?: number;
  color?: string;
  containerStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  centered?: boolean;
};

export function RubyText({
  segments,
  size = 22,
  color: requestedColor,
  containerStyle,
  textStyle,
  centered = false,
}: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const color = requestedColor || colors.ink;
  if (!segments?.length) return null;

  const readingSize = Math.max(9, Math.round(size * 0.46));
  const normalizedSegments = normalizeFuriganaSegments(segments);

  return (
    <View
      accessibilityLabel={segments.map((item) => item.text).join('')}
      style={[
        styles.line,
        centered && styles.centered,
        { rowGap: Math.max(8, readingSize * 0.65) },
        containerStyle,
      ]}
    >
      {normalizedSegments.map((segment, index) => {
        const reading = furiganaReading(segment);
        return (
        <View key={`${segment.text}-${index}`} style={styles.segment}>
          <Text
            numberOfLines={1}
            style={[
              styles.reading,
              {
                color: reading ? colors.muted : 'transparent',
                fontSize: readingSize,
                lineHeight: readingSize + 3,
              },
            ]}
          >
            {reading || '\u00a0'}
          </Text>
          <Text
            selectable
            style={[
              styles.base,
              { color, fontSize: size, lineHeight: Math.round(size * 1.32) },
              textStyle,
            ]}
          >
            {segment.text}
          </Text>
        </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  centered: {
    justifyContent: 'center',
  },
  segment: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  reading: {
    minHeight: 12,
    letterSpacing: 0,
    textAlign: 'center',
  },
  base: {
    fontWeight: '500',
    letterSpacing: 0,
  },
});
