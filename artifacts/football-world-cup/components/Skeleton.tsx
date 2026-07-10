import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

/**
 * A single pulsing container — wrap skeleton boxes in this so ONE animation
 * drives the whole placeholder group (instead of one animation per box).
 */
export function Skeleton({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const pulse = useSharedValue(0.45);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.8, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const anim = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** A muted placeholder block. Use inside <Skeleton>. */
export function SkeletonBox({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const colors = useColors();
  return <View style={[styles.box, { backgroundColor: colors.muted }, style]} />;
}

const styles = StyleSheet.create({
  box: { borderRadius: 8 },
});
