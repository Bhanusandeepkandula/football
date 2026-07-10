import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Svg, Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { MatchShot } from '@/hooks/useMatchDetail';
import { font, KICKER_SPACING } from '@/constants/typography';

interface XGFlowChartProps {
  shots: MatchShot[];
  homeTeam: { displayName: string };
  awayTeam: { displayName: string };
  homeColor: string;
  awayColor: string;
}

// "23'", "45+2", "90+4'" → an integer minute (stoppage folded in) for ordering.
function parseMinute(raw: string): number {
  const cleaned = String(raw).replace(/[^\d+]/g, '');
  if (!cleaned) return 0;
  const [base, extra] = cleaned.split('+');
  return (parseInt(base, 10) || 0) + (extra ? parseInt(extra, 10) || 0 : 0);
}

function shortCode(name: string): string {
  const words = name.replace(/[^a-zA-Z\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return (words[0] ?? name).slice(0, 3).toUpperCase();
}

type Point = { minute: number; cum: number; goal: boolean };

// Cumulative-xG step series: value holds flat between shots, jumps at each shot.
function buildSeries(shots: MatchShot[]): Point[] {
  const pts: Point[] = [{ minute: 0, cum: 0, goal: false }];
  let cum = 0;
  const ordered = [...shots].sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));
  for (const shot of ordered) {
    const xg = parseFloat(shot.xG ?? '0') || 0;
    cum += xg;
    pts.push({ minute: parseMinute(shot.minute), cum, goal: shot.outcome === 'goal' });
  }
  return pts;
}

