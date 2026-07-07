import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MatchEvent, MatchEventType } from '@/hooks/useMatchDetail';
import {
  Goal,
  Square,
  RectangleVertical,
  ArrowLeftRight,
  Video,
  Flag,
  CircleDot,
} from 'lucide-react-native';

interface TeamRef {
  id: string;
  displayName: string;
  logo: string;
  color: string;
}

interface EventsTimelineProps {
  events: MatchEvent[];
  homeTeam: TeamRef;
  awayTeam: TeamRef;
}

const CARD_COLORS: Record<MatchEventType, string> = {
  goal: '#F5A623',
  'yellow-card': '#F5A623',
  'red-card': '#E74C3C',
  substitution: '#34C759',
  var: '#0A84FF',
  other: '#8E8E93',
};

function EventIcon({ type, color }: { type: MatchEventType; color: string }) {
  const size = 15;
  switch (type) {
    case 'goal':
      return <Goal size={size} color="#111114" fill="#111114" />;
    case 'yellow-card':
      return <Square size={13} color="#111114" fill="#111114" />;
    case 'red-card':
      return <RectangleVertical size={13} color="#fff" fill="#fff" />;
    case 'substitution':
      return <ArrowLeftRight size={size} color="#fff" strokeWidth={2.6} />;
    case 'var':
      return <Video size={size} color="#fff" strokeWidth={2.4} />;
    default:
      return <CircleDot size={size} color="#fff" strokeWidth={2.4} />;
  }
}

function periodLabel(p: number): string {
  switch (p) {
    case 1:
      return '1st Half';
    case 2:
      return '2nd Half';
    case 3:
    case 4:
      return 'Extra Time';
    case 5:
      return 'Penalties';
    default:
      return '';
  }
}

export function EventsTimeline({ events, homeTeam, awayTeam }: EventsTimelineProps) {
  const colors = useColors();

  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Flag size={40} color={colors.mutedForeground} strokeWidth={1.6} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No key events yet</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
          Goals, cards and subs will appear here
        </Text>
      </View>
    );
  }

  let lastPeriod = -1;

  return (
    <View style={styles.container}>
      <View style={[styles.spine, { backgroundColor: colors.separator }]} />

      {events.map((ev, idx) => {
        const isHome = ev.teamId === homeTeam.id;
        const team = isHome ? homeTeam : awayTeam;
        const accent = CARD_COLORS[ev.type];
        const showPeriod = ev.period !== lastPeriod;
        lastPeriod = ev.period;
        const label = periodLabel(ev.period);

        return (
          <View key={ev.id + idx}>
            {showPeriod && label ? (
              <View style={styles.periodRow}>
                <View style={[styles.periodLine, { backgroundColor: colors.separator }]} />
                <Text style={[styles.periodText, { color: colors.mutedForeground }]}>
                  {label.toUpperCase()}
                </Text>
                <View style={[styles.periodLine, { backgroundColor: colors.separator }]} />
              </View>
            ) : null}

            <View style={styles.row}>
              {/* Node on the spine */}
              <View style={styles.nodeCol}>
                <View
                  style={[
                    styles.node,
                    {
                      backgroundColor: accent,
                      borderColor: colors.background,
                    },
                  ]}
                >
                  <EventIcon type={ev.type} color={accent} />
                </View>
              </View>

              {/* Event card */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.separator },
                ]}
              >
                <View style={[styles.cardAccent, { backgroundColor: `#${team.color}` }]} />

                <View style={styles.cardBody}>
                  {/* Header: type label + minute (+ score for goals) */}
                  <View style={styles.cardHeader}>
                    <Text style={[styles.typeLabel, { color: accent }]}>
                      {ev.typeLabel.toUpperCase()}
                    </Text>
                    <View style={styles.headerRight}>
                      {ev.type === 'goal' && ev.scoreHome != null ? (
                        <View style={[styles.scorePill, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.scorePillText, { color: colors.foreground }]}>
                            {ev.scoreHome}–{ev.scoreAway}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={[styles.minute, { color: colors.foreground }]}>{ev.clock}</Text>
                    </View>
                  </View>

                  {/* Player + team flag */}
                  <View style={styles.playerRow}>
                    {team.logo ? (
                      <Image source={{ uri: team.logo }} style={styles.flag} resizeMode="contain" />
                    ) : (
                      <View style={[styles.flagPlaceholder, { backgroundColor: `#${team.color}` }]} />
                    )}
                    <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>
                      {ev.playerName || ev.text}
                    </Text>
                  </View>

                  {/* Secondary line: assist / player off */}
                  {ev.secondaryName ? (
                    <View style={styles.secondaryRow}>
                      <Text style={[styles.secondaryLabel, { color: colors.mutedForeground }]}>
                        {ev.type === 'goal' ? 'Assist' : ev.type === 'substitution' ? 'Off' : ''}
                      </Text>
                      <Text style={[styles.secondaryName, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {ev.secondaryName}
                      </Text>
                    </View>
                  ) : null}

                  {/* Descriptive detail */}
                  {ev.detail ? (
                    <Text style={[styles.detail, { color: colors.mutedForeground }]}>{ev.detail}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const SPINE_X = 34; // center of the node column

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: 'relative',
  },
  spine: {
    position: 'absolute',
    left: 16 + SPINE_X - 1,
    top: 12,
    bottom: 12,
    width: 2,
    borderRadius: 1,
  },

  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
    marginLeft: SPINE_X + 12,
  },
  periodLine: { flex: 1, height: StyleSheet.hairlineWidth },
  periodText: { fontSize: 11, fontFamily: 'Nunito_700Bold', letterSpacing: 0.8 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  nodeCol: {
    width: SPINE_X * 2,
    alignItems: 'center',
    paddingTop: 4,
  },
  node: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },

  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  typeLabel: { fontSize: 11, fontFamily: 'Nunito_800ExtraBold', letterSpacing: 0.6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scorePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  scorePillText: { fontSize: 12, fontFamily: 'Nunito_800ExtraBold' },
  minute: { fontSize: 13, fontFamily: 'Nunito_800ExtraBold' },

  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flag: { width: 20, height: 14, borderRadius: 2 },
  flagPlaceholder: { width: 20, height: 14, borderRadius: 2 },
  playerName: { flex: 1, fontSize: 15, fontFamily: 'Nunito_700Bold' },

  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  secondaryLabel: {
    fontSize: 10,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  secondaryName: { flex: 1, fontSize: 13, fontFamily: 'Nunito_500Medium' },

  detail: { fontSize: 13, fontFamily: 'Nunito_400Regular', marginTop: 6, lineHeight: 18 },

  empty: { paddingVertical: 40, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 15, fontFamily: 'Nunito_600SemiBold', marginTop: 6 },
  emptySub: { fontSize: 13, fontFamily: 'Nunito_400Regular' },
});
