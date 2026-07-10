// ─── News normalizer ──────────────────────────────────────────────────────────
// Merges ESPN JSON news feeds (the competition feed + the top-soccer feed) with
// optional publisher RSS (BBC / Guardian / Sky) into one de-duplicated,
// newest-first `NewsItem[]`. The route fetches each source (all keyless and
// client-safe) and hands the raw bodies here; every item is `NewsItemSchema`
// validated before it can reach the client. RSS is parsed with a tiny regex
// reader — good enough for these well-formed feeds, no XML dependency.

import { z } from 'zod';
import { NewsItemSchema, type NewsItem } from '../contract/schema.js';

/** Raw source bodies for the news feed. All optional — missing ones are skipped. */
export interface NewsSources {
  /** JSON from site.api `/{slug}/news` (the competition feed). */
  espn?: unknown;
  /** JSON from site.api `/soccer/news` (top soccer feed). */
  espnSoccer?: unknown;
  /** BBC football RSS XML. */
  bbc?: string | null;
  /** Guardian football RSS XML. */
  guardian?: string | null;
  /** Sky Sports football RSS XML. */
  sky?: string | null;
}

// ── Permissive raw ESPN article shape ─────────────────────────────────────────
const RawEspnArticleSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  dataSourceIdentifier: z.string().optional(),
  headline: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.object({ type: z.string().optional(), url: z.string().optional() })).optional(),
  published: z.string().optional(),
  lastModified: z.string().optional(),
  byline: z.string().optional(),
  categories: z.array(z.object({ description: z.string().optional() })).optional(),
  links: z
    .object({
      web: z.object({ href: z.string().optional() }).optional(),
      mobile: z.object({ href: z.string().optional() }).optional(),
    })
    .optional(),
});
type RawEspnArticle = z.infer<typeof RawEspnArticleSchema>;

const RawEspnNewsSchema = z.object({ articles: z.array(RawEspnArticleSchema).optional() });

// ── ESPN JSON → NewsItem ──────────────────────────────────────────────────────
function espnImage(article: RawEspnArticle): string | undefined {
  const images = article.images ?? [];
  return (
    images.find((im) => im.type === 'header' && im.url)?.url ?? images.find((im) => im.url)?.url ?? undefined
  );
}

function normalizeEspn(article: RawEspnArticle, i: number, source: string): NewsItem {
  return {
    id: String(article.id ?? article.dataSourceIdentifier ?? article.headline ?? `${source}-${i}`),
    headline: article.headline ?? '',
    description: article.description ?? undefined,
    image: espnImage(article),
    published: article.published ?? article.lastModified ?? undefined,
    byline: article.byline ?? undefined,
    category: article.categories?.find((c) => c.description)?.description ?? source,
    source,
    link: article.links?.web?.href ?? article.links?.mobile?.href ?? undefined,
  };
}

function readEspn(raw: unknown, source: string): NewsItem[] {
  const parsed = RawEspnNewsSchema.safeParse(raw);
  if (!parsed.success) return [];
  return (parsed.data.articles ?? []).map((a, i) => normalizeEspn(a, i, source));
}

// ── Minimal RSS reader ────────────────────────────────────────────────────────
function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(stripCdata(m[1])) : undefined;
}

function parseRss(xml: string, source: string): NewsItem[] {
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
      category: source,
      source,
      link: tag(item, 'link'),
    } satisfies NewsItem;
  });
}

function readRss(xml: string | null | undefined, source: string): NewsItem[] {
  if (!xml || typeof xml !== 'string') return [];
  try {
    return parseRss(xml, source);
  } catch {
    return [];
  }
}

function publishedMs(item: NewsItem): number {
  if (!item.published) return 0;
  const t = new Date(item.published).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Merge every supplied news source → de-duplicated, newest-first `NewsItem[]`.
 * Sources are independent: any subset may be present, and a malformed one is
 * simply skipped.
 */
export function normalizeNews(sources: NewsSources): NewsItem[] {
  const merged: NewsItem[] = [
    ...readEspn(sources.espn, 'ESPN'),
    ...readEspn(sources.espnSoccer, 'ESPN'),
    ...readRss(sources.bbc, 'BBC Sport'),
    ...readRss(sources.guardian, 'Guardian'),
    ...readRss(sources.sky, 'Sky Sports'),
  ];

  // Dedupe by normalized headline, drop empties, newest first.
  const seen = new Set<string>();
  const deduped = merged.filter((a) => {
    const key = (a.headline || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => publishedMs(b) - publishedMs(a));

  return z.array(NewsItemSchema).parse(deduped);
}
