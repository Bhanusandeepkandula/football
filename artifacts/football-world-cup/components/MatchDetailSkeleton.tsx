import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

function ShimmerBlock({
  style,
  delay = 0,
}: {
  style: object;
  delay?: number;
}) {
  const colors = useColors();
  const pulse = useSharedValue(0.32);

  useEffect(() => {
    const timer = setTimeout(() => {
      pulse.value = withRepeat(
        withTiming(0.62, { duration: 1050, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, pulse]);

  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[style, { backgroundColor: colors.muted }, animStyle]}
    />
  );
}

export function MatchDetailSkeleton({ bottomPad = 40 }: { bottomPad?: number }) {
  const colors = useColors();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
    >
      <View style={styles.heroWrap}>
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
          <View style={styles.heroTeams}>
            <View style={styles.heroTeam}>
              <ShimmerBlock style={styles.logo} />
              <ShimmerBlock style={styles.teamName} delay={80} />
              <ShimmerBlock style={styles.teamCode} delay={120} />
            </View>
            <View style={styles.heroCenter}>
              <ShimmerBlock style={styles.status} delay={40} />
              <ShimmerBlock style={styles.score} delay={60} />
              <ShimmerBlock style={styles.timeBadge} delay={100} />
            </View>
            <View style={styles.heroTeam}>
              <ShimmerBlock style={styles.logo} delay={90} />
              <ShimmerBlock style={styles.teamName} delay={110} />
              <ShimmerBlock style={styles.teamCode} delay={140} />
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.tabsRow, { borderBottomColor: colors.separator }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <ShimmerBlock key={i} style={styles.tabPill} delay={i * 50} />
        ))}
      </View>

      <View style={styles.sections}>
        <ShimmerBlock style={styles.sectionTitle} />
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
          <ShimmerBlock style={styles.barWide} delay={70} />
          <ShimmerBlock style={styles.barMedium} delay={110} />
          <ShimmerBlock style={styles.barMedium} delay={150} />
          <ShimmerBlock style={styles.barWide} delay={190} />
        </View>

        <ShimmerBlock style={styles.sectionTitle} delay={60} />
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
          <ShimmerBlock style={styles.chart} delay={90} />
        </View>

        <ShimmerBlock style={styles.sectionTitle} delay={120} />
        <View style={[styles.sectionCard, styles.sectionCardTall, { backgroundColor: colors.card, borderColor: colors.separator }]}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <ShimmerBlock key={i} style={styles.row} delay={80 + i * 40} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 10,
    flexGrow: 1,
  },
  heroWrap: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 22,
    paddingHorizontal: 12,
  },
  heroTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTeam: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  heroCenter: {
    width: 108,
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  teamName: {
    width: 72,
    height: 10,
    borderRadius: 5,
  },
  teamCode: {
    width: 36,
    height: 8,
    borderRadius: 4,
  },
  status: {
    width: 64,
    height: 8,
    borderRadius: 4,
  },
  score: {
    width: 88,
    height: 34,
    borderRadius: 8,
  },
  timeBadge: {
    width: 40,
    height: 18,
    borderRadius: 9,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabPill: {
    width: 78,
    height: 34,
    borderRadius: 17,
  },
  sections: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 18,
  },
  sectionTitle: {
    width: 120,
    height: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  // Bottom card grows to fill whatever height remains, hinting more content below.
  sectionCardTall: {
    flex: 1,
    minHeight: 220,
  },
  barWide: {
    height: 10,
    borderRadius: 5,
    width: '100%',
  },
  barMedium: {
    height: 10,
    borderRadius: 5,
    width: '82%',
    alignSelf: 'center',
  },
  chart: {
    height: 150,
    borderRadius: 12,
    width: '100%',
  },
  row: {
    height: 14,
    borderRadius: 7,
    width: '100%',
  },
});
