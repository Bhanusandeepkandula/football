import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TeamDetailView } from '@/components/TeamDetailView';

export default function TeamDetailScreen() {
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const teamLeague = typeof params.league === 'string' ? params.league : undefined;
  // Presented as a sheet now (see app/_layout.tsx) — use the sheet header.
  return <TeamDetailView id={id} teamLeague={teamLeague} variant="sheet" />;
}