function stepPath(points: Point[], maxMinute: number, sx: (m: number) => number, sy: (v: number) => number): string {
  if (points.length === 0) return '';
  let d = `M ${sx(points[0].minute)} ${sy(points[0].cum)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    d += ` L ${sx(cur.minute)} ${sy(prev.cum)} L ${sx(cur.minute)} ${sy(cur.cum)}`;
  }
  // Hold the final total out to the end of the axis.
  const last = points[points.length - 1];
  d += ` L ${sx(maxMinute)} ${sy(last.cum)}`;
  return d;
}

export function XGFlowChart({ shots, homeTeam, awayTeam, homeColor, awayColor }: XGFlowChartProps) {
  const colors = useColors();
  const [width, setWidth] = useState(0);

  const { home, away, maxMinute, maxXG, homeTotal, awayTotal, hasData } = useMemo(() => {
    const withXG = shots.filter((s) => (parseFloat(s.xG ?? '0') || 0) > 0);
    const homeShots = withXG.filter((s) => s.teamSide === 'home');
    const awayShots = withXG.filter((s) => s.teamSide === 'away');
    const home = buildSeries(homeShots);
    const away = buildSeries(awayShots);
    const homeTotal = home[home.length - 1]?.cum ?? 0;
    const awayTotal = away[away.length - 1]?.cum ?? 0;
    const latest = Math.max(
      ...withXG.map((s) => parseMinute(s.minute)),
      90,
    );
    const maxMinute = Math.ceil(latest / 15) * 15;
    const maxXG = Math.max(0.5, Math.ceil(Math.max(homeTotal, awayTotal) * 2) / 2);
    return { home, away, maxMinute, maxXG, homeTotal, awayTotal, hasData: withXG.length > 0 };
  }, [shots]);

  if (!hasData) return null;

  const H = 190;
  const padL = 30;
  const padR = 46;
  const padT = 14;
  const padB = 26;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = H - padT - padB;

  const sx = (m: number) => padL + (maxMinute > 0 ? (m / maxMinute) * plotW : 0);
  const sy = (v: number) => padT + plotH - (maxXG > 0 ? (v / maxXG) * plotH : 0);

  // Gridlines: HT (45') and FT (90') verticals; a few xG horizontals.
  const vLines = [45, 90].filter((m) => m <= maxMinute);
  const yTicks = Array.from({ length: 3 }, (_, i) => ((i + 1) * maxXG) / 3);

  const homeGoals = home.filter((p) => p.goal);
  const awayGoals = away.filter((p) => p.goal);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Expected Goals (xG)</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>MATCH FLOW</Text>
      </View>

      {/* Legend — identity carried by label + color, never color alone */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: homeColor }]} />
          <Text style={[styles.legendText, { color: colors.foreground }]} numberOfLines={1}>
            {shortCode(homeTeam.displayName)} {homeTotal.toFixed(2)}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: awayColor }]} />
          <Text style={[styles.legendText, { color: colors.foreground }]} numberOfLines={1}>
            {shortCode(awayTeam.displayName)} {awayTotal.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.plot} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            {/* Y gridlines + labels */}
            {yTicks.map((v, i) => (
              <React.Fragment key={`y-${i}`}>
                <Line x1={padL} y1={sy(v)} x2={width - padR} y2={sy(v)} stroke={colors.separator} strokeWidth={1} />
                <SvgText x={padL - 6} y={sy(v) + 3} fill={colors.mutedForeground} fontSize={9} fontFamily={font.semibold} textAnchor="end">
                  {v.toFixed(1)}
                </SvgText>
              </React.Fragment>
            ))}
            {/* Baseline */}
            <Line x1={padL} y1={sy(0)} x2={width - padR} y2={sy(0)} stroke={colors.mutedForeground} strokeWidth={1} />

            {/* HT / FT verticals */}
            {vLines.map((m) => (
              <React.Fragment key={`v-${m}`}>
                <Line x1={sx(m)} y1={padT} x2={sx(m)} y2={padT + plotH} stroke={colors.separator} strokeWidth={1} strokeDasharray="3 4" />
                <SvgText x={sx(m)} y={H - 8} fill={colors.mutedForeground} fontSize={9} fontFamily={font.bold} textAnchor="middle">
                  {m === 45 ? 'HT' : 'FT'}
                </SvgText>
              </React.Fragment>
            ))}
            <SvgText x={padL} y={H - 8} fill={colors.mutedForeground} fontSize={9} fontFamily={font.bold} textAnchor="middle">
              0'
            </SvgText>

            {/* Step lines */}
            <Path d={stepPath(away, maxMinute, sx, sy)} stroke={awayColor} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeOpacity={0.9} />
            <Path d={stepPath(home, maxMinute, sx, sy)} stroke={homeColor} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeOpacity={0.9} />

            {/* Goal markers */}
            {awayGoals.map((p, i) => (
              <Circle key={`ag-${i}`} cx={sx(p.minute)} cy={sy(p.cum)} r={4} fill={awayColor} stroke={colors.card} strokeWidth={2} />
            ))}
            {homeGoals.map((p, i) => (
              <Circle key={`hg-${i}`} cx={sx(p.minute)} cy={sy(p.cum)} r={4} fill={homeColor} stroke={colors.card} strokeWidth={2} />
            ))}

            {/* End-of-line direct labels */}
            <SvgText x={width - padR + 5} y={sy(homeTotal) + 3} fill={homeColor} fontSize={11} fontFamily={font.extrabold} textAnchor="start">
              {homeTotal.toFixed(2)}
            </SvgText>
            <SvgText x={width - padR + 5} y={sy(awayTotal) + 3} fill={awayColor} fontSize={11} fontFamily={font.extrabold} textAnchor="start">
              {awayTotal.toFixed(2)}
            </SvgText>
          </Svg>
        ) : null}
      </View>

      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
        Cumulative xG over time · dots mark goals
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 20, fontFamily: font.displayBold, letterSpacing: -0.2 },
  subtitle: { fontSize: 11, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },
  legend: { flexDirection: 'row', gap: 16, marginTop: 12, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 13, fontFamily: font.bold },
  plot: { marginTop: 8 },
  footnote: { fontSize: 11, fontFamily: font.medium, marginTop: 8, textAlign: 'center' },
});
