import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Target, Trophy } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { font, KICKER_SPACING } from '@/constants/typography';

interface ShootoutTeam {
  displayName: string;
  logo: string;
}

interface Props {
  home: ShootoutTeam;
  away: ShootoutTeam;
  shootout: { home: number; away: number };
  homeColor: string;
  awayColor: string;
}

/**
 * Shown when a match is decided on penalties — both teams with their shootout
 * tally and the winner marked. Rendered as an extra card in the Overview tab.
 */
export function PenaltyShootoutCard({ home, away, shootout, homeColor, awayColor }: Props) {
  const colors = useColors();
  const homeWon = shootout.home > shootout.away;
  const awayWon = shootout.away > shootout.home;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
      <View style={styles.header}>
        <Target size={13} color={colors.primary} strokeWidth={2.4} />
        <Text style={[styles.kicker, { color: colors.mutedForeground }]}>PENALTY SHOOTOUT</Text>
      </View>

      <Row
        team={home}
        tally={shootout.home}
        won={homeWon}
        accent={homeColor}
        colors={colors}
      />
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />
      <Row
        team={away}
        tally={shootout.away}
        won={awayWon}
        accent={awayColor}
        colors={colors}
      />
    </View>
  );
}

function Row({ team, tally, won, accent, colors }: {
  team: ShootoutTeam;
  tally: number;
  won: boolean;
  accent: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.logoRing, { borderColor: accent + '55' }]}>
        {team.logo ? (
          <Image source={{ uri: team.logo }} style={styles.logo} resizeMode="contain" />
        ) : (
          <View style={[styles.logo, { backgroundColor: colors.secondary, borderRadius: 15 }]} />
        )}
      </View>
      <Text
        style={[styles.name, { color: won ? colors.foreground : colors.mutedForeground, fontFamily: won ? font.displaySemi : font.displayMed }]}
        numberOfLines={1}
      >
        {team.displayName}
      </Text>
      {won ? (
        <View style={[styles.wonBadge, { backgroundColor: colors.primary + '1F', borderColor: colors.primary + '55' }]}>
          <Trophy size={12} color={colors.primary} fill={colors.primary} strokeWidth={2} />
        </View>
      ) : null}
      <Text style={[styles.tally, { color: won ? colors.primary : colors.mutedForeground }]}>{tally}</Text>
    </View>
  );
}

const LOGO = 30;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  kicker: { fontSize: 11.5, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  logoRing: {
    width: LOGO + 6,
    height: LOGO + 6,
    borderRadius: (LOGO + 6) / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: LOGO, height: LOGO },
  name: { flex: 1, fontSize: 16, letterSpacing: 0.3, textTransform: 'uppercase' },
  wonBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tally: { fontSize: 30, fontFamily: font.displayBold, letterSpacing: 0.5, minWidth: 26, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: LOGO + 18 },
});
