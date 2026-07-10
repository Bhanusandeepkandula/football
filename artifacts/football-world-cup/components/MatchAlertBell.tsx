import React, { useState, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Linking } from 'react-native';
import { Bell, BellRing } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useColors } from '@/hooks/useColors';
import { useMatchAlerts } from '@/hooks/useMatchAlerts';
import { KickoffMatch } from '@/lib/notifications';

interface Props {
  match: KickoffMatch;
  size?: number;
}

/**
 * Bell toggle that subscribes a match to local alerts (kickoff reminder +
 * live goal/HT/FT while the app is open). Filled + accent-tinted when on.
 */
export function MatchAlertBell({ match, size = 20 }: Props) {
  const colors = useColors();
  const { isSubscribed, toggle } = useMatchAlerts();
  const [busy, setBusy] = useState(false);
  const on = isSubscribed(match.id);

  const onPress = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const wasOn = on;
      const nowOn = await toggle(match);
      if (!wasOn && !nowOn) {
        // Permission was denied.
        Alert.alert(
          'Notifications are off',
          'Enable notifications in Settings to get match alerts.',
          [
            { text: 'Not now', style: 'cancel' },
            ...(Platform.OS === 'ios'
              ? [{ text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) }]
              : []),
          ],
        );
      } else if (nowOn) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }, [busy, on, toggle, match]);

  // Real iOS 26 liquid-glass background when available; falls back to a tinted
  // surface elsewhere. The "on" state adds an accent tint + ring on top.
  const glass = isLiquidGlassAvailable();

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={10}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Match alerts on' : 'Turn on match alerts'}
      style={[
        styles.btn,
        {
          overflow: 'hidden',
          backgroundColor: glass ? 'transparent' : on ? colors.primary + '22' : colors.secondary,
          borderColor: on ? colors.primary + '66' : colors.hairline,
          borderWidth: on ? StyleSheet.hairlineWidth : glass ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          tintColor={on ? colors.primary + '33' : undefined}
          style={[StyleSheet.absoluteFill, { borderRadius: 19 }]}
        />
      ) : null}
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : on ? (
        <BellRing size={size} color={colors.primary} strokeWidth={2.3} fill={colors.primary} />
      ) : (
        <Bell size={size} color={colors.mutedForeground} strokeWidth={2.2} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
