import { useQuery } from '@tanstack/react-query';
import { fetchPlayerPhoto } from '@/lib/playerPhoto';

/**
 * Resolves a player photo for use anywhere in the UI. If ESPN already gave a
 * headshot it's returned immediately (no network); otherwise TheSportsDB is
 * queried by name and the result is cached for a day, keyed so the same player
 * reuses the photo across every screen.
 */
export function usePlayerPhoto(opts: { id?: string; name?: string; headshot?: string; club?: string }): string | undefined {
  const { id, name, headshot, club } = opts;
  const query = useQuery({
    queryKey: ['playerPhoto', id ?? name ?? ''],
    queryFn: () => fetchPlayerPhoto(name, club),
    enabled: !headshot && !!name,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 2,
  });
  return headshot ?? query.data ?? undefined;
}
