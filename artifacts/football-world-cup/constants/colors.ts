export type ColorTokens = {
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardElevated: string;
  cardForeground: string;
  ink: string;
  primary: string;
  primaryForeground: string;
  kicker: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  live: string;
  border: string;
  input: string;
  separator: string;
  hairline: string;
  scrim: string;
  rowShade: string;
  gold: string;
  silver: string;
  pitchGreen: string;
};

export type ThemeId = 'dark' | 'white' | 'grey';

/** Jet black — the original match-centre look. */
const dark: ColorTokens = {
  text: '#FFFFFF',
  tint: '#F5A623',
  background: '#000000',
  foreground: '#FFFFFF',
  card: '#111114',
  cardElevated: '#1C1C1E',
  cardForeground: '#FFFFFF',
  ink: '#0A0B0E',
  primary: '#F5A623',
  primaryForeground: '#000000',
  kicker: '#F5A623',
  secondary: '#1C1C1E',
  secondaryForeground: '#EBEBF5',
  muted: '#2C2C2E',
  mutedForeground: '#8E8E93',
  accent: '#30D158',
  accentForeground: '#000000',
  destructive: '#FF3B30',
  destructiveForeground: '#FFFFFF',
  live: '#FF3B30',
  border: 'rgba(255,255,255,0.1)',
  input: '#1C1C1E',
  separator: 'rgba(255,255,255,0.06)',
  hairline: 'rgba(255,255,255,0.09)',
  scrim: 'rgba(0,0,0,0.55)',
  rowShade: 'rgba(255,255,255,0.028)',
  gold: '#F5A623',
  silver: '#8E8E93',
  pitchGreen: '#166A3F',
};

/** Crisp white light mode. */
const white: ColorTokens = {
  text: '#000000',
  tint: '#F5A623',
  // Off-white paper (never pure #FFFFFF) so the page reads softer on the eye.
  background: '#F8F8FA',
  foreground: '#000000',
  // Clean white cards on the off-white page — reads as a crisp raised panel
  // rather than a muddy grey block.
  card: '#FFFFFF',
  cardElevated: '#FFFFFF',
  cardForeground: '#000000',
  ink: '#F8F8FA',
  primary: '#F5A623',
  primaryForeground: '#000000',
  kicker: '#F5A623',
  secondary: '#E8E8EE',
  secondaryForeground: '#1C1C1E',
  muted: '#DEDEE4',
  mutedForeground: '#6C6C70',
  accent: '#248A3D',
  accentForeground: '#FFFFFF',
  destructive: '#FF3B30',
  destructiveForeground: '#FFFFFF',
  live: '#FF3B30',
  border: 'rgba(0,0,0,0.1)',
  input: '#F2F2F7',
  separator: 'rgba(0,0,0,0.06)',
  hairline: 'rgba(0,0,0,0.09)',
  scrim: 'rgba(0,0,0,0.45)',
  rowShade: 'rgba(0,0,0,0.03)',
  gold: '#C17D00',
  silver: '#8E8E93',
  pitchGreen: '#1B7A47',
};

/** VS Code–style dark grey — charcoal UI, a touch darker than default VS Code. */
const grey: ColorTokens = {
  text: '#C8C8C8',
  tint: '#F5A623',
  background: '#121212',
  foreground: '#C8C8C8',
  card: '#1A1A1A',
  cardElevated: '#212121',
  cardForeground: '#C8C8C8',
  ink: '#0E0E0E',
  primary: '#F5A623',
  primaryForeground: '#000000',
  kicker: '#F5A623',
  secondary: '#212121',
  secondaryForeground: '#C8C8C8',
  muted: '#2A2A2A',
  mutedForeground: '#757575',
  accent: '#30D158',
  accentForeground: '#000000',
  destructive: '#FF3B30',
  destructiveForeground: '#FFFFFF',
  live: '#FF3B30',
  border: 'rgba(255,255,255,0.08)',
  input: '#2A2A2A',
  separator: 'rgba(255,255,255,0.05)',
  hairline: 'rgba(255,255,255,0.07)',
  scrim: 'rgba(0,0,0,0.6)',
  rowShade: 'rgba(255,255,255,0.03)',
  gold: '#F5A623',
  silver: '#757575',
  pitchGreen: '#166A3F',
};

const themes: Record<ThemeId, ColorTokens> = { dark, white, grey };

const colors = {
  themes,
  /** @deprecated Use `themes.dark` — kept for any legacy imports. */
  light: dark,
  radius: 16,
};

export function themeStatusBarStyle(theme: ThemeId): 'light' | 'dark' {
  return theme === 'white' ? 'dark' : 'light';
}

export default colors;
