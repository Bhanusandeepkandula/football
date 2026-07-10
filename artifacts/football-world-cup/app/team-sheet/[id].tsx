import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TeamDetailView } from '@/components/TeamDetailView';

// Same team detail, presented as an iOS sheet (see the formSheet registration in
// app/_layout.tsx). Opened from a match card's crest/name tap — a quick peek that
// drags away, rather than pushing a whole new page.
export default function TeamSheetScreen() {
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const teamLeague = typeof params.league === 'string' ? params.league : undefined;
  return <TeamDetailView id={id} teamLeague={teamLeague} variant="sheet" />;
}
