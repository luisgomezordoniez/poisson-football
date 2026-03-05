/**
 * dataLoader.js
 * 
 * Loads match data from /data/matches.json (produced by fetch-data.mjs).
 * Falls back to procedurally generated data if the file isn't available
 * (e.g. during development before running the fetch script).
 */

let _cache = null;
let _badgeCache = null;
let _loading = false;
let _listeners = [];

export const LEAGUES = {
  E0:  { en: "England — Premier League",   es: "Inglaterra — Premier League" },
  SP1: { en: "Spain — La Liga",            es: "España — La Liga" },
  D1:  { en: "Germany — Bundesliga",       es: "Alemania — Bundesliga" },
  I1:  { en: "Italy — Serie A",            es: "Italia — Serie A" },
  F1:  { en: "France — Ligue 1",           es: "Francia — Ligue 1" },
  N1:  { en: "Netherlands — Eredivisie",   es: "Países Bajos — Eredivisie" },
  P1:  { en: "Portugal — Primeira Liga",   es: "Portugal — Primeira Liga" },
  B1:  { en: "Belgium — Jupiler Pro League",es: "Bélgica — Jupiler Pro League" },
  SC0: { en: "Scotland — Premiership",     es: "Escocia — Premiership" },
  T1:  { en: "Turkey — Süper Lig",         es: "Turquía — Süper Lig" },
};

/**
 * Load the match database. Returns a promise that resolves to the full dataset.
 */
export async function loadMatchData() {
  if (_cache) return _cache;

  try {
    const res = await fetch("./data/matches.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _cache = await res.json();
    console.log("✅ Loaded real match data from matches.json");
    return _cache;
  } catch (err) {
    console.warn("⚠️ Could not load matches.json, using generated fallback data.", err.message);
    _cache = generateFallbackData();
    return _cache;
  }
}

/**
 * Load team badge URLs from badges.json.
 */
export async function loadBadges() {
  if (_badgeCache) return _badgeCache;
  try {
    const res = await fetch("./data/badges.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _badgeCache = await res.json();
    console.log("✅ Loaded team badges");
    return _badgeCache;
  } catch (err) {
    console.warn("⚠️ Could not load badges.json, using monograms.", err.message);
    _badgeCache = {};
    return _badgeCache;
  }
}

/**
 * Get badge URL for a team name. Tries exact match, then fuzzy.
 */
export function getBadgeUrl(badges, teamName) {
  if (!badges || !teamName) return null;
  // Exact match
  if (badges[teamName]) return badges[teamName];
  // Try lowercase
  const lower = teamName.toLowerCase();
  for (const [key, url] of Object.entries(badges)) {
    if (key.toLowerCase() === lower) return url;
  }
  // Try partial match
  for (const [key, url] of Object.entries(badges)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return url;
  }
  return null;
}

/**
 * Get available seasons for a league.
 */
export function getSeasons(data, leagueId) {
  if (!data || !data[leagueId]) return [];
  return Object.keys(data[leagueId].seasons).sort().reverse();
}

/**
 * Get teams for a league/season.
 */
export function getTeams(data, leagueId, season) {
  const matches = getMatches(data, leagueId, season);
  const set = new Set();
  matches.forEach(m => { set.add(m.home); set.add(m.away); });
  return [...set].sort();
}

/**
 * Get matches for a league/season.
 */
export function getMatches(data, leagueId, season) {
  if (!data?.[leagueId]?.seasons?.[season]) return [];
  return data[leagueId].seasons[season].matches;
}

/**
 * Get available league IDs that actually have data.
 */
export function getAvailableLeagues(data) {
  if (!data) return [];
  return Object.keys(data).filter(id => {
    const seasons = data[id]?.seasons;
    return seasons && Object.keys(seasons).length > 0;
  });
}

// ── Fallback data generator ────────────────────────────────────────
// Used when matches.json hasn't been generated yet (dev mode)

const TEAM_POOLS = {
  E0: ["Arsenal","Aston Villa","Bournemouth","Brentford","Brighton","Burnley","Chelsea","Crystal Palace","Everton","Fulham","Liverpool","Luton","Man City","Man United","Newcastle","Nott'm Forest","Sheffield United","Tottenham","West Ham","Wolves"],
  SP1: ["Almería","Athletic Bilbao","Atlético Madrid","Barcelona","Betis","Cádiz","Celta Vigo","Getafe","Girona","Granada","Las Palmas","Mallorca","Osasuna","Rayo Vallecano","Real Madrid","Real Sociedad","Sevilla","Valencia","Villarreal","Alavés"],
  D1: ["Augsburg","Bayern Munich","Bochum","Dortmund","Ein Frankfurt","FC Köln","Freiburg","Heidenheim","Hoffenheim","Leverkusen","Mainz","M'gladbach","RB Leipzig","Stuttgart","Union Berlin","Werder Bremen","Wolfsburg","Darmstadt"],
  I1: ["AC Milan","Atalanta","Bologna","Cagliari","Empoli","Fiorentina","Frosinone","Genoa","Hellas Verona","Inter","Juventus","Lazio","Lecce","Monza","Napoli","Roma","Salernitana","Sassuolo","Torino","Udinese"],
  F1: ["Brest","Clermont","Le Havre","Lens","Lille","Lorient","Lyon","Marseille","Metz","Monaco","Montpellier","Nantes","Nice","PSG","Reims","Rennes","Strasbourg","Toulouse"],
};

function generateFallbackData() {
  const data = {};
  const seasons = [];
  for (let y = 2012; y <= 2024; y++) {
    seasons.push({ name: `${y}/${y + 1}`, year: y + 1 });
  }

  for (const [leagueId, teams] of Object.entries(TEAM_POOLS)) {
    const info = LEAGUES[leagueId];
    data[leagueId] = {
      country: info?.en?.split(" — ")[0] || leagueId,
      league: info?.en?.split(" — ")[1] || "League",
      seasons: {},
    };

    for (const season of seasons) {
      const seed = hashCode(leagueId + season.name);
      const rng = seedRng(seed);
      const n = teams.length;

      const strengths = teams.map(() => 0.5 + rng() * 1.5);
      const defenses = teams.map(() => 0.5 + rng() * 1.0);

      const matches = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const lambdaH = Math.max(0.3, strengths[i] * defenses[j] * 1.25 * (0.8 + rng() * 0.4));
          const lambdaA = Math.max(0.2, strengths[j] * defenses[i] * (0.8 + rng() * 0.4));
          const hg = poissonRng(lambdaH, rng);
          const ag = poissonRng(lambdaA, rng);
          matches.push({
            home: teams[i],
            away: teams[j],
            hg, ag,
            result: hg > ag ? "H" : hg < ag ? "A" : "D",
            date: "",
          });
        }
      }

      data[leagueId].seasons[season.name] = { year: season.year, matches };
    }
  }

  return data;
}

function poissonRng(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seedRng(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}
