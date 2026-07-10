import { useQuery } from '@tanstack/react-query';

export interface FootballPost {
  id: string;
  author: string;
  handle: string;
  avatar?: string;
  text: string;
  image?: string;
  createdAt?: string;
  likes?: number;
  reshares?: number;
  replies?: number;
  source: 'Mastodon' | 'Bluesky';
  url?: string;
}

// Public, no-auth social timelines. Mastodon hashtag timelines are the most
// reliable (confirmed 200, no key). Bluesky author feeds are a best-effort
// bonus — if they fail we still render the Mastodon set.
const MASTODON_TAGS = ['WorldCup', 'football', 'soccer'];
const BLUESKY_ACTORS = ['fifaworldcup.com', 'espn.com'];

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function normalizeMastodon(s: any): FootballPost | null {
  const text = stripHtml(s?.content ?? '');
  if (!text) return null;
  const media = (s?.media_attachments ?? []).find((m: any) => m?.type === 'image' && (m?.preview_url || m?.url));
  return {
    id: `masto-${s?.id}`,
    author: s?.account?.display_name || s?.account?.username || 'Mastodon',
    handle: `@${s?.account?.acct ?? s?.account?.username ?? ''}`,
    avatar: s?.account?.avatar_static || s?.account?.avatar,
    text,
    image: media?.preview_url || media?.url,
    createdAt: s?.created_at,
    likes: s?.favourites_count,
    reshares: s?.reblogs_count,
    replies: s?.replies_count,
    source: 'Mastodon',
    url: s?.url || s?.uri,
  };
}

function normalizeBluesky(item: any): FootballPost | null {
  const post = item?.post;
  const text: string = post?.record?.text ?? '';
  if (!text) return null;
  const embedImg = post?.embed?.images?.[0]?.thumb || post?.embed?.media?.images?.[0]?.thumb;
  return {
    id: `bsky-${post?.cid ?? post?.uri}`,
    author: post?.author?.displayName || post?.author?.handle || 'Bluesky',
    handle: `@${post?.author?.handle ?? ''}`,
    avatar: post?.author?.avatar,
    text,
    image: embedImg,
    createdAt: post?.record?.createdAt || post?.indexedAt,
    likes: post?.likeCount,
    reshares: post?.repostCount,
    replies: post?.replyCount,
    source: 'Bluesky',
    url: post?.author?.handle && post?.uri ? `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}` : undefined,
  };
}

async function fetchFootballPosts(): Promise<FootballPost[]> {
  const mastoCalls = MASTODON_TAGS.map((t) =>
    fetchJson(`https://mastodon.social/api/v1/timelines/tag/${t}?limit=20`).then((arr: any[]) =>
      (Array.isArray(arr) ? arr : []).map(normalizeMastodon).filter(Boolean) as FootballPost[],
    ),
  );
  const bskyCalls = BLUESKY_ACTORS.map((a) =>
    fetchJson(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${a}&limit=20`).then((data: any) =>
      (data?.feed ?? []).map(normalizeBluesky).filter(Boolean) as FootballPost[],
    ),
  );

  const results = await Promise.allSettled([...mastoCalls, ...bskyCalls]);
  const merged: FootballPost[] = [];
  results.forEach((r) => { if (r.status === 'fulfilled') merged.push(...r.value); });

  // Dedupe by id, newest first.
  const seen = new Set<string>();
  const deduped = merged.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  deduped.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  return deduped;
}

export function useFootballPosts() {
  return useQuery({
    queryKey: ['footballPosts'],
    queryFn: fetchFootballPosts,
    staleTime: 3 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 90 * 1000,
  });
}
