import React, { useState } from 'react';
import { Image, Text, StyleSheet, View } from 'react-native';
import { League, leagueLogoUrl } from '@/config/leagues';

/**
 * Real ESPN competition crest, with the emoji as a graceful fallback (some
 * competitions have no logo, and network images can fail).
 */
export function LeagueLogo({ league, size = 20 }: { league: League; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = leagueLogoUrl(league);

  if (!url || failed) {
    return <Text style={{ fontSize: size * 0.9, lineHeight: size * 1.05 }}>{league.emoji}</Text>;
  }
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({});
