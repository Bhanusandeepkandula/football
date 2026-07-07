import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MatchEvent, MatchEventType } from '@/hooks/useMatchDetail';
import { Goal, Square, RectangleVertical, ArrowLeftRight, Video } from 'lucide-react-native';

interface MatchTimelineProps {
  events: MatchEvent[];
  homeTeamId?: string;
  awayTeamId?: string;
}

function getEventIcon(type: MatchEventType, color: string) {
  const size = 16;
  switch (type) {
    case 'goal': return <Goal size={size} color={color} fill={color} />;
    case 'yellow-card': return <Square size={size} color="#F5A623" fill="#F5A623" />;
    case 'red-card': return <RectangleVertical size={size} color="#E74C3C" fill="#E74C3C" />;
    case 'substitution': return <ArrowLeftRight size={size} color={color} />;
    case 'var': return <Video size={size} color={color} />;
    default: return <Square size={size} color={color} />;
  }
}

function getEventLabel(type: MatchEventType) {
  switch (type) {
    case 'goal': return 'GOAL';
    case 'yellow-card': return 'YELLOW';
    case 'red-card': return 'RED CARD';
    case 'substitution': return 'SUB';
    case 'var': return 'VAR';
    default: return '';
  }
}

export function MatchTimeline({ events, homeTeamId }: MatchTimelineProps) {
  const colors = useColors();

  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No key events yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {events.map((ev, idx) => {
        const isHome = ev.teamId === homeTeamId;
        const isGoal = ev.type === 'goal';
        const iconColor = isGoal ? colors.primary : colors.foreground;

        return (
          <View key={ev.id + idx} style={styles.eventRow}>
            {/* Home side */}
            <View style={[styles.eventSide, styles.homeSide]}>
              {isHome && (
                <View style={[styles.eventContent, styles.homeContent]}>
                  <Text style={[styles.playerText, { color: colors.foreground }]} numberOfLines={1}>
                    {ev.playerName || ev.text.split(' – ')[0]}
                  </Text>
                  {getEventIcon(ev.type, iconColor)}
                </View>
              )}
            </View>

            {/* Clock bubble */}
            <View style={[styles.clockBubble, { backgroundColor: isGoal ? colors.primary : colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.clockText, { color: isGoal ? colors.primaryForeground : colors.mutedForeground }]}>
                {ev.clock}′
              </Text>
            </View>

            {/* Away side */}
            <View style={[styles.eventSide, styles.awaySide]}>
              {!isHome && (
                <View style={[styles.eventContent, styles.awayContent]}>
                  {getEventIcon(ev.type, iconColor)}
                  <Text style={[styles.playerText, { color: colors.foreground }]} numberOfLines={1}>
                    {ev.playerName || ev.text.split(' – ')[0]}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventSide: {
    flex: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  homeSide: {
    alignItems: 'flex-end',
  },
  awaySide: {
    alignItems: 'flex-start',
  },
  eventContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  homeContent: {
    flexDirection: 'row-reverse',
  },
  awayContent: {
    flexDirection: 'row',
  },
  playerText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    flexShrink: 1,
  },
  clockBubble: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 44,
    alignItems: 'center',
  },
  clockText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  empty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
