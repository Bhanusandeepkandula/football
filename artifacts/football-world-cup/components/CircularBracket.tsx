import React from 'react';
import { View, StyleSheet, Image, Text, Dimensions } from 'react-native';
import { Svg, Path, Circle as SvgCircle } from 'react-native-svg';
import { Trophy } from 'lucide-react-native';
import { BracketRound, EspnCompetitor, hasStarted } from '@/hooks/useWorldCup';
import { useColors } from '@/hooks/useColors';
import { font, KICKER_SPACING } from '@/constants/typography';

const SCREEN_W = Dimensions.get('window').width;
const SIZE = Math.min(SCREEN_W - 28, 390);
const CX = SIZE / 2;
const CY = SIZE / 2;
const MAX_R = SIZE * 0.43;

const TEAM_R = MAX_R * 0.96;
const ROUND_R = [MAX_R * 0.78, MAX_R * 0.58, MAX_R * 0.39, MAX_R * 0.23];
const FLAG_SIZE = 32;
const INNER_FLAG = 24;
const FINAL_HUB = 82;

interface MatchNode {
  id: string;
  angleDeg: number;
  levelIdx: number;
  matchIdx: number;
  roundName: string;
  home?: EspnCompetitor;
  away?: EspnCompetitor;
}

function polarToXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function getCompetitors(event: BracketRound['events'][number]) {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  return {
    home: competitors.find((c: EspnCompetitor) => c.homeAway === 'home'),
    away: competitors.find((c: EspnCompetitor) => c.homeAway === 'away'),
  };
}

function roundLabel(name: string): string {
  return name
    .replace('Round of ', 'R')
    .replace('Quarterfinals', 'QF')
    .replace('Semifinals', 'SF');
}

function isPlaceholderCompetitor(competitor?: EspnCompetitor): boolean {
  if (!competitor?.team) return true;
  const abbreviation = competitor.team.abbreviation?.trim().toUpperCase() ?? '';
  const name = competitor.team.displayName?.trim().toLowerCase() ?? '';
  return (
    ['TBD', 'R32', 'R16', 'QF', 'SF', 'QW'].includes(abbreviation) ||
    name.includes('winner') ||
    name.includes('semifinal') ||
    name.includes('quarterfinal') ||
    name.includes('round of')
  );
}

function realCompetitors(home?: EspnCompetitor, away?: EspnCompetitor): EspnCompetitor[] {
  return [home, away].filter((competitor): competitor is EspnCompetitor => !isPlaceholderCompetitor(competitor));
}

function winnerFrom(home?: EspnCompetitor, away?: EspnCompetitor): EspnCompetitor | undefined {
  const winner = [home, away].find((competitor) => competitor?.winner);
  return isPlaceholderCompetitor(winner) ? undefined : winner;
}

function displayCompetitor(home?: EspnCompetitor, away?: EspnCompetitor): EspnCompetitor | undefined {
  return winnerFrom(home, away) ?? realCompetitors(home, away)[0];
}

function scoreline(home?: EspnCompetitor, away?: EspnCompetitor, showScore = true): string {
  if (isPlaceholderCompetitor(home) || isPlaceholderCompetitor(away)) return '';
  if (!showScore) return 'vs';
  const homeScore = home?.score ?? '';
  const awayScore = away?.score ?? '';
  return homeScore !== '' && awayScore !== '' ? `${homeScore} - ${awayScore}` : 'vs';
}

