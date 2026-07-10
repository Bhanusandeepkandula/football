// GET /v1/:league/news → NewsItem[] — competition news feed (ESPN league +
// top-soccer, merged with BBC / Guardian / Sky RSS). Ported from useFootballNews.
import type { Hono } from 'hono';
import { z } from 'zod';

import type { NewsItem } from '../contract/schema.js';
import { NewsItemSchema } from '../contract/schema.js';
import {
  LeagueParamSchema,
  TTL,
  cached,
  defineRoute,
  espnFetch,
  espnText,
  parseParams,
  siteBase,
} from './_lib.js';

const NewsListSchema = z.array(NewsItemSchema);

const ESPN_TOP_SOCCER_NEWS = 'https://site.api.espn.com/apis/site/v2/sports/soccer/news';
const BBC_FOOTBALL_RSS = 'https://feeds.bbci.co.uk/sport/football/rss.xml';
const GUARDIAN_FOOTBALL_RSS = 'https://www.theguardian.com/football/rss';
const SKY_FOOTBALL_RSS = 'https://www.skysports.com/rss/12040';
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';

/* eslint-disable @typescript-eslint/no-explicit-any */
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

function normalizeEspn(article: any, i: number, source: string, label: string): NewsItem {
  return {
    id: String(article?.id ?? article?.dataSourceIdentifier ?? article?.headline ?? `${source}-${i}`),
    headline: article?.headline ?? '',
    description: article?.description ?? undefined,
    image: espnImage(article),
    published: article?.published ?? article?.lastModified ?? undefined,
    byline: article?.byline ?? undefined,
    category: article?.categories?.find((c: any) => c?.description)?.description ?? label,
    source: label,
    link: article?.links?.web?.href ?? article?.links?.mobile?.href ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Minimal RSS reader (no XML dep) ──────────────────────────────────────────
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

function parseRss(xml: string, source: string, label: string): NewsItem[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
  return items.map((item, i): NewsItem => {
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
      category: label,
      source: label,
      link: tag(item, 'link'),
    };
  });
}

async function fetchFootballNews(slug: string): Promise<NewsItem[]> {
  const [league, topSoccer, bbc, guardian, sky] = await Promise.allSettled([
    espnFetch<{ articles?: unknown[] }>(`${siteBase(slug)}/news`),
    espnFetch<{ articles?: unknown[] }>(ESPN_TOP_SOCCER_NEWS),
    espnText(BBC_FOOTBALL_RSS, { 'User-Agent': BROWSER_UA }),
    espnText(GUARDIAN_FOOTBALL_RSS, { 'User-Agent': BROWSER_UA }),
    espnText(SKY_FOOTBALL_RSS, { 'User-Agent': BROWSER_UA }),
  ]);

  const merged: NewsItem[] = [];
  if (league.status === 'fulfilled')
    merged.push(...asArray(league.value?.articles).map((a, i) => normalizeEspn(a, i, 'espn-league', 'ESPN')));
  if (topSoccer.status === 'fulfilled')
    merged.push(...asArray(topSoccer.value?.articles).map((a, i) => normalizeEspn(a, i, 'espn-soccer', 'ESPN')));
  if (bbc.status === 'fulfilled') merged.push(...parseRss(bbc.value, 'bbc', 'BBC Sport'));
  if (guardian.status === 'fulfilled') merged.push(...parseRss(guardian.value, 'guardian', 'Guardian'));
  if (sky.status === 'fulfilled') merged.push(...parseRss(sky.value, 'sky', 'Sky Sports'));

  // If every source failed, surface an upstream error rather than an empty body.
  if (merged.length === 0) {
    throw new Error('All news upstreams failed');
  }

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

export function registerNews(app: Hono): void {
  app.get(
    '/v1/:league/news',
    defineRoute(async (c) => {
      const { league } = parseParams(c, LeagueParamSchema);
      return cached(`news:${league}`, TTL.news, async () =>
        NewsListSchema.parse(await fetchFootballNews(league)),
      );
    }),
  );
}
