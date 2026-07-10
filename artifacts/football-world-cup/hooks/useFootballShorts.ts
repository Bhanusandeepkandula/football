import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchFootballShorts, fetchShortComments, isRedditConfigured } from '@/lib/reddit';

export function useFootballShorts() {
  return useQuery({
    queryKey: ['football-shorts'],
    queryFn: fetchFootballShorts,
    enabled: isRedditConfigured(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
  });
}

export function useShortComments(permalink: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['short-comments', permalink],
    queryFn: () => fetchShortComments(permalink!),
    enabled: enabled && !!permalink && isRedditConfigured(),
    staleTime: 5 * 60_000,
  });
}

// ─── Local likes (device-only, no account) ──────────────────────────────────
const LIKES_KEY = 'shorts.likes';

export function useShortLikes() {
  const [liked, setLiked] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(LIKES_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setLiked(new Set(arr.map(String)));
        } catch { /* ignore */ }
      })
      .catch(() => {});
  }, []);

  const isLiked = useCallback((id?: string) => !!id && liked.has(id), [liked]);
  const toggle = useCallback((id: string) => {
    if (!id) return;
    setLiked((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      AsyncStorage.setItem(LIKES_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  return { isLiked, toggle };
}