function TeamFlag({
  competitor,
  x,
  y,
  size,
  active,
  muted,
}: {
  competitor?: EspnCompetitor;
  x: number;
  y: number;
  size: number;
  active?: boolean;
  muted?: boolean;
}) {
  const logo = competitor?.team?.logo;
  const abbr = competitor?.team?.abbreviation?.slice(0, 2) ?? '';

  return (
    <View
      style={[
        styles.flagNode,
        {
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: muted ? 0.42 : 1,
          transform: [{ scale: active ? 1.08 : 1 }],
        },
      ]}
    >
      {logo ? (
        <Image source={{ uri: logo }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
      ) : (
        <Text style={styles.flagText}>{abbr || '•'}</Text>
      )}
    </View>
  );
}

function RoundDot({ node }: { node: MatchNode }) {
  const r = ROUND_R[node.levelIdx] ?? ROUND_R[ROUND_R.length - 1];
  const pos = polarToXY(node.angleDeg, r);
  const winner = winnerFrom(node.home, node.away);
  const competitor = displayCompetitor(node.home, node.away);
  const hasTeam = !isPlaceholderCompetitor(competitor);

  if (hasTeam) {
    return <TeamFlag competitor={competitor} x={pos.x} y={pos.y} size={INNER_FLAG} active={Boolean(winner)} />;
  }

  return (
    <View
      style={[
        styles.roundDot,
        {
          left: pos.x - INNER_FLAG / 2,
          top: pos.y - INNER_FLAG / 2,
          width: INNER_FLAG,
          height: INNER_FLAG,
          borderRadius: INNER_FLAG / 2,
        },
      ]}
    >
      <Text style={styles.dotText}>{roundLabel(node.roundName)}</Text>
    </View>
  );
}

export function CircularBracket({ rounds }: { rounds: BracketRound[] }) {
  const colors = useColors();
  const knockoutRounds = rounds.filter((round) => round.name !== '3rd Place');
  const finalRound = knockoutRounds.find((round) => round.name === 'Final');
  const ringRounds = knockoutRounds.filter((round) => round.name !== 'Final').slice(0, ROUND_R.length);
  const finalMatch = finalRound?.events?.[0];
  const finalTeams: { home?: EspnCompetitor; away?: EspnCompetitor } = finalMatch ? getCompetitors(finalMatch) : {};
  const finalHasTeams = realCompetitors(finalTeams.home, finalTeams.away).length === 2;
  const finalScore = finalHasTeams ? scoreline(finalTeams.home, finalTeams.away, finalMatch ? hasStarted(finalMatch) : false) : '';

  const nodesByLevel: MatchNode[][] = ringRounds.map((round, levelIdx) => {
    const degreesPerMatch = 360 / Math.max(round.events.length, 1);
    return round.events.map((event, matchIdx) => {
      const { home, away } = getCompetitors(event);
      return {
        id: event.id,
        angleDeg: (matchIdx + 0.5) * degreesPerMatch,
        levelIdx,
        matchIdx,
        roundName: round.name,
        home,
        away,
      };
    });
  });

  const outerNodes = nodesByLevel[0] ?? [];
  const branchPaths: string[] = [];
  const goldPaths: string[] = [];

  nodesByLevel.forEach((levelNodes, levelIdx) => {
    const nextLevel = nodesByLevel[levelIdx + 1];
    levelNodes.forEach((node, childIdx) => {
      const start = polarToXY(node.angleDeg, ROUND_R[levelIdx]);
      const parent = nextLevel?.[Math.floor(childIdx / 2)];
      const end = parent
        ? polarToXY(parent.angleDeg, ROUND_R[levelIdx + 1])
        : { x: CX, y: CY };
      const midR = parent ? (ROUND_R[levelIdx] + ROUND_R[levelIdx + 1]) / 2 : ROUND_R[levelIdx] * 0.68;
      const control = polarToXY(parent?.angleDeg ?? node.angleDeg, midR);
      const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
      branchPaths.push(path);
      if (winnerFrom(node.home, node.away)) goldPaths.push(path);

      if (levelIdx === 0) {
        const spread = 360 / Math.max(levelNodes.length, 1) * 0.28;
        const homePoint = polarToXY(node.angleDeg - spread, TEAM_R);
        const awayPoint = polarToXY(node.angleDeg + spread, TEAM_R);
        branchPaths.push(`M ${homePoint.x} ${homePoint.y} L ${start.x} ${start.y} L ${awayPoint.x} ${awayPoint.y}`);
      }
    });
  });

  return (
    <View style={[styles.container, { width: SIZE, height: SIZE, backgroundColor: colors.card, borderColor: colors.hairline }]}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <SvgCircle cx={CX} cy={CY} r={MAX_R * 0.74} fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth={1} strokeDasharray="2 10" />
        <SvgCircle cx={CX} cy={CY} r={MAX_R * 0.55} fill="none" stroke="rgba(255,255,255,0.055)" strokeWidth={1} strokeDasharray="2 10" />
        <SvgCircle cx={CX} cy={CY} r={MAX_R * 0.36} fill="none" stroke="rgba(245,166,35,0.10)" strokeWidth={1} />
        <SvgCircle cx={CX} cy={CY} r={MAX_R * 0.19} fill="rgba(245,166,35,0.09)" />

        {branchPaths.map((path, i) => (
          <Path
            key={`branch-${i}`}
            d={path}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={1}
            strokeLinecap="round"
          />
        ))}

        {goldPaths.map((path, i) => (
          <Path
            key={`gold-${i}`}
            d={path}
            fill="none"
            stroke="rgba(245,166,35,0.42)"
            strokeWidth={1.1}
            strokeLinecap="round"
          />
        ))}
      </Svg>

      <View style={styles.roundRail} pointerEvents="none">
        {ringRounds.map((round, i) => (
          <View key={round.name} style={[styles.roundChip, { backgroundColor: i === 0 ? colors.primary + '22' : colors.secondary }]}>
            <Text style={[styles.roundText, { color: i === 0 ? colors.primary : colors.mutedForeground }]}>
              {roundLabel(round.name)}
            </Text>
          </View>
        ))}
      </View>

      {outerNodes.flatMap((node) => {
        const spread = 360 / Math.max(outerNodes.length, 1) * 0.28;
        const homePoint = polarToXY(node.angleDeg - spread, TEAM_R);
        const awayPoint = polarToXY(node.angleDeg + spread, TEAM_R);
        const winner = winnerFrom(node.home, node.away);
        return [
          <TeamFlag
            key={`${node.id}-home`}
            competitor={node.home}
            x={homePoint.x}
            y={homePoint.y}
            size={FLAG_SIZE}
            active={winner?.team.id === node.home?.team.id}
            muted={Boolean(winner && winner.team.id !== node.home?.team.id)}
          />,
          <TeamFlag
            key={`${node.id}-away`}
            competitor={node.away}
            x={awayPoint.x}
            y={awayPoint.y}
            size={FLAG_SIZE}
            active={winner?.team.id === node.away?.team.id}
            muted={Boolean(winner && winner.team.id !== node.away?.team.id)}
          />,
        ];
      })}

      {nodesByLevel.slice(1).flat().map((node) => (
        <RoundDot key={`${node.id}-${node.levelIdx}-${node.matchIdx}`} node={node} />
      ))}

      <View style={[styles.finalHub, { left: CX - FINAL_HUB / 2, top: CY - FINAL_HUB / 2, borderColor: colors.primary + '55', backgroundColor: colors.background }]}>
        <Text style={[styles.finalLabel, { color: colors.primary }]}>FINAL</Text>
        <View style={[styles.trophy, { backgroundColor: colors.secondary, borderColor: colors.primary + '55' }]}>
          <Trophy size={27} color={colors.primary} fill={colors.primary} />
        </View>
        <Text style={[styles.finalScore, { color: colors.foreground }]} numberOfLines={2}>
          {finalScore || 'Final'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    borderRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
  roundRail: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    gap: 6,
  },
  roundChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  roundText: {
    fontSize: 10,
    fontFamily: font.extrabold,
    letterSpacing: KICKER_SPACING * 0.7,
  },
  flagNode: {
    position: 'absolute',
    backgroundColor: '#111318',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // White ring so each cover-cropped flag reads as a clean circular badge.
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  flagText: {
    color: '#E8E8ED',
    fontSize: 8,
    fontFamily: font.extrabold,
  },
  roundDot: {
    position: 'absolute',
    backgroundColor: 'rgba(18,18,22,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: {
    color: '#8E8E93',
    fontSize: 7,
    fontFamily: font.extrabold,
  },
  finalHub: {
    position: 'absolute',
    width: FINAL_HUB,
    height: FINAL_HUB,
    borderRadius: FINAL_HUB / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  finalLabel: {
    fontSize: 9,
    fontFamily: font.extrabold,
    letterSpacing: KICKER_SPACING,
  },
  trophy: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalScore: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: font.extrabold,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
