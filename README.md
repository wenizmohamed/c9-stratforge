# C9 StratForge — VALORANT Tactical Scouting & Operator Profiler

> **Cloud9 x JetBrains: Sky's The Limit Hackathon 2026**  
> **Category 1:** VALORANT Tactical Scouting, Utility Placement & Operator Profiler  
> **Bonus Track:** Best AI-Powered Workflow Story (`/workflow.html` & `AI_WORKFLOW_STORY.md`)

**C9 StratForge** turns official **GRID Esports Series State JSON** match telemetry into an interactive SVG tactical radar, spatial utility cluster & win-rate delta engine, Operator tendency profiler, and 1-click **Anti-Op Counter-Strat Dossier** generator for VALORANT coaching staffs.

---

## Key Capabilities

### 1. Official GRID Series State JSON Engine (`src/gridParser.js`)
- Parses official GRID GraphQL `data.seriesState.games[]` payloads (teams, players, rounds, weapon purchases, utility events, kills, and world/radar coordinates).
- Bundles 3 realistic pro scouting presets dogfooded through the exact same parser:
  - **C9 vs Sentinels — Ascent** (VCT Americas Stage 1, 24 rounds, OXY vs zekken Op duel)
  - **C9 White (GC) vs G2 Gozen — Haven** (VCT Game Changers Championship, 23 rounds, 3-site control)
  - **VCT Americas Playoff — Split** (Cloud9 vs LOUD, 22 rounds, Mail/Vent/Ramp setups)
- **Live Drag-and-Drop / Paste JSON Importer** with schema validation and instant full-app recalculation.

### 2. Utility Placement & Ability Analysis Engine (`src/analytics.js`)
- **Interactive SVG Tactical Radar** for Ascent, Haven, and Split with architectural callout layouts, clickable utility pins, radial cluster heatmap rings, and Operator sightline cones.
- **Layer Toggles & Round-Phase Slider (`0:00–1:40`):** Toggle Smokes, Flashes, Recon, Molotovs, Op Sightlines, and Heatmap Rings; filter by side/team and scrub across round phases.
- **Win-Rate Delta per Utility Setup:** Calculates exact win-rate lift (`+18.4% WR`) comparing rounds where a setup was deployed vs non-deployed baseline rounds.
- **Automatic Counter-Utility Recommendations:** Prioritized counter-ability prescriptions with timing windows and target callouts.

### 3. Operator Tendency & Sniper Profiler (`src/analytics.js`)
- **Economy Thresholds:** `>=$4,700` full-buy vs `<$4,700` / no-armor glass-cannon Op buy tracking & live alert thresholds.
- **First-Blood Angle Frequency:** Ranked Operator sightlines with duel frequency, first bloods, K/D, and average peek clock.
- **Early-Peek Timing Histogram:** 6-bucket clock distribution (`0:00-0:10` through `0:50+`) separating Op picks vs Op deaths.
- **Site-Anchor vs Mid-Roam Split & Trade-Death Vulnerability Score (0–100):** Weighted composite vulnerability index with side-by-side 6-axis SVG radar comparison.
- **1-Click Anti-Op Counter-Strat Dossier Export:** Copy or download complete coach briefings in `.md` and `.json` formats.

### 4. JetBrains IDE Workspace & AI-Powered Workflow Story
- Includes genuine JetBrains `.idea/` configuration (`workspace.xml`, `misc.xml`, `modules.xml`, `c9-stratforge.iml`, `inspectionProfiles/Project_Default.xml`) with pre-wired Run Configurations.
- Dedicated **`/workflow.html`** and **[AI_WORKFLOW_STORY.md](./AI_WORKFLOW_STORY.md)** documenting the JetBrains + AI agent development loop.

### 5. Round Economy & Force-Buy Tendency (`src/economy.js`)

`analyzeRoundEconomy(rawGridJson)` accepts a GRID GraphQL JSON object or JSON string with `data.seriesState.games[]` and analyzes every game's `rounds[]` without changing the input. It returns `games`, each with per-round `teams` and per-team summaries. Game teams come from `game.teams` or, if absent, `seriesState.teams`; player IDs in those rosters can resolve purchase records missing `teamId`.

For each team-round, five distinct `weaponPurchases` records with nonnegative integer `creditsBeforeBuy` and `creditsRemaining` are required for average spend (before minus remaining). Players listed on multiple team rosters, or assigned to conflicting teams by the roster and purchase records or by purchase records in the same round, are excluded as ambiguous. Duplicate records, missing players, invalid values, or remaining credits above the starting bank make spend unknown (`null`); the starting-bank average can still be known when only remaining credits are missing. Round outcomes are unknown when the winner is missing or not a listed team. No economy values or winners are fabricated.

The labels are **spending tiers**, not inferred loadout values: `pistol` for rounds 1 and 13, `full` for average spend >= 3,900 credits, `partial` for 2,000–3,899, and `eco` below 2,000. A `force` is a qualifying post-loss round with average spend >= 2,000. Qualifying opportunities require a known loss in the immediately preceding numbered round, average starting bank below 3,900, and observable spend. Classification is independent of array order, the report preserves input order, and duplicate round numbers are ambiguous. Pistol rounds and all overtime rounds (25+) are excluded; gaps and unknown preceding results are not treated as losses. `forceBuyOpportunity` and `forceBuy` use `null` for unobservable or inapplicable cases. Summaries report observable opportunity counts, force counts, force rate, and force-round wins/rate over known outcomes; rates are percentages rounded to one decimal or `null` for an empty denominator.

This is a configurable-by-code heuristic, not evidence of actual loadout value or a complete tactical buy: carried weapons, drops, free equipment, and utility cannot be reconstructed from bank changes. If GRID does not supply these economy fields, results remain unknown rather than being estimated. Bundled presets are synthetic examples, not real-match evidence.

```js
import { analyzeRoundEconomy } from './src/economy.js';

const report = analyzeRoundEconomy(gridPayload);
console.log(report.games[0].teams); // per-team tendency summaries
```

---

## Quick Start

```bash
# Run deterministic unit & integration test suite (Node 18+, zero external dependencies)
npm test

# Start local static server on http://127.0.0.1:4173
npm start
```

## Project Structure

```text
cloud9-stratforge/
├── .idea/                     # JetBrains WebStorm / PyCharm workspace & Run Configurations
├── src/
│   ├── maps.js                # Ascent, Haven & Split SVG geometry + coordinate normalization
│   ├── gridParser.js          # Official GRID Series State JSON parser + 3 pro match presets
│   ├── analytics.js           # Deterministic clustering, WR delta, Op profiler & dossier engine
│   └── economy.js             # Round spending & force-buy tendency analyzer
├── test/
│   ├── analytics.test.js      # Tactical analytics unit/integration tests (node:test)
│   └── economy.test.js        # Economy and force-buy unit tests (node:test)
├── scripts/
│   └── serve.mjs              # Zero-dependency local ESM static server
├── assets/                    # Verified Playwright screenshots & Devpost thumbnail
├── index.html                 # Main C9 StratForge Tactical Dashboard
├── workflow.html              # Best AI-Powered Workflow Story interactive case study
├── styles.css                 # Championship Tactical Slate & Cloud9 Cyan design system
├── app.js                     # Interactive SVG Radar, Profiler, Dossier & Modal controller
├── AI_WORKFLOW_STORY.md       # Bonus Track written workflow case study
├── vercel.json                # Production static deployment headers
├── package.json
└── LICENSE                    # MIT License
```

## License

MIT License — see [LICENSE](./LICENSE).
