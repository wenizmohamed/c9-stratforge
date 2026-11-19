# AI-Powered Workflow Story - C9 StratForge
**Cloud9 x JetBrains: Sky's The Limit Hackathon 2026 ($1,000 Bonus Prize: Best AI-Powered Workflow Story)**

---

## Executive Summary

**C9 StratForge** is a zero-build, championship-grade VALORANT and Game Changers tactical scouting desk powered by official **GRID Esports Series State JSON** telemetry.

Instead of shipping a brittle runtime LLM wrapper that hallucinates match stats, we engineered an **agentic JetBrains development loop** combining **WebStorm 2026.3**, **JetBrains Air (`com.intellij.air`)**, and **AI Coding Agent Junie (`26.11.2 / 4100.10`)** with native `node:test` TDD gates and headless Playwright multi-viewport regression checks. Every feature was planned, synthesized, verified, and audited inside the JetBrains toolchain while keeping live match math 100% deterministic and offline-capable.

---

## Verified JetBrains Toolchain & Repo Evidence

| Tool | Role in C9 StratForge | Supporting Repo Evidence |
| :--- | :--- | :--- |
| **WebStorm 2026.3** | Primary IDE, ES6 module inspection, one-click `Run Analytics Unit Tests` and `C9 StratForge Dev Server` run configurations, diff review | `.idea/workspace.xml`, `.idea/inspectionProfiles/Project_Default.xml`, `.idea/c9-stratforge.iml` |
| **AI Coding Agent Junie (`26.11.2 / 4100.10`)** | Guideline-driven architecture audit (`session-261120-003936-ldke`) and full TDD implementation of the deterministic Round Economy & Force-Buy Analyzer (`session-261120-004334-1lf2`) | `.junie/guidelines.md`, `.junie/sessions/junie-economy-engine-session.json`, `src/economy.js`, `test/economy.test.js` |
| **JetBrains Air (`com.intellij.air` ACP)** | Multi-agent IDE orchestration layer inside WebStorm 2026.3 running Junie ACP (`v4100.8.0`) side-by-side with live IDE diff & test tooling | `assets/jetbrains-air-junie-workspace.png` |

---

## The 5-Stage JetBrains + Junie + Air Workflow

### Stage 1: Schema-First GRID Telemetry Modeling (`src/gridParser.js`)
- **Challenge:** Official GRID Series State JSON payloads are deeply nested (`data.seriesState.games[].rounds[]`) with heterogeneous weapon inventories, ability names, and world-space coordinates.
- **Solution:** Defined the canonical `parseGridSeriesState()` normalizer first and constructed all three bundled pro scouting presets (`C9 vs Sentinels - Ascent`, `C9 White (GC) vs G2 Gozen - Haven`, and `VCT Americas Playoff - Split`) strictly as official GRID Series State JSON fixtures fed through that exact parser.
- **Outcome:** 100% parity between bundled presets and live coach drag-and-drop JSON imports, with automatic VALORANT ability classification (`smoke`, `flash`, `recon`, `molotov`).

### Stage 2: Spatial SVG Radar Geometry & Official Riot Minimap Calibration (`src/maps.js`)
- **Challenge:** Plotting utility clusters and Operator sightline cones across multi-site maps (2-site Ascent/Split and 3-site Haven) requires accurate floorplan geometry and reliable coordinate normalization.
- **Solution:** Built normalized `0..1000` radar projections calibrated to official locally vendored Riot VALORANT minimaps (`assets/valorant/`) with 42 tactical callout zones (`normalizeCoordinate()` + `resolveCallout()`).
- **WebStorm Integration:** WebStorm's ES6 module resolver and `ES6UnusedImports` / `JSUnresolvedReference` inspections caught symbol drift immediately across `maps.js`, `gridParser.js`, `economy.js`, and `app.js`.

### Stage 3: Deterministic Tactical Analytics & Operator Profiler (`src/analytics.js`)
- **Challenge:** VCT coaches require auditable, reproducible numbers during map veto and tactical timeouts, not probabilistic LLM guesses.
- **Solution:** Pure deterministic algorithms shared directly by the browser and Node.js:
  1. **Spatial Coordinate Clustering:** Euclidean radius clustering (`r = 64`) producing cluster centroids, density heat scores, and dominant utility mixes.
  2. **Win-Rate Delta per Utility Setup:** Compares round win rate when a setup is deployed against non-deployed baseline rounds.
  3. **Operator Tendency Profiler:** Tracks `>=$4,700` full-buy vs `<$4,700` / no-armor glass-cannon Op buys, 6-bucket early-peek timing histograms (`0:00-0:50+`), site-anchor vs mid-roam splits, and a composite `0-100` Trade-Death Vulnerability Score.
  4. **1-Click Anti-Op Dossier Export:** Synthesizes structured `.json` and ready-to-paste `.md` coaching dossiers deterministically in under 5ms.

### Stage 4: Guideline-Driven TDD Sprint with Junie + JetBrains Air (`src/economy.js`, `test/economy.test.js`)
- **Challenge:** Coaches also need deterministic round-economy and post-loss force-buy tendency analytics across multi-game GRID series without inventing totals when telemetry fields are incomplete or malformed.
- **Junie + Air Execution:**
  1. Codified architecture, zero-dependency ESM, visual preservation, and testing invariants inside `.junie/guidelines.md`.
  2. Ran an initial read-only Junie architecture audit (`session-261120-003936-ldke`) to map the exact parser and test contracts.
  3. Dispatched Junie (`session-261120-004334-1lf2`) to execute a strict red-green TDD cycle: Junie authored `test/economy.test.js` first (verifying failure before implementation), built `src/economy.js` with explicit missing-data handling (pistol/eco/force/full-buy thresholds, consecutive-loss force-buy rate, overtime/reset exclusion, and malformed credit rejection), updated `README.md` and `package.json`, and verified all **18/18 `node:test` assertions passing** (`git diff --check` clean).
  4. Orchestrated side-by-side review and verification inside **WebStorm 2026.3** using **JetBrains Air** (`com.intellij.air` ACP with **Junie** enabled).

### Stage 5: Two-Layer Automated Verification Gate
1. **Unit & Integration Tests (`npm test`):** `node --test test/analytics.test.js test/economy.test.js` passes **18/18** deterministic checks covering map coordinate normalization, ability classification, GRID JSON parsing/rejection, utility clustering, Operator profiling, dossier export, and round-economy / force-buy edge cases.
2. **Playwright Headless E2E Audit (`scripts/verify-e2e.mjs`):** Boots the local ESM server, exercises preset switching, layer toggling, live round replay (`0:00-1:40`), coach Draw mode, Operator comparison, and custom GRID JSON import, asserting `0 console errors`, `0 page errors`, valid Riot image dimensions (`naturalWidth > 0`), and `0px horizontal overflow` across `1440px` desktop and `390px` mobile viewports before deploying live to Vercel.

---

## Why This Workflow Wins for Esports Engineering Teams

1. **Guidelines + TDD Keep Agents Grounded:** Checking `.junie/guidelines.md` into the repo ensured Junie respected zero-build ESM, never touched the calibrated UI design tokens, and wrote failing tests before writing `src/economy.js`.
2. **Side-by-Side IDE Orchestration in JetBrains Air:** Running Junie through JetBrains Air inside WebStorm 2026.3 kept agent runs, git diffs, ES module inspections, and `node:test` configurations in one workspace.
3. **Auditability Over Magic:** AI accelerated architecture, economy edge-case hardening, and test authoring while keeping every match number 100% deterministic, verifiable, and instant offline.
