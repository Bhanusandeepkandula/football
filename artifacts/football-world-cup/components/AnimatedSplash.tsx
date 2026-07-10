import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { font } from '@/constants/typography';

// "Matchday Board — Solari Kickoff": a stadium split-flap departure board wakes
// from an unlit LED wall and RESOLVES the tournament letter-by-letter in a
// staggered left-to-right cascade — each cell clatters through scramble glyphs
// and locks with a mechanical overshoot; every lock flashes a single frame of a
// "We Are 26" colour then snaps to gold. An LED sheen sweeps the board and the
// "Sryln" wordmark settles beneath a free-kick tracer arc. (Concept chosen by a
// multi-agent design workshop; built with reanimated + react-native-svg.)

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const NAVY_TOP = '#0B1E38';
const NAVY_BOT = '#061223';
const CELL = '#12263F';
const SEAM = '#0A1626';
const GOLD = '#F5A623';
const HOTGOLD = '#FFD37A';
const INK = '#F4F7FB';
const WE26 = ['#E5006D', '#00B7C4', '#00A85A', '#E4002B', '#6D2C91'];
const SCRAMBLE = ['#38BDF8', '#EF4B5C'];

const GLYPHS = 'ABCDEFGHKMNOPRSTUVWXYZ0123456789';
const TARGET_INDEX = 8;
const STRIP_LEN = 10;

const { width: SW, height: SH } = Dimensions.get('window');

// Kicker geometry
const KW = 21, SPW = 9, KH = 32, KFS = 21;
// Hero geometry
const HW = 56, HH = 80, HFS = 58, HGAP = 4;

const KICKER = 'MATCH CENTER';
const HERO = 'LIVE';
const RAIL_W = 240;

function buildStrip(target: string, seed: boolean): { g: string; c: string }[] {
  const strip: { g: string; c: string }[] = [];
  for (let i = 0; i < STRIP_LEN; i++) {
    if (i === TARGET_INDEX) {
      strip.push({ g: target, c: INK });
      continue;
    }
    const g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const c = seed && i === TARGET_INDEX - 2 ? SCRAMBLE[i % SCRAMBLE.length] : INK;
    strip.push({ g, c });
  }
  return strip;
}

