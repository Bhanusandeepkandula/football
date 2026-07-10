import { useQuery } from '@tanstack/react-query';
import { MatchNewsArticle } from './useMatchDetail';
import { siteBase } from '@/lib/espn';
import { useLeague } from '@/hooks/useLeague';

// Both keyless & client-safe (no API key leaks into the bundle).
const leagueNewsUrl = (slug: string) => `${siteBase(slug)}/news`;
const ESPN_TOP_SOCCER_NEWS = 'https://site.api.espn.com/apis/site/v2/sports/soccer/news';
const BBC_FOOTBALL_RSS = 'https://feeds.bbci.co.uk/sport/football/rss.xml';
const GUARDIAN_FOOTBALL_RSS = 'https://www.theguardian.com/football/rss';
const SKY_FOOTBALL_RSS = 'https://www.skysports.com/rss/12040';

function asArray<T = any>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function espnImage(article: any): string | undefined {
  const images: any[] = article?.images ?? [];
  return (
    images.find((im: any) => im?.type === 'header' && im?.url)?.url ??
    images.find((im: any) => im?.url)?.url ??
    undefined
  );
}

function normalizeEspn(article: any, i: number, source: string): MatchNewsArticle {
  return {
    id: String(article?.id ?? article?.dataSourceIdentifier ?? article?.headline ?? `${source}-${i}`),
    headline: article?.headline ?? '',
    description: article?.description ?? undefined,
    image: espnImage(article),
    published: article?.published ?? article?.lastModified ?? undefined,
    byline: article?.byline ?? undefined,
    category: article?.categories?.find((c: any) => c?.description)?.description ?? 'ESPN',
    link: article?.links?.web?.href ?? article?.links?.mobile?.href ?? undefined,
  };
}

// Minimal RSS reader — good enough for BBC's well-formed feed, no XML dep needed.
function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'");
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(stripCdata(m[1])) : undefined;
}

function parseRss(xml: string, source: string, category: string): MatchNewsArticle[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
  return items.map((item, i) => {
    const image =
      item.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1] ??
      item.match(/<media:content[^>]*url="([^"]+)"/)?.[1] ??
      item.match(/<enclosure[^>]*url="([^"]+)"/)?.[1] ??
      undefined;
    return {
      id: tag(item, 'guid') ?? tag(item, 'link') ?? `${source}-${i}`,
      headline: tag(item, 'title') ?? '',
      description: tag(item, 'description'),
      image,
      published: tag(item, 'pubDate'),
      byline: undefined,
      category,
      link: tag(item, 'link'),
    } as MatchNewsArticle;
  });
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  // Some publishers (Guardian) block non-browser agents — send a browser UA.
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function fetchFootballNews(slug: string): Promise<MatchNewsArticle[]> {
  const [league, topSoccer, bbc, guardian, sky] = await Promise.allSettled([
    fetchJson(leagueNewsUrl(slug)),
    fetchJson(ESPN_TOP_SOCCER_NEWS),
    fetchText(BBC_FOOTBALL_RSS),
    fetchText(GUARDIAN_FOOTBALL_RSS),
    fetchText(SKY_FOOTBALL_RSS),
  ]);

  const merged: MatchNewsArticle[] = [];
  if (league.status === 'fulfilled') merged.push(...asArray(league.value?.articles).map((a, i) => normalizeEspn(a, i, 'espn-wc')));
  if (topSoccer.status === 'fulfilled') merged.push(...asArray(topSoccer.value?.articles).map((a, i) => normalizeEspn(a, i, 'espn-soccer')));
  if (bbc.status === 'fulfilled') merged.push(...parseRss(bbc.value, 'bbc', 'BBC Sport'));
  if (guardian.status === 'fulfilled') merged.push(...parseRss(guardian.value, 'guardian', 'Guardian'));
  if (sky.status === 'fulfilled') merged.push(...parseRss(sky.value, 'sky', 'Sky Sports'));

  // Dedupe by normalized headline, drop empties, newest first.
  const seen = new Set<string>();
  const deduped = merged.filter((a) => {
    const key = (a.headline || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => {
    const ta = a.published ? new Date(a.published).getTime() : 0;
    const tb = b.published ? new Date(b.published).getTime() : 0;
    return tb - ta;
  });
  return deduped;
}

export function useFootballNews() {
  const { slug } = useLeague();
  return useQuery({
    queryKey: ['footballNews', slug],
    queryFn: () => fetchFootballNews(slug),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 90 * 1000, // live-ish feed
  });
}
