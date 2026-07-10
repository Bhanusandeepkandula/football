import { Platform } from 'react-native';

const AWAY_FALLBACKS = ['#2E7DF6', '#F5A623', '#30D158', '#AF52DE', '#FF375F', '#5AC8FA'];

export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

export function normalizeTeamHex(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{3,6}$/.test(s)) return null;
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.padStart(6, '0').slice(-6);
  return `#${v.toUpperCase()}`;
}

function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Prefer saturated flag-like hues over grey/black/white API values. */
function colorVibrancy(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = (max + min) / 2 / 255;
  if (lum < 0.07 || lum > 0.93) return 0.05;
  if (sat < 0.12) return 0.15;
  return sat * (1 - Math.abs(lum - 0.42) * 0.85);
}

export function brightenTeamAccent(hex: string, strength = 1): string {
  const [r, g, b] = hexToRgb(hex.startsWith('#') ? hex : `#${hex}`);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.min(0.7, l + 0.12 * strength);
  const newS = Math.min(1, s + 0.1 * strength);
  const [nr, ng, nb] = hslToRgb(h, newS, newL);
  return `#${[nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Make a team's brand colour actually readable + vivid against the active
 * theme's background. A dark navy (France) or maroon is muddy/invisible on a
 * black screen, so on dark themes we lift the lightness into a bright band and
 * boost saturation so it "pops"; on the light theme we cap lightness so pale
 * colours (yellow, sky) stay legible on white. Hue is preserved.
 */
export function readableTeamColor(hex: string, isDark: boolean): string {
  const [r, g, b] = hexToRgb(hex.startsWith('#') ? hex : `#${hex}`);
  const [h, s0, l0] = rgbToHsl(r, g, b);
  const s = Math.min(1, Math.max(s0, 0.55));
  // Only lifts colours darker than the floor (bright ones keep their tone,
  // capped below white); the light theme only darkens over-light colours.
  const l = isDark
    ? Math.min(0.66, Math.max(l0, 0.56))
    : Math.max(0.30, Math.min(l0, 0.46));
  const [nr, ng, nb] = hslToRgb(h, s, l);
  return `#${[nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function blendHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const mix = (c1: number, c2: number) => Math.round(c1 * (1 - t) + c2 * t);
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Pick the best primary / alternate brand tone from ESPN. */
export function resolveTeamBrandColor(primary?: string | null, alternate?: string | null, fallback = '#003DA5'): string {
  const candidates = [primary, alternate]
    .map(normalizeTeamHex)
    .filter((c): c is string => Boolean(c));
  if (candidates.length === 0) return brightenTeamAccent(fallback);
  candidates.sort((a, b) => colorVibrancy(b) - colorVibrancy(a));
  return brightenTeamAccent(candidates[0]);
}

export function mergeFlagAccent(apiColor: string, flagColor: string | null): string {
  if (!flagColor) return apiColor;
  const merged = blendHex(apiColor, flagColor, 0.68);
  return brightenTeamAccent(merged, 1.05);
}

/** Blend toward neutral for charts — low mix keeps accents bright. */
export function softenTeamColor(hex: string, mix = 0.1): string {
  const [r, g, b] = hexToRgb(hex.startsWith('#') ? hex : `#${hex}`);
  const nr = 0x66;
  const ng = 0x66;
  const nb = 0x6a;
  const blend = (c: number, n: number) => Math.round(c * (1 - mix) + n * mix);
  const lift = (c: number) => Math.min(255, Math.round(c * 1.14 + 14));
  return `#${[lift(blend(r, nr)), lift(blend(g, ng)), lift(blend(b, nb))].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function distinctTeamPair(home: string, away: string): [string, string] {
  if (colorDist(home, away) >= 72) return [home, away];
  let best = AWAY_FALLBACKS[0];
  let bestD = -1;
  for (const c of AWAY_FALLBACKS) {
    const d = colorDist(home, c);
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return [home, best];
}

function scoreSample(r: number, g: number, b: number, a: number, centerWeight = 1): number {
  if (a < 40) return 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = (max + min) / 2 / 255;
  if (lum < 0.08 || lum > 0.92) return 0;
  if (sat < 0.15) return 0;
  return sat * (1 - Math.abs(lum - 0.48)) * (a / 255) * centerWeight;
}

function sampleFlagPixels(img: HTMLImageElement, size: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const buckets = new Map<string, { score: number; r: number; g: number; b: number }>();
  const center = (size - 1) / 2;
  const maxDist = Math.sqrt(center * center * 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
      const centerWeight = 0.55 + 0.45 * (1 - dist / maxDist);
      const sampleScore = scoreSample(r, g, b, a, centerWeight);
      if (sampleScore <= 0) continue;
      const key = `${Math.round(r / 20)}-${Math.round(g / 20)}-${Math.round(b / 20)}`;
      const prev = buckets.get(key);
      if (prev) {
        prev.score += sampleScore;
        prev.r += r * sampleScore;
        prev.g += g * sampleScore;
        prev.b += b * sampleScore;
      } else {
        buckets.set(key, { score: sampleScore, r: r * sampleScore, g: g * sampleScore, b: b * sampleScore });
      }
    }
  }

  let best: { score: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.score > best.score) best = bucket;
  }
  if (!best) return null;

  const hex = `#${[
    Math.round(best.r / best.score),
    Math.round(best.g / best.score),
    Math.round(best.b / best.score),
  ].map((n) => Math.min(255, n).toString(16).padStart(2, '0')).join('')}`;
  return brightenTeamAccent(hex, 1.1);
}

async function loadLogoImage(logoUrl: string): Promise<HTMLImageElement | null> {
  const loadFromSrc = (src: string, crossOrigin?: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  try {
    const res = await fetch(logoUrl);
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = await loadFromSrc(objectUrl);
      URL.revokeObjectURL(objectUrl);
      if (img) return img;
    }
  } catch {
    // fall through to direct image load
  }

  return (await loadFromSrc(logoUrl, 'anonymous')) ?? loadFromSrc(logoUrl);
}

/** Sample flag / crest pixels on web; returns a vibrant accent from the image. */
export async function extractFlagAccent(logoUrl?: string | null): Promise<string | null> {
  if (!logoUrl || Platform.OS !== 'web' || typeof document === 'undefined') return null;

  try {
    const img = await loadLogoImage(logoUrl);
    if (!img) return null;
    return sampleFlagPixels(img, 56);
  } catch {
    return null;
  }
}
