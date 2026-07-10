import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TeamDetailView } from '@/components/TeamDetailView';

export default function TeamDetailScreen() {
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const teamLeague = typeof params.league === 'string' ? params.league : undefined;
  // Full page (opened from the Teams tab / standings). The sheet version is the
  // separate team-sheet/[id] route used from match cards.
  return <TeamDetailView id={id} teamLeague={teamLeague} variant="page" />;
}
