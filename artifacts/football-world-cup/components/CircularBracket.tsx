import React from 'react';
import { View, StyleSheet, Image, Text, Dimensions } from 'react-native';
import { Svg, Line, Circle as SvgCircle } from 'react-native-svg';
import { BracketRound, EspnCompetitor } from '@/hooks/useWorldCup';

const SCREEN_W = Dimensions.get('window').width;
const SIZE = Math.min(SCREEN_W - 24, 420);
const CX = SIZE / 2;
const CY = SIZE / 2;
const MAX_R = SIZE * 0.47;

/** Radius fractions for each round, outermost first */
const LEVEL_R = [0.92, 0.70, 0.51, 0.33, 0.17];
const LEVEL_LOGO = [28, 23, 19, 16, 14];

/** Midpoint bracket connector radius (between this level and inner level) */
function bracketR(levelIdx: number): number {
  const outer = LEVEL_R[levelIdx] * MAX_R;
  const inner = levelIdx + 1 < LEVEL_R.length ? LEVEL_R[levelIdx + 1] * MAX_R : outer * 0.6;
  return (outer + inner) / 2;
}

function polarToXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

interface TeamSlot {
  logo: string;
  abbr: string;
  angleDeg: number;
  levelIdx: number;
  matchIdx: number;
  side: 'home' | 'away';
}

interface BracketLine {
  x1: number; y1: number;
  x2: number; y2: number;
}

export function CircularBracket({ rounds }: { rounds: BracketRound[] }) {
  const slots: TeamSlot[] = [];
  const lines: BracketLine[] = [];

  rounds.forEach((round, levelIdx) => {
    if (levelIdx >= LEVEL_R.length) return;
    const totalTeams = round.events.length * 2;
    const degreesPerSlot = 360 / Math.max(totalTeams, 2);
    const r = LEVEL_R[levelIdx] * MAX_R;
    const bR = bracketR(levelIdx);

    round.events.forEach((ev, matchIdx) => {
      const comp = ev.competitions?.[0];
      const competitors = comp?.competitors ?? [];
      const home = competitors.find((c: EspnCompetitor) => c.homeAway === 'home');
      const away = competitors.find((c: EspnCompetitor) => c.homeAway === 'away');

      // slot indices for this match: home = matchIdx*2, away = matchIdx*2+1
      const homeSlot = matchIdx * 2;
      const awaySlot = matchIdx * 2 + 1;
      const homeAngle = homeSlot * degreesPerSlot;
      const awayAngle = awaySlot * degreesPerSlot;
      const midAngle = (homeAngle + awayAngle) / 2;

      // Team slots
      if (home) slots.push({ logo: home.team.logo, abbr: home.team.abbreviation, angleDeg: homeAngle, levelIdx, matchIdx, side: 'home' });
      if (away) slots.push({ logo: away.team.logo, abbr: away.team.abbreviation, angleDeg: awayAngle, levelIdx, matchIdx, side: 'away' });

      // Bracket connector lines
      const homePos = polarToXY(homeAngle, r);
      const awayPos = polarToXY(awayAngle, r);
      const midPos = polarToXY(midAngle, bR);

      lines.push({ x1: homePos.x, y1: homePos.y, x2: midPos.x, y2: midPos.y });
      lines.push({ x1: awayPos.x, y1: awayPos.y, x2: midPos.x, y2: midPos.y });

      // Line from midpoint toward inner ring (only if not deepest round)
      if (levelIdx + 1 < LEVEL_R.length && levelIdx + 1 < rounds.length) {
        const innerR = LEVEL_R[levelIdx + 1] * MAX_R;
        const innerPos = polarToXY(midAngle, innerR);
        lines.push({ x1: midPos.x, y1: midPos.y, x2: innerPos.x, y2: innerPos.y });
      }
    });
  });

  return (
    <View style={[styles.container, { width: SIZE, height: SIZE }]}>
      {/* SVG layer: rings + connector lines */}
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        {/* Soft glow behind trophy */}
        <SvgCircle cx={CX} cy={CY} r={MAX_R * 0.22} fill="rgba(245,166,35,0.12)" />
        <SvgCircle cx={CX} cy={CY} r={MAX_R * 0.13} fill="rgba(245,166,35,0.18)" />

        {/* Concentric ring guides */}
        {LEVEL_R.map((r, i) => (
          <SvgCircle
            key={`ring-${i}`}
            cx={CX} cy={CY}
            r={r * MAX_R}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        ))}

        {/* Bracket connector lines */}
        {lines.map((l, i) => (
          <Line
            key={`line-${i}`}
            x1={l.x1} y1={l.y1}
            x2={l.x2} y2={l.y2}
            stroke="rgba(245,166,35,0.35)"
            strokeWidth={1.2}
          />
        ))}
      </Svg>

      {/* Team logo badges */}
      {slots.map((slot, i) => {
        const r = LEVEL_R[slot.levelIdx] * MAX_R;
        const pos = polarToXY(slot.angleDeg, r);
        const logoSize = LEVEL_LOGO[slot.levelIdx] ?? 22;
        const totalSize = logoSize + 4;

        return (
          <View
            key={`slot-${i}`}
            style={[
              styles.badge,
              {
                left: pos.x - totalSize / 2,
                top: pos.y - totalSize / 2,
                width: totalSize,
                height: totalSize,
                borderRadius: totalSize / 2,
              },
            ]}
          >
            {slot.logo ? (
              <Image
                source={{ uri: slot.logo }}
                style={{ width: logoSize, height: logoSize, borderRadius: logoSize / 2 }}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.badgePlaceholder, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]}>
                <Text style={styles.badgeText}>{slot.abbr?.slice(0, 2) ?? '?'}</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Trophy at center */}
      <View style={[styles.trophy, { left: CX - 28, top: CY - 28, width: 56, height: 56 }]}>
        <Text style={styles.trophyEmoji}>🏆</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    backgroundColor: '#0A0E1A',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    backgroundColor: '#141828',
    borderWidth: 1.5,
    borderColor: 'rgba(245,166,35,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgePlaceholder: {
    backgroundColor: '#1E2D45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#8899AA',
    fontSize: 7,
    fontFamily: 'Inter_700Bold',
  },
  trophy: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0E1A',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(245,166,35,0.5)',
  },
  trophyEmoji: {
    fontSize: 28,
  },
});
