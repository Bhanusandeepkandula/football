// Editorial type system for the World Cup app.
//
// Two voices:
//  • DISPLAY — Oswald, a condensed grotesque. Used for scores, team names in
//    caps, kickers and headlines. This is what gives the app its "matchday
//    broadsheet" character instead of a generic rounded look.
//  • TEXT — Nunito, a humanist sans. Used for body copy, secondary detail and
//    anything that needs to read comfortably at small sizes.

export const font = {
  // Display (Oswald) — condensed, editorial
  displayBold: 'Oswald_700Bold',
  displaySemi: 'Oswald_600SemiBold',
  displayMed: 'Oswald_500Medium',
  display: 'Oswald_400Regular',
  displayLight: 'Oswald_300Light',

  // Text (Nunito) — humanist body
  black: 'Nunito_900Black',
  extrabold: 'Nunito_800ExtraBold',
  bold: 'Nunito_700Bold',
  semibold: 'Nunito_600SemiBold',
  medium: 'Nunito_500Medium',
  regular: 'Nunito_400Regular',
} as const;

// Consistent letter-spacing for condensed caps kickers / labels.
export const KICKER_SPACING = 1.6;
