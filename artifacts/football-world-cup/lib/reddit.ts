import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Reddit (no user account) ───────────────────────────────────────────────
// Reddit locked down anonymous API access, so we use the "installed app" OAuth
// flow: a free app registration gives a CLIENT ID only (no secret), which is
// safe to ship. Users never log in — this is an app-only, read-only token.
//
// Setup (one-time, by the app owner):
//   1. https://www.reddit.com/prefs/apps → "create app" → type "installed app".
//   2. Redirect URI can be http://localhost. Copy the client id (under the name).
//   3. Set EXPO_PUBLIC_REDDIT_CLIENT_ID=<that id> (dev build env) and rebuild.

const CLIENT_ID: string | undefined = process.env.EXPO_PUBLIC_REDDIT_CLIENT_ID;
const UA = 'ios:worldcup.shorts:v1.0 (football clips)';
const TOKEN_KEY = 'reddit.token';
const DEVICE_KEY = 'reddit.deviceId';

export function isRedditConfigured(): boolean {
  return !!CLIENT_ID;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b >> 4)];
    out += isNaN(b) ? '=' : B64[((b & 15) << 2) | (c >> 6)];
    out += isNaN(c) ? '=' : B64[c & 63];
  }
  return out;
}

async function deviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => {});
  }
  return id;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!CLIENT_ID) return null;
  const now = Date.now();
  if (cachedToken && cachedToken.exp > now + 30_000) return cachedToken.token;

  if (!cachedToken) {
    const raw = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.token && parsed.exp > now + 30_000) {
          cachedToken = parsed;
          return parsed.token;
        }
      } catch { /* ignore */ }
    }
  }

  const did = await deviceId();
  const body = `grant_type=${encodeURIComponent('https://oauth.reddit.com/grants/installed_client')}&device_id=${did}`;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64(`${CLIENT_ID}:`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body,
  });
  if (!res.ok) throw new Error(`reddit token ${res.status}`);
  const json = await res.json();
  if (!json?.access_token) throw new Error('reddit token missing');
  cachedToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) * 1000 };
  AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(cachedToken)).catch(() => {});
  return cachedToken.token;
}

async function oauthGet(path: string): Promise<any> {
  const token = await getToken();
  if (!token) throw new Error('reddit not configured');
  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
  });
  if (res.status === 401) {
    cachedToken = null; // force refresh once
    const t2 = await getToken();
    const retry = await fetch(`https://oauth.reddit.com${path}`, {
      headers: { Authorization: `Bearer ${t2}`, 'User-Agent': UA },
    });
    if (!retry.ok) throw new Error(`reddit ${retry.status}`);
    return retry.json();
  }
  if (!res.ok) throw new Error(`reddit ${res.status}`);
  return res.json();
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RedditShort {
  id: string;
  title: string;
  subreddit: string;
  author: string;
  hlsUrl: string;
  fallbackUrl?: string;
  thumbnail?: string;
  ups: number;
  numComments: number;
  permalink: string;
  createdUtc: number;
  durationSec?: number;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  ups: number;
  depth: number;
}

function decodeEntities(s: string): string {
  return (s ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x200B;/g, '');
}

function normalizePost(d: any): RedditShort | null {
  const rv = d?.media?.reddit_video ?? d?.secure_media?.reddit_video;
  if (!d?.is_video || !rv?.hls_url) return null;
  const thumb = (d.preview?.images?.[0]?.source?.url as string | undefined) ?? (typeof d.thumbnail === 'string' && d.thumbnail.startsWith('http') ? d.thumbnail : undefined);
  return {
    id: String(d.id),
    title: decodeEntities(String(d.title ?? '')),
    subreddit: String(d.subreddit ?? ''),
    author: String(d.author ?? ''),
    hlsUrl: rv.hls_url,
    fallbackUrl: rv.fallback_url,
    thumbnail: thumb ? decodeEntities(thumb) : undefined,
    ups: Number(d.ups ?? 0),
    numComments: Number(d.num_comments ?? 0),
    permalink: String(d.permalink ?? ''),
    createdUtc: Number(d.created_utc ?? 0),
    durationSec: rv.duration,
  };
}

/** Fetch football video clips from a set of subreddits, newest-ish first. */
export async function fetchFootballShorts(): Promise<RedditShort[]> {
  const subs = ['soccer', 'footballhighlights'];
  const results = await Promise.allSettled(
    subs.map((s) => oauthGet(`/r/${s}/hot?limit=50&raw_json=1`)),
  );
  const seen = new Set<string>();
  const shorts: RedditShort[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const children: any[] = r.value?.data?.children ?? [];
    for (const c of children) {
      const short = normalizePost(c?.data);
      if (short && !seen.has(short.id)) {
        seen.add(short.id);
        shorts.push(short);
      }
    }
  }
  // Interleave by score so both subs are represented.
  shorts.sort((a, b) => b.ups - a.ups);
  return shorts;
}

/** Read-only top-level comments for a clip. */
export async function fetchShortComments(permalink: string): Promise<RedditComment[]> {
  const path = `${permalink}.json?limit=40&depth=1&sort=top&raw_json=1`.replace(/^https?:\/\/[^/]+/, '');
  const data = await oauthGet(path.startsWith('/') ? path : `/${path}`);
  const listing = Array.isArray(data) ? data[1] : null;
  const children: any[] = listing?.data?.children ?? [];
  const out: RedditComment[] = [];
  for (const c of children) {
    if (c?.kind !== 't1') continue;
    const d = c.data;
    if (!d?.body || d.body === '[deleted]' || d.body === '[removed]') continue;
    out.push({
      id: String(d.id),
      author: String(d.author ?? ''),
      body: decodeEntities(String(d.body)),
      ups: Number(d.ups ?? 0),
      depth: Number(d.depth ?? 0),
    });
  }
  return out;
}
