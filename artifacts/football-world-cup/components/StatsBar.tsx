import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { MatchStat } from '@/hooks/useMatchDetail';

interface StatRowProps {
  stat: MatchStat;
  index: number;
  homeColor: string;
  awayColor: string;
}

function StatRow({ stat, index, homeColor, awayColor }: StatRowProps) {
  const colors = useColors();
  const homeW = useSharedValue(0);
  const awayW = useSharedValue(0);

  React.useEffect(() => {
    homeW.value = withDelay(index * 80, withTiming(stat.homePercent, { duration: 600 }));
    awayW.value = withDelay(index * 80, withTiming(100 - stat.homePercent, { duration: 600 }));
  }, [stat.homePercent]);

  const homeStyle = useAnimatedStyle(() => ({
    width: `${homeW.value}%`,
  }));
  const awayStyle = useAnimatedStyle(() => ({
    width: `${awayW.value}%`,
  }));

  return (
    <View style={styles.statRow}>
      <Text style={[styles.statValue, styles.homeValue, { color: colors.foreground }]}>
        {stat.homeValue}
      </Text>
      <View style={styles.barContainer}>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
          {stat.displayName}
        </Text>
        <View style={[styles.barTrack, { backgroundColor: colors.secondary }]}>
          <Animated.View style={[styles.homeBar, homeStyle, { backgroundColor: homeColor }]} />
          <Animated.View style={[styles.awayBar, awayStyle, { backgroundColor: awayColor }]} />
        </View>
      </View>
      <Text style={[styles.statValue, styles.awayValue, { color: colors.foreground }]}>
        {stat.awayValue}
      </Text>
    </View>
  );
}

interface StatsBarProps {
  stats: MatchStat[];
  homeColor: string;
  awayColor: string;
}

export function StatsBar({ stats, homeColor, awayColor }: StatsBarProps) {
  const colors = useColors();

  if (stats.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          Stats not available yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {stats.map((stat, i) => (
        <StatRow
          key={stat.name}
          stat={stat}
          index={i}
          homeColor={homeColor}
          awayColor={awayColor}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 14,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    width: 40,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  homeValue: {
    textAlign: 'right',
  },
  awayValue: {
    textAlign: 'left',
  },
  barContainer: {
    flex: 1,
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  barTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  homeBar: {
    height: '100%',
  },
  awayBar: {
    height: '100%',
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
