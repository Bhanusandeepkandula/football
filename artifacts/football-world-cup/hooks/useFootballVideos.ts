import { useQuery } from '@tanstack/react-query';
import { footballYoutubeChannels } from '@/config/shortsChannels';

export interface FootballVideo {
  id: string;
  title: string;
  thumbnail?: string;
  published?: string;
  channel: string;
  url: string;
}

// Key-free YouTube channel upload feeds (Atom). FIFA + ESPN FC cover World Cup
// highlights, analysis and short-form.
const CHANNELS = [
  { id: 'UCpcTrCXblq78GZrTUTLWeBw', name: 'FIFA' },
  { id: 'UC6c1z7bA__85CIWZ_jpCK-Q', name: 'ESPN FC' },
];

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/g, "'");
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

function parseYouTube(xml: string, channel: string): FootballVideo[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries
    .map((e) => {
      const id = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? '';
      const title = decode((e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim());
      const published = e.match(/<published>([^<]+)<\/published>/)?.[1];
      const thumb =
        e.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1] ??
        (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined);
      return { id, title, thumbnail: thumb, published, channel, url: `https://www.youtube.com/watch?v=${id}` };
    })
    .filter((v) => v.id && v.title);
}

async function fetchFootballVideos(): Promise<FootballVideo[]> {
  const results = await Promise.allSettled(
    CHANNELS.map((c) => fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${c.id}`).then((xml) => parseYouTube(xml, c.name))),
  );
  const merged: FootballVideo[] = [];
  results.forEach((r) => { if (r.status === 'fulfilled') merged.push(...r.value); });
  merged.sort((a, b) => new Date(b.published ?? 0).getTime() - new Date(a.published ?? 0).getTime());
  return merged;
}

export function useFootballVideos() {
  return useQuery({
    queryKey: ['footballVideos'],
    queryFn: fetchFootballVideos,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

// ─── Shorts feed (wider channel set, mixed for variety) ─────────────────────
async function fetchShortsVideos(): Promise<FootballVideo[]> {
  const results = await Promise.allSettled(
    footballYoutubeChannels.map((c) =>
      fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${c.channelId}`).then((xml) => parseYouTube(xml, c.name)),
    ),
  );
  // Round-robin across channels (newest-first within each) so consecutive clips
  // come from different sources instead of one channel dominating.
  const perChannel = results.map((r) => (r.status === 'fulfilled' ? r.value : []));
  const maxLen = perChannel.reduce((m, v) => Math.max(m, v.length), 0);
  const merged: FootballVideo[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < maxLen; i++) {
    for (const list of perChannel) {
      const v = list[i];
      if (v && !seen.has(v.id)) { seen.add(v.id); merged.push(v); }
    }
  }
  return merged;
}

export function useShortsVideos() {
  return useQuery({
    queryKey: ['shortsVideos'],
    queryFn: fetchShortsVideos,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
  });
}
