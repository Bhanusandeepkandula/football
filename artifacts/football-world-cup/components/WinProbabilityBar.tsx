import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { font } from '@/constants/typography';

/** Home / draw / away stacked probability bar with % labels. Reused by the
 *  Overview (pre-match prediction) and the Gamecast (live) panels. */
export function WinProbabilityBar({
  home,
  draw,
  away,
  homeColor,
  awayColor,
  homeLabel,
  awayLabel,
  caption,
}: {
  home: number;
  draw: number;
  away: number;
  homeColor: string;
  awayColor: string;
  homeLabel: string;
  awayLabel: string;
  caption?: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <View style={styles.track}>
        <View style={{ flex: Math.max(home, 0.1), backgroundColor: homeColor }} />
        {draw > 0 ? <View style={{ flex: Math.max(draw, 0.1), backgroundColor: colors.muted }} /> : null}
        <View style={{ flex: Math.max(away, 0.1), backgroundColor: awayColor }} />
      </View>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={1}>{homeLabel} {home}%</Text>
        {draw > 0 ? <Text style={[styles.label, { color: colors.mutedForeground, textAlign: 'center' }]} numberOfLines={1}>Draw {draw}%</Text> : null}
        <Text style={[styles.label, { color: colors.foreground, textAlign: 'right' }]} numberOfLines={1}>{away}% {awayLabel}</Text>
      </View>
      {caption ? <Text style={[styles.caption, { color: colors.mutedForeground }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  track: { height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', marginBottom: 10 },
  labels: { flexDirection: 'row', alignItems: 'center' },
  label: { flex: 1, fontSize: 12, fontFamily: font.extrabold },
  caption: { fontSize: 10.5, fontFamily: font.medium, marginTop: 8 },
});