function Cell({ char, w, h, fs, family, enterDelay, spinStart, seamIndex, seed }: {
  char: string;
  w: number;
  h: number;
  fs: number;
  family: string;
  enterDelay: number;
  spinStart: number;
  seamIndex: number;
  seed: boolean;
}) {
  const strip = useMemo(() => buildStrip(char, seed), []);
  const enter = useSharedValue(0);
  const p = useSharedValue(0);
  const flash = useSharedValue(0);
  const targetY = -(TARGET_INDEX * h);
  const lockDelay = spinStart + 540;

  useEffect(() => {
    enter.value = withDelay(enterDelay, withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }));
    // Fast spin (linear blur) then a spring "clack" settle with overshoot.
    p.value = withDelay(
      spinStart,
      withSequence(
        withTiming(0.82, { duration: 380, easing: Easing.linear }),
        withSpring(1, { damping: 14, stiffness: 170 }),
      ),
    );
    flash.value = withDelay(lockDelay, withSequence(
      withTiming(1, { duration: 70 }),
      withTiming(0, { duration: 240 }),
    ));
  }, [enter, p, flash, enterDelay, spinStart, lockDelay]);

  const cellStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.9, 1]) }],
  }));
  const reelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(p.value, [0, 1], [0, targetY]) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <Animated.View style={[{ width: w, height: h, borderRadius: 4, backgroundColor: CELL, overflow: 'hidden' }, cellStyle]}>
      <Animated.View style={reelStyle}>
        {strip.map((s, i) => (
          <Text key={i} style={{ width: w, height: h, lineHeight: h, fontSize: fs, fontFamily: family, color: s.c, textAlign: 'center' }}>
            {s.g}
          </Text>
        ))}
      </Animated.View>
      {/* top-half gloss sells two flaps */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.06)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h / 2 }} />
      {/* split seam */}
      <View style={{ position: 'absolute', top: h / 2 - 0.5, left: 0, right: 0, height: 1, backgroundColor: SEAM }} />
      {/* seam colour-snap on lock */}
      <Animated.View style={[{ position: 'absolute', top: h / 2 - 1, left: 0, right: 0, height: 2, backgroundColor: WE26[seamIndex % WE26.length] }, flashStyle]} />
    </Animated.View>
  );
}

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const rail = useSharedValue(0);
  const word = useSharedValue(0);
  const draw = useSharedValue(0);
  const sheen = useSharedValue(0);
  const container = useSharedValue(1);

  useEffect(() => {
    rail.value = withDelay(120, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
    word.value = withDelay(1640, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    draw.value = withDelay(1680, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
    sheen.value = withDelay(1780, withTiming(1, { duration: 380, easing: Easing.inOut(Easing.quad) }));
    container.value = withDelay(
      2260,
      withTiming(0, { duration: 320, easing: Easing.in(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished) runOnJS(onFinish)();
      }),
    );
  }, [rail, word, draw, sheen, container, onFinish]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: container.value }));
  const railProps = useAnimatedProps(() => ({ strokeDashoffset: interpolate(rail.value, [0, 1], [RAIL_W, 0]) }));
  const drawProps = useAnimatedProps(() => ({ strokeDashoffset: interpolate(draw.value, [0, 1], [200, 0]) }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: interpolate(word.value, [0, 1], [8, 0]) }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheen.value, [0, 0.5, 1], [0, 0.85, 0]),
    transform: [{ translateX: interpolate(sheen.value, [0, 1], [-180, 180]) }, { skewX: '-18deg' }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, containerStyle]} pointerEvents="none">
      <LinearGradient colors={[NAVY_TOP, NAVY_BOT]} style={StyleSheet.absoluteFill} />

      <View style={styles.stack}>
        {/* Kicker row */}
        <View style={styles.row}>
          {KICKER.split('').map((c, i) =>
            c === ' ' ? (
              <View key={`k${i}`} style={{ width: SPW, height: KH }} />
            ) : (
              <Cell
                key={`k${i}`}
                char={c}
                w={KW}
                h={KH}
                fs={KFS}
                family={font.displaySemi}
                enterDelay={200 + i * 22}
                spinStart={300 + i * 30}
                seamIndex={i}
                seed={i === 5 || i === 10}
              />
            ),
          )}
        </View>

        {/* Gold board rail */}
        <View style={styles.rail}>
          <Svg width={RAIL_W} height={4}>
            <AnimatedLine
              x1={0}
              y1={2}
              x2={RAIL_W}
              y2={2}
              stroke={GOLD}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={RAIL_W}
              animatedProps={railProps}
            />
          </Svg>
        </View>

        {/* Hero "2026" row */}
        <View style={[styles.row, { gap: HGAP }]}>
          {HERO.split('').map((c, j) => (
            <Cell
              key={`h${j}`}
              char={c}
              w={HW}
              h={HH}
              fs={HFS}
              family={font.displayBold}
              enterDelay={520 + j * 30}
              spinStart={1050 + j * 95}
              seamIndex={j + 2}
              seed={j === 1}
            />
          ))}
        </View>

        {/* Wordmark + free-kick tracer arc */}
        <Animated.View style={[styles.wordWrap, wordStyle]}>
          <Text style={styles.word}>Sryln</Text>
          <Svg width={148} height={16} style={{ marginTop: 4 }}>
            <AnimatedPath
              d="M4 13 C 44 15, 96 12, 138 3"
              stroke={GOLD}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={200}
              animatedProps={drawProps}
            />
          </Svg>
        </Animated.View>
      </View>

      {/* LED refresh sheen */}
      <Animated.View style={[styles.sheen, sheenStyle]} pointerEvents="none">
        <LinearGradient
          colors={['transparent', HOTGOLD + '55', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  rail: { marginVertical: 14 },
  wordWrap: { alignItems: 'center', marginTop: 26 },
  word: { color: INK, fontSize: 26, fontFamily: font.extrabold, letterSpacing: 3 },
  sheen: {
    position: 'absolute',
    width: 78,
    height: 260,
    top: SH / 2 - 150,
    left: SW / 2 - 39,
  },
});
