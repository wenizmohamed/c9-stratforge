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

`analyzeRoundEconomy(rawGridJson)` accepts a GRID GraphQL JSON object or JSON string with `data.seriesState.games[]` and analyzes every game's `rounds[]` without changing the input. It returns `games`, each with per-round `teams` and per-team summaries. Game teams come from `game.teams` or, if absent or null, `seriesState.teams`; an explicitly empty or non-array game team list is not replaced. Duplicate team IDs are excluded as ambiguous, and outcomes naming them are unknown. Player IDs in those rosters can resolve purchase records missing `teamId`. When a game team's roster is absent or null, its uniquely matching series team roster is used; an explicitly empty game roster is not replaced.

For each team-round, five distinct `weaponPurchases` records with nonnegative safe-integer `creditsBeforeBuy` and `creditsRemaining` are required for average spend (before minus remaining). Credit and round-number strings must contain only decimal digits after trimming whitespace; fractional, exponent and hexadecimal strings are rejected. Averages use exact integer totals before conversion to JavaScript numbers, avoiding intermediate overflow. Identifiers must be nonempty strings or safe integer numbers; malformed team assignments, including blank strings, make that player's team ambiguous rather than falling back to the roster. Omitted or null team assignments can use the roster. Players listed on multiple team rosters, or assigned to conflicting teams by the roster and purchase records or by purchase records in the same round, are excluded as ambiguous. A team-attributed purchase with an invalid or ambiguous player ID makes that team's economy unknown, even when five other players are present. Duplicate records, missing players, invalid values, or remaining credits above the starting bank make spend unknown (`null`); the starting-bank average can still be known when only remaining credits are missing. Round outcomes are unknown when the winner is missing or not a listed team. No economy values or winners are fabricated.

The labels are **spending tiers**, not inferred loadout values: `pistol` for rounds 1 and 13, `full` for average spend >= 3,900 credits, `partial` for 2,000–3,899, and `eco` below 2,000. A `force` is a qualifying post-loss round with average spend >= 2,000. Qualifying opportunities require a known loss in the immediately preceding numbered round, average starting bank below 3,900, and observable spend. Classification is independent of array order, the report preserves input order, and duplicate round numbers are ambiguous. Pistol rounds and all overtime rounds (25+) are excluded; gaps and unknown preceding results are not treated as losses. `forceBuyOpportunity` and `forceBuy` use `null` for unobservable or inapplicable cases. Summaries report observable opportunity counts, force counts, force rate, and force-round wins/rate over known outcomes; rates are percentages rounded to one decimal or `null` for an empty denominator.

Per-round observations retain unnumbered and duplicate-numbered records, but team summaries exclude them because they cannot be reliably counted as distinct rounds.

When both `sequenceNumber` and `roundNumber` are present they must be valid and agree. Conflicting or malformed aliases, including explicit nulls, make the record unnumbered and mark any valid candidate numbers ambiguous, so they cannot silently hide duplicate rounds. Similarly, `winningTeamId` and `winnerTeamId` must agree when both are present; malformed or conflicting winner aliases leave the outcome unknown. Omitted aliases do not affect a valid alias.

This is a configurable-by-code heuristic, not evidence of actual loadout value or a complete tactical buy: carried weapons, drops, free equipment, and utility cannot be reconstructed from bank changes. If GRID does not supply these economy fields, results remain unknown rather than being estimated. Bundled presets are synthetic examples, not real-match evidence; their round and purchase fields have not been validated against an actual GRID export. [GRID's Series State documentation](https://docs.grid.gg/public/documentation/api-documentation/in-game-data/series-state) describes rounds as game segments; this analyzer only reads the `rounds[]` and purchase fields described above and does not map segment-based exports.

```js
import { analyzeRoundEconomy } from './src/economy.js';

const report = analyzeRoundEconomy(gridPayload);
console.log(report.games[0].teams); // per-team tendency summaries
```

### 6. Side-by-Side Series Delta & Win-Condition Simulator (`src/simulator.js`)
- **Baseline Observed vs Simulated Counter-Plan:** Compares real GRID match telemetry (scoreline, round win rate, BO3 series win probability, target Op output, opponent bank/force rate) side-by-side against a live deterministic counter-plan projection.
- **Interactive Coaching Controls:** Adjust Target Operator Opening Denial (`0-100%`), Economy Swing Pressure (`0-100%`), and 3 anti-Op utility protocol toggles (`Smoke-Off Sightlines`, `Flash-Trade Double-Swing`, `Chain Economy Break`), or apply 1-click scenarios (**Default Baseline**, **Full Anti-Op Lock**, **Economy Choke**).
- **Exact Probabilistic Win-Condition Math:** Computes projected regulation First-to-13 map scoreline, round win-rate delta, closed-form First-to-13 + Overtime map win probability, Best-of-3 series win probability (`q^2 * (3 - 2q)`), credit swing per half (rounded to VALORANT's `$50` increment), and eco-break rounds gained.
- **Live Coach Dossier Sync:** Automatically embeds the active simulation scenario, metrics table, and verdict into exported `.md` and `.json` Anti-Op Dossiers.

---

## Quick Start

```bash
# Run deterministic unit & integration test suite (59/59 passing on Node 18+, zero external dependencies)
npm test

# Start local static server on http://127.0.0.1:4173
npm start
```

## Project Structure

```text
cloud9-stratforge/
├── .idea/                     # JetBrains WebStorm / PyCharm workspace & Run Configurations
├── .junie/                    # Junie engineering guidelines & TDD session logs
├── src/
│   ├── maps.js                # Ascent, Haven & Split SVG geometry + coordinate normalization
│   ├── gridParser.js          # Official GRID Series State JSON parser + 3 pro match presets
│   ├── analytics.js           # Deterministic clustering, WR delta, Op profiler & dossier engine
│   ├── economy.js             # Round spending & force-buy tendency analyzer
│   └── simulator.js           # Side-by-side Series Delta & BO3 Win-Condition Simulator
├── test/
│   ├── analytics.test.js      # Tactical analytics unit/integration tests (node:test)
│   ├── economy.test.js        # Economy and force-buy edge-case tests (node:test)
│   └── simulator.test.js      # Series Delta & Win-Condition Simulator tests (node:test)
├── scripts/
│   ├── serve.mjs              # Zero-dependency local ESM static server
│   └── verify-e2e.mjs         # Headless Playwright multi-viewport verification suite
├── assets/                    # Verified Riot minimaps, portraits, screenshots & Devpost thumbnail
├── index.html                 # Main C9 StratForge Tactical Dashboard + Series Delta Simulator
├── workflow.html              # Best AI-Powered Workflow Story interactive case study
├── styles.css                 # Warm Sunlit Editorial Bento & Obsidian Tactical Stage design system
├── app.js                     # Interactive SVG Radar, Simulator, Profiler, Dossier & Modal controller
├── AI_WORKFLOW_STORY.md       # Bonus Track written workflow case study
├── vercel.json                # Production static deployment headers
├── package.json
└── LICENSE                    # MIT License
```

## License

MIT License — see [LICENSE](./LICENSE).
