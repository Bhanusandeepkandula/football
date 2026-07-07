import React from 'react';
import { View, Text, StyleSheet, Dimensions, Image } from 'react-native';
import { MatchPlayer, MatchTeamLineup } from '@/hooks/useMatchDetail';

const SCREEN_W = Dimensions.get('window').width;
const PITCH_W = SCREEN_W - 32;
const PITCH_H = PITCH_W * 1.35;

type PosGroup = 'GK' | 'DF' | 'MF' | 'FW';

function groupByPosition(players: MatchPlayer[]): Record<PosGroup, MatchPlayer[]> {
  const g: Record<PosGroup, MatchPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of players) g[p.positionGroup].push(p);
  return g;
}

interface PlayerDotProps {
  player: MatchPlayer;
  color: string;
  size?: number;
}

function PlayerDot({ player, color, size = 36 }: PlayerDotProps) {
  const bgColor = `#${color}`;
  return (
    <View style={styles.playerWrapper}>
      <View
        style={[
          styles.playerDot,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: player.headshot ? 'transparent' : bgColor },
        ]}
      >
        {player.headshot ? (
          <Image
            source={{ uri: player.headshot }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
          />
        ) : (
          <Text style={[styles.jerseyNum, { fontSize: size * 0.33 }]}>
            {player.jersey || player.positionGroup[0]}
          </Text>
        )}
      </View>
      <Text style={styles.playerName} numberOfLines={1}>
        {player.displayName.split(' ').pop() ?? player.displayName}
      </Text>
    </View>
  );
}

function PlayerRow({ players, color }: { players: MatchPlayer[]; color: string }) {
  if (players.length === 0) return null;
  return (
    <View style={styles.playerRow}>
      {players.map(p => (
        <PlayerDot key={p.id || p.displayName} player={p} color={color} />
      ))}
    </View>
  );
}

export function FormationPitch({ home, away }: { home: MatchTeamLineup; away: MatchTeamLineup }) {
  const homeGroups = groupByPosition(home.starters);
  const awayGroups = groupByPosition(away.starters);
  const homeColor = home.team.color || '003DA5';
  const awayColor = away.team.color || 'C8102E';

  return (
    <View style={[styles.pitch, { width: PITCH_W, height: PITCH_H }]}>
      {/* Pitch markings */}
      <View style={styles.centerCircle} />
      <View style={styles.centerLine} />
      <View style={styles.topPenalty} />
      <View style={styles.bottomPenalty} />
      <View style={styles.topGoal} />
      <View style={styles.bottomGoal} />

      {/* Formation labels */}
      <View style={styles.formationLabels}>
        <Text style={styles.formationText}>
          {away.team.displayName}{away.formation ? ` · ${away.formation}` : ''}
        </Text>
        <Text style={styles.formationText}>
          {home.team.displayName}{home.formation ? ` · ${home.formation}` : ''}
        </Text>
      </View>

      {/* Away (top half) */}
      <View style={styles.awayHalf}>
        <PlayerRow players={awayGroups.FW} color={awayColor} />
        <PlayerRow players={awayGroups.MF} color={awayColor} />
        <PlayerRow players={awayGroups.DF} color={awayColor} />
        <PlayerRow players={awayGroups.GK} color={awayColor} />
      </View>

      {/* Home (bottom half) */}
      <View style={styles.homeHalf}>
        <PlayerRow players={homeGroups.GK} color={homeColor} />
        <PlayerRow players={homeGroups.DF} color={homeColor} />
        <PlayerRow players={homeGroups.MF} color={homeColor} />
        <PlayerRow players={homeGroups.FW} color={homeColor} />
      </View>
    </View>
  );
}

const MARKING = 'rgba(255,255,255,0.25)';

const styles = StyleSheet.create({
  pitch: {
    backgroundColor: '#1A7A4A',
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  centerLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1.5, backgroundColor: MARKING },
  centerCircle: {
    position: 'absolute', top: '50%', left: '50%',
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 1.5, borderColor: MARKING,
    marginLeft: -40, marginTop: -40, backgroundColor: 'transparent',
  },
  topPenalty: {
    position: 'absolute', top: 0, left: '20%', right: '20%', height: '18%',
    borderWidth: 1.5, borderColor: MARKING, borderTopWidth: 0, backgroundColor: 'transparent',
  },
  bottomPenalty: {
    position: 'absolute', bottom: 0, left: '20%', right: '20%', height: '18%',
    borderWidth: 1.5, borderColor: MARKING, borderBottomWidth: 0, backgroundColor: 'transparent',
  },
  topGoal: {
    position: 'absolute', top: 0, left: '37%', right: '37%', height: 14,
    borderWidth: 1.5, borderColor: MARKING, borderTopWidth: 0, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bottomGoal: {
    position: 'absolute', bottom: 0, left: '37%', right: '37%', height: 14,
    borderWidth: 1.5, borderColor: MARKING, borderBottomWidth: 0, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  formationLabels: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6,
    pointerEvents: 'none',
  },
  formationText: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'Nunito_500Medium' },
  awayHalf: { flex: 1, paddingTop: 20, paddingBottom: 8, justifyContent: 'space-around' },
  homeHalf: { flex: 1, paddingTop: 8, paddingBottom: 20, justifyContent: 'space-around' },
  playerRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingHorizontal: 8 },
  playerWrapper: { alignItems: 'center', maxWidth: 52 },
  playerDot: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  jerseyNum: { color: '#fff', fontFamily: 'Nunito_700Bold' },
  playerName: {
    color: '#fff', fontSize: 9, fontFamily: 'Nunito_600SemiBold',
    marginTop: 2, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    maxWidth: 50,
  },
});
