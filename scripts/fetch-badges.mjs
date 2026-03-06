#!/usr/bin/env node
/**
 * fetch-badges.mjs
 * 
 * Fetches team badge/crest URLs from TheSportsDB free API
 * and saves them as a JSON mapping: { "TeamName": "https://...badge.png" }
 * 
 * Usage:
 *   node scripts/fetch-badges.mjs
 * 
 * The resulting public/data/badges.json is loaded by the app at runtime.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "public", "data");

// TheSportsDB league IDs for our supported leagues
const LEAGUES = {
  "English Premier League": 4328,
  "English League Championship": 4329,
  "Spanish La Liga": 4335,
  "German Bundesliga": 4331,
  "Italian Serie A": 4332,
  "French Ligue 1": 4334,
  "Dutch Eredivisie": 4337,
  "Portuguese Primeira Liga": 4344,
  "Belgian Pro League": 4338,
  "Scottish Premier League": 4330,
  "Turkish Super Lig": 4339,
};

const API_BASE = "https://www.thesportsdb.com/api/v1/json/3";

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log("🏆 Fetching team badges from TheSportsDB...\n");

  const badges = {};
  let totalTeams = 0;

  for (const [leagueName, leagueId] of Object.entries(LEAGUES)) {
    process.stdout.write(`   📥 ${leagueName}... `);
    try {
      const data = await fetchJSON(
        `${API_BASE}/search_all_teams.php?l=${encodeURIComponent(leagueName)}`
      );

      if (data.teams) {
        for (const team of data.teams) {
          const name = team.strTeam;
          const badge = team.strBadge || team.strTeamBadge || "";
          if (name && badge) {
            // Store under multiple name variants for fuzzy matching
            badges[name] = badge;
            totalTeams++;

            // Also store common short names / alternate names
            if (team.strTeamShort) badges[team.strTeamShort] = badge;
            if (team.strTeamAlternate) {
              team.strTeamAlternate.split(",").forEach(alt => {
                const trimmed = alt.trim();
                if (trimmed) badges[trimmed] = badge;
              });
            }
          }
        }
        console.log(`✅ ${data.teams.length} teams`);
      } else {
        console.log("⚠️  no teams found");
      }

      // Be polite
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`❌ ${err.message}`);
    }
  }

  // Add common football-data.co.uk name mappings that differ from TheSportsDB
  // Add common football-data.co.uk name mappings that differ from TheSportsDB
  const ALIASES = {
    // English
    "Man City": "Manchester City",
    "Man United": "Manchester United",
    "Nott'm Forest": "Nottingham Forest",
    "Sheffield United": "Sheffield United",
    "Wolves": "Wolverhampton Wanderers",
    "West Ham": "West Ham United",
    "Newcastle": "Newcastle United",
    "Tottenham": "Tottenham Hotspur",
    
    // German
    "Ein Frankfurt": "Eintracht Frankfurt",
    "M'gladbach": "Borussia Monchengladbach",
    "Dortmund": "Borussia Dortmund",
    "FC Köln": "FC Cologne",
    "Leverkusen": "Bayer Leverkusen",
    
    // Spanish
    "Ath Madrid": "Atletico Madrid",
    "Betis": "Real Betis",
    "Celta Vigo": "Celta de Vigo",
    "Vallecano": "Rayo Vallecano",
    "Sociedad": "Real Sociedad",
    "Ath Bilbao": "Athletic Bilbao",
    "Athletic Bilbao": "Athletic Club",
    "Espanol": "Espanyol",
    
    // Italian
    "Hellas Verona": "Verona",
    "AC Milan": "Milan",
    "Parma": "Parma Calcio 1913",

    // Netherlands
    "Zwolle": "PEC Zwolle",
    "Volendam": "FC Volendam",

    // Portugal
    "Sp Lisbon": "Sporting CP",
    "Guimaraes": "Vitória de Guimarães",
    "Sp Braga": "Sporting Braga",

    // Belgium
    "St. Gilloise": "Union SG",         // Union Saint-Gilloise
    "St Truiden": "Sint-Truiden",
    "Waregem": "Zulte Waregem",
    "Standard": "Standard Liège",
    "RAAL La Louviere":"RAAL La Louvière",
    "Oud-Heverlee Leuven": "OH Leuven",
    

    // Scotland (All 12 Teams)
    "Hearts": "Heart of Midlothian",
    "Celtic": "Celtic",
    "Rangers": "Rangers",
    "Motherwell": "Motherwell",
    "Hibernian": "Hibernian",
    "Falkirk": "Falkirk",
    "Aberdeen": "Aberdeen",
    "Dundee United": "Dundee United",
    "Dundee": "Dundee",
    "St Mirren": "St. Mirren",
    "Livingston": "Livingston",
    "Kilmarnock": "Kilmarnock",

    // Turkey (All 18 Teams from your data)
    "Galatasaray": "Galatasaray",
    "Fenerbahce": "Fenerbahçe",
    "Trabzonspor": "Trabzonspor",
    "Goztep": "Göztepe",
    "Besiktas": "Beşiktaş",
    "Buyuksehyr": "İstanbul Başakşehir", 
    "Samsunspor": "Samsunspor",
    "Gaziantep": "Gaziantep FK",
    "Kocaelispor": "Kocaelispor",
    "Rizespor": "Çaykur Rizespor",
    "Alanyaspor": "Alanyaspor",
    "Genclerbirligi": "Gençlerbirliği",
    "Konyaspor": "Konyaspor",
    "Kasimpasa": "Kasımpaşa",
    "Antalyaspor": "Antalyaspor",
    "Eyupspor": "Eyüpspor",
    "Kayserispor": "Kayserispor",
    "Karagumruk": "Fatih Karagümrük"
  };

  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (badges[canonical] && !badges[alias]) {
      badges[alias] = badges[canonical];
    }
  }

  // Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, "badges.json");
  fs.writeFileSync(outputPath, JSON.stringify(badges, null, 2));

  console.log(`\n✅ Done! Saved ${totalTeams} team badges`);
  console.log(`   → ${outputPath}\n`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
