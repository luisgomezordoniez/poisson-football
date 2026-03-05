#!/usr/bin/env node
/**
 * fetch-data.mjs
 * 
 * Downloads historical match data from football-data.co.uk
 * and saves it as a single JSON file for the web app.
 * 
 * Usage:
 *   node scripts/fetch-data.mjs
 *   node scripts/fetch-data.mjs --leagues E0,SP1 --start 2018
 * 
 * The resulting public/data/matches.json can be committed to the repo
 * or hosted on a CDN. The React app loads this file at runtime.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "public", "data");

// ── Configuration ──────────────────────────────────────────────────
const LEAGUE_IDS = {
  E0:  { country: "England",     league: "Premier League" },
  SP1: { country: "Spain",       league: "La Liga" },
  D1:  { country: "Germany",     league: "Bundesliga" },
  I1:  { country: "Italy",       league: "Serie A" },
  F1:  { country: "France",      league: "Ligue 1" },
  N1:  { country: "Netherlands", league: "Eredivisie" },
  P1:  { country: "Portugal",    league: "Primeira Liga" },
  B1:  { country: "Belgium",     league: "Jupiler Pro League" },
  SC0: { country: "Scotland",    league: "Premiership" },
  T1:  { country: "Turkey",      league: "Süper Lig" },
};

// Parse CLI args
const args = process.argv.slice(2);
let selectedLeagues = Object.keys(LEAGUE_IDS);
let startYear = 2012;
let endYear = new Date().getFullYear();

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--leagues" && args[i + 1]) {
    selectedLeagues = args[++i].split(",");
  } else if (args[i] === "--start" && args[i + 1]) {
    startYear = parseInt(args[++i]);
  } else if (args[i] === "--end" && args[i + 1]) {
    endYear = parseInt(args[++i]);
  }
}

// ── Season ID helpers ──────────────────────────────────────────────
function buildSeasons(start, end) {
  const seasons = [];
  for (let y = start; y < end; y++) {
    const s = String(y).slice(2);
    const e = String(y + 1).slice(2);
    seasons.push({
      id: `${s}${e}`,
      name: `${y}/${y + 1}`,
      year: y + 1,
    });
  }
  return seasons;
}

// ── CSV Fetching ───────────────────────────────────────────────────
async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  return text;
}

function parseCSV(csvText) {
  const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    if (values.length < headers.length) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function extractMatch(row) {
  const homeTeam = row.HomeTeam || row.HT || "";
  const awayTeam = row.AwayTeam || row.AT || "";
  const hg = parseInt(row.FTHG ?? row.HG ?? "");
  const ag = parseInt(row.FTAG ?? row.AG ?? "");
  const result = row.FTR ?? row.Res ?? "";

  if (!homeTeam || !awayTeam || isNaN(hg) || isNaN(ag)) return null;

  return {
    home: homeTeam,
    away: awayTeam,
    hg,
    ag,
    result: result || (hg > ag ? "H" : hg < ag ? "A" : "D"),
    date: row.Date || "",
  };
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("🏟️  Poisson & Football — Data Fetcher");
  console.log(`   Leagues: ${selectedLeagues.join(", ")}`);
  console.log(`   Seasons: ${startYear}/${startYear + 1} → ${endYear - 1}/${endYear}`);
  console.log("");

  const seasons = buildSeasons(startYear, endYear);
  const allData = {};

  for (const leagueId of selectedLeagues) {
    const info = LEAGUE_IDS[leagueId];
    if (!info) {
      console.warn(`⚠️  Unknown league: ${leagueId}`);
      continue;
    }

    allData[leagueId] = {
      country: info.country,
      league: info.league,
      seasons: {},
    };

    for (const season of seasons) {
      const url = `https://www.football-data.co.uk/mmz4281/${season.id}/${leagueId}.csv`;
      try {
        process.stdout.write(`   📥 ${info.country} ${season.name}... `);
        const csv = await fetchCSV(url);
        const rows = parseCSV(csv);
        const matches = rows.map(extractMatch).filter(Boolean);

        if (matches.length > 0) {
          allData[leagueId].seasons[season.name] = {
            year: season.year,
            matches,
          };
          console.log(`✅ ${matches.length} matches`);
        } else {
          console.log("⚠️  no matches parsed");
        }

        // Polite delay to avoid hammering the server
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.log(`❌ ${err.message}`);
      }
    }
  }

  // Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, "matches.json");
  fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2));

  // Calculate stats
  let totalMatches = 0;
  let totalSeasons = 0;
  for (const league of Object.values(allData)) {
    for (const season of Object.values(league.seasons)) {
      totalMatches += season.matches.length;
      totalSeasons++;
    }
  }

  console.log("");
  console.log(`✅ Done! Saved ${totalMatches.toLocaleString()} matches across ${totalSeasons} league-seasons`);
  console.log(`   → ${outputPath}`);
  console.log("");
  console.log("💡 Commit this file to your repo, or re-run periodically to update.");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
