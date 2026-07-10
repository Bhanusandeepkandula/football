import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

export interface CompareProgressBarProps {
  /** Home share of the total (0–100). Away uses the remainder unless `awayPct` is set. */
  homePct: number;
  awayPct?: number;
  homeColor: string;
  awayColor: string;
  height?: number;
  animated?: boolean;
  style?: ViewStyle;
}

export function comparePct(home: number, away: number): { homePct: number; awayPct: number } {
  const total = home + away;
  if (total <= 0) return { homePct: 50, awayPct: 50 };
  const homePct = (home / total) * 100;
  return { homePct, awayPct: 100 - homePct };
}

const DEFAULT_HEIGHT = 5;

export function CompareProgressBar({
  homePct,
  awayPct,
  homeColor,
  awayColor,
  height = DEFAULT_HEIGHT,
  animated = true,
  style,
}: CompareProgressBarProps) {
  const colors = useColors();
  const away = awayPct ?? 100 - homePct;
  const home = Math.max(0, Math.min(100, homePct));
  const awayShare = Math.max(0, Math.min(100, away));

  const grow = useSharedValue(animated ? 0 : 1);
  useEffect(() => {
    grow.value = animated
      ? withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
      : 1;
  }, [animated, home, awayShare, grow]);

  const homeStyle = useAnimatedStyle(() => ({
    width: `${Math.max(home * grow.value, home > 0 ? 0.8 : 0)}%`,
  }));

  const awayStyle = useAnimatedStyle(() => ({
    width: `${Math.max(awayShare * grow.value, awayShare > 0 ? 0.8 : 0)}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        { height, backgroundColor: colors.separator, borderRadius: height / 2 },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          styles.fillLeft,
          { backgroundColor: homeColor, borderRadius: height / 2 },
          homeStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.fill,
          styles.fillRight,
          { backgroundColor: awayColor, borderRadius: height / 2 },
          awayStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  fillLeft: {
    left: 0,
  },
  fillRight: {
    right: 0,
  },
});
