import React from 'react';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

interface PitchIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Top-down soccer pitch — used for the Matches tab. */
export function PitchIcon({ size = 24, color = '#FFFFFF', strokeWidth = 1.45 }: PitchIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={4.25}
        y={2.25}
        width={15.5}
        height={19.5}
        rx={2.25}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Line x1={12} y1={2.25} x2={12} y2={21.75} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12} cy={12} r={3.1} stroke={color} strokeWidth={strokeWidth} />
      <Rect
        x={7.25}
        y={2.25}
        width={9.5}
        height={4.75}
        rx={1.1}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Rect
        x={7.25}
        y={16.95}
        width={9.5}
        height={4.75}
        rx={1.1}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}
