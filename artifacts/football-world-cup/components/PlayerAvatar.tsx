import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { usePlayerPhoto } from '@/hooks/usePlayerPhoto';
import { font } from '@/constants/typography';

interface Props {
  id?: string;
  name?: string;
  /** ESPN headshot if present — used directly, no fallback fetch. */
  headshot?: string;
  club?: string;
  size?: number;
  radius?: number;
  fallback?: string;
  borderColor?: string;
  style?: ViewStyle;
}

/**
 * Player photo used across the whole UI. Falls back to TheSportsDB (via
 * usePlayerPhoto) when ESPN has no headshot, so squads, lineups and leaders all
 * show real photos — resolving lazily and cached, never blocking the row.
 */
export function PlayerAvatar({ id, name, headshot, club, size = 40, radius, fallback, borderColor, style }: Props) {
  const colors = useColors();
  const photo = usePlayerPhoto({ id, name, headshot, club });
  const r = radius ?? size / 2;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          overflow: 'hidden',
          backgroundColor: colors.secondary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: borderColor ? 1.5 : 0,
          borderColor,
        },
        style,
      ]}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Text style={[styles.fallback, { color: colors.mutedForeground, fontSize: size * 0.34 }]} numberOfLines={1}>
          {fallback ?? '?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ fallback: { fontFamily: font.bold } });
