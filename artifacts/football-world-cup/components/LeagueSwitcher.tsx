import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Check } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useLeague } from '@/hooks/useLeague';
import { leaguesByRegion } from '@/config/leagues';
import { LeagueLogo } from '@/components/LeagueLogo';
import { font, KICKER_SPACING } from '@/constants/typography';

/**
 * Masthead competition selector. Shows the active competition as a tappable pill
 * (emoji + short name + chevron) and opens a sectioned picker of every supported
 * league/cup. Replaces the old static "FIFA WORLD CUP · 2026" kicker.
 */
export function LeagueSwitcher() {
  const colors = useColors();
  const { league, slug, setLeague } = useLeague();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const sections = leaguesByRegion();

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Competition: ${league.name}. Tap to change.`}
        style={styles.pill}
      >
        <LeagueLogo league={league} size={18} />
        <Text style={[styles.pillText, { color: colors.primary }]} numberOfLines={1}>
          {league.name.toUpperCase()}
        </Text>
        <ChevronDown size={15} color={colors.primary} strokeWidth={2.6} />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.cardElevated, borderColor: colors.hairline, paddingBottom: 16 + insets.bottom, maxHeight: '82%' }]}
            onPress={() => {}}
          >
            <View style={[styles.handle, { backgroundColor: colors.muted }]} />
            <Text style={[styles.kicker, { color: colors.primary }]}>COMPETITION</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Choose a league</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
              {sections.map(({ region, leagues }) => (
                <View key={region} style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{region.toUpperCase()}</Text>
                  {leagues.map((l) => {
                    const active = l.slug === slug;
                    return (
                      <TouchableOpacity
                        key={l.slug}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={l.name}
                        onPress={() => { setLeague(l.slug); setOpen(false); }}
                        style={[styles.row, { backgroundColor: active ? colors.secondary : 'transparent', borderColor: colors.hairline }]}
                      >
                        <LeagueLogo league={l} size={26} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>{l.short}</Text>
                          <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{l.name}</Text>
                        </View>
                        {active ? <Check size={18} color={colors.primary} strokeWidth={3} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  pillEmoji: { fontSize: 13 },
  pillText: { fontSize: 12, fontFamily: font.displayMed, letterSpacing: KICKER_SPACING, flexShrink: 1 },

  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 999, marginBottom: 14 },
  kicker: { fontSize: 12, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },
  title: { fontSize: 24, fontFamily: font.displayBold, letterSpacing: -0.3, marginTop: 4 },
  section: { marginTop: 14 },
  sectionLabel: { fontSize: 11, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  rowEmoji: { fontSize: 20 },
  rowName: { fontSize: 15, fontFamily: font.bold },
  rowSub: { fontSize: 12, fontFamily: font.medium, marginTop: 1 },
});
