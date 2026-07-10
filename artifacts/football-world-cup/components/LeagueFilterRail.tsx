import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { ORDERED_LEAGUES } from '@/hooks/useMultiLeague';
import { LeagueLogo } from '@/components/LeagueLogo';
import { font } from '@/constants/typography';

/**
 * Horizontal competition filter for the home feed. "All" aggregates every
 * league (World Cup first); tapping a specific competition scopes the feed to
 * it (and switches the app's active league so the other tabs follow).
 */
export function LeagueFilterRail({ scope, onSelect }: { scope: string; onSelect: (scope: string) => void }) {
  const colors = useColors();

  const chipStyle = (active: boolean) => [
    styles.chip,
    { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.hairline },
  ];
  const textStyle = (active: boolean) => [
    styles.chipText,
    { color: active ? colors.primaryForeground : colors.foreground },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      <TouchableOpacity
        onPress={() => onSelect('all')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: scope === 'all' }}
        style={chipStyle(scope === 'all')}
      >
        <Globe size={15} color={scope === 'all' ? colors.primaryForeground : colors.mutedForeground} strokeWidth={2.4} />
        <Text style={textStyle(scope === 'all')}>All</Text>
      </TouchableOpacity>

      {ORDERED_LEAGUES.map((l) => {
        const active = scope === l.slug;
        return (
          <TouchableOpacity
            key={l.slug}
            onPress={() => onSelect(l.slug)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={l.name}
            style={chipStyle(active)}
          >
            <LeagueLogo league={l} size={16} />
            <Text style={textStyle(active)} numberOfLines={1}>{l.short}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: 16, gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontFamily: font.bold, maxWidth: 130 },
});
