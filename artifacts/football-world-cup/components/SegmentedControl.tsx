import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';

export interface Segment {
  id: string;
  label: string;
  Icon?: any;
}

interface Props {
  segments: Segment[];
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
}

/**
 * iOS-style segmented control: a soft neutral track with a raised thumb on the
 * active segment. Mirrors UISegmentedControl in dark appearance.
 */
export function SegmentedControl({ segments, value, onChange, compact }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.track, compact && styles.trackCompact]}>
      {segments.map((seg) => {
        const active = seg.id === value;
        const tint = active ? colors.foreground : colors.mutedForeground;
        return (
          <TouchableOpacity
            key={seg.id}
            activeOpacity={0.8}
            onPress={() => onChange(seg.id)}
            style={[
              styles.segment,
              compact && styles.segmentCompact,
              active && styles.segmentActive,
            ]}
          >
            {seg.Icon ? <seg.Icon size={compact ? 14 : 15} color={tint} strokeWidth={2.2} /> : null}
            <Text
              style={[styles.label, compact && styles.labelCompact, { color: tint }]}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: 'rgba(118,118,128,0.20)',
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  trackCompact: {
    alignSelf: 'center',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentCompact: {
    flex: 0,
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  segmentActive: {
    backgroundColor: '#48484A',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 1px 3px rgba(0,0,0,0.35)' } as any
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.35,
          shadowRadius: 3,
          elevation: 2,
        }),
  },
  label: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
    letterSpacing: 0.1,
  },
  labelCompact: {
    fontSize: 13,
  },
});
