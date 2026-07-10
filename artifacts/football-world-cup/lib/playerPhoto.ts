// ESPN has no headshot for many World Cup players. TheSportsDB (free, keyless
// test tier "3") carries clean cutout portraits for the vast majority — used
// purely as a photo fallback, matched by player name (+ club to disambiguate).
const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/3';

// Returns null (never undefined) so it's a valid react-query queryFn result.
export async function fetchPlayerPhoto(name?: string, club?: string): Promise<string | null> {
  if (!name) return null;
  // Throw on transport / HTTP errors (incl. 429 rate-limit) so react-query
  // retries with backoff. Only a genuine "no match" resolves to null, which is
  // then cached as the (correct) answer.
  const res = await fetch(`${SPORTSDB}/searchplayers.php?p=${encodeURIComponent(name)}`, {
    headers: { 'User-Agent': 'WorldCupApp/1.0' },
  });
  if (!res.ok) throw new Error(`SportsDB ${res.status}`);
  const data = await res.json();
  const players: any[] = Array.isArray(data?.player) ? data.player : [];
  const withPhoto = players.filter((p) => p?.strCutout || p?.strThumb);
  if (withPhoto.length === 0) return null;
  const soccer = withPhoto.filter((p) => (p.strSport ?? 'Soccer') === 'Soccer');
  const pool = soccer.length ? soccer : withPhoto;
  const byClub = club
    ? pool.find((p) => String(p.strTeam ?? '').toLowerCase().includes(club.toLowerCase()))
    : undefined;
  const pick = byClub ?? pool[0];
  return pick?.strCutout || pick?.strThumb || null;
}
