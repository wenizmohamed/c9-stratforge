# AI-Powered Workflow Story — C9 StratForge
**Cloud9 x JetBrains: Sky's The Limit Hackathon 2026 ($1,000 Bonus Track: Best AI-Powered Workflow Story)**

---

## Executive Summary

**C9 StratForge** is a zero-build, championship-grade VALORANT tactical scouting and Operator tendency intelligence platform powered by official **GRID Esports Series State JSON** telemetry.

Instead of treating AI as a brittle runtime chatbot wrapper that hallucinates esports statistics, we engineered an **AI-native JetBrains IDE development loop** where JetBrains WebStorm/PyCharm static analysis, AI agent code synthesis, native `node:test` verification, and headless Playwright E2E regression checks worked together to ship a fully deterministic scouting suite in a single disciplined sprint.

---

## The 4-Stage JetBrains + AI Agent Workflow

### Stage 1: Schema-First GRID Telemetry Modeling (`src/gridParser.js`)
- **Challenge:** Official GRID Series State JSON payloads are deeply nested (`data.seriesState.games[].rounds[]`) with heterogeneous weapon inventories, ability names, and world-space coordinates.
- **AI-Assisted Solution:** We instructed the agent to define the canonical `parseGridSeriesState()` normalizer *first* and construct all three bundled pro scouting presets (`C9 vs Sentinels - Ascent`, `C9 White (GC) vs G2 Gozen - Haven`, and `VCT Americas Playoff - Split`) strictly as official GRID Series State JSON fixtures fed through that exact parser.
- **Outcome:** 100% parity between bundled presets and live coach drag-and-drop JSON imports, with automatic VALORANT ability classification (`smoke`, `flash`, `recon`, `molotov`).

### Stage 2: Spatial SVG Radar Geometry & Callout Mapping (`src/maps.js`)
- **Challenge:** Plotting utility clusters and Operator sightline cones across multi-site maps (2-site Ascent/Split and 3-site Haven) requires accurate floorplan geometry and reliable coordinate normalization.
- **AI-Assisted Solution:** We authored normalized `0..1000` architectural SVG map layouts with 42 tactical callout zones and automatic world-coordinate-to-radar projection (`normalizeCoordinate()` + `resolveCallout()`).
- **JetBrains Integration:** WebStorm's ES6 module resolver and `ES6UnusedImports` / `JSUnresolvedReference` inspections (`.idea/inspectionProfiles/Project_Default.xml`) caught symbol drift immediately across `maps.js`, `gridParser.js`, and `app.js`.

### Stage 3: Deterministic Tactical Analytics Engine (`src/analytics.js`)
- **Challenge:** VCT coaches require auditable, reproducible numbers during map veto and tactical timeouts — not probabilistic LLM summaries.
- **AI-Assisted Solution:** We used AI pair engineering to implement pure deterministic algorithms shared directly by the browser and Node.js:
  1. **Spatial Coordinate Clustering:** Euclidean radius clustering (`r = 64`) producing cluster centroids, density heat scores, and dominant utility mixes.
  2. **Win-Rate Delta per Utility Setup:** Compares round win rate when a setup is deployed against non-deployed baseline rounds (`+18.4% WR` deltas).
  3. **Operator Tendency Profiler:** Tracks `>=$4,700` full-buy vs `<$4,700` / no-armor glass-cannon Op buys, 6-bucket early-peek timing histograms (`0:00–0:50+`), site-anchor vs mid-roam splits, and a composite `0–100` Trade-Death Vulnerability Score.
  4. **1-Click Anti-Op Dossier Export:** Synthesizes structured `.json` and ready-to-paste `.md` coaching dossiers deterministically in under 5ms.

### Stage 4: JetBrains Run Configurations + Automated Verification Gate
- **JetBrains Workspace (`.idea/`):** Pre-configured `workspace.xml`, `misc.xml`, `modules.xml`, and `c9-stratforge.iml` with one-click Node.js run configurations:
  - `C9 StratForge Dev Server` (`node scripts/serve.mjs`)
  - `Run Analytics Unit Tests` (`node --test test/analytics.test.js`)
- **Two-Layer Automated Verification:**
  1. **Unit & Integration Tests (`npm test`):** Verifies GRID schema parsing, error handling, spatial clustering, win-rate delta math, counter-utility recommendations, Operator economy/vulnerability calculations, and Markdown/JSON dossier generation.
  2. **Playwright Headless E2E Audit:** Boots the local server, exercises preset switching, layer toggling, SVG pin inspection, Operator comparison, and custom GRID JSON import, asserting `0 console errors`, `0 page errors`, and `0px horizontal overflow` at both `1440px` desktop and `390px` mobile viewports before deploying live to Vercel.

---

## Why This Workflow Wins for Esports Engineering Teams

1. **Zero-Build Shared ESM = Sub-Second Feedback:** Both JetBrains Node debuggers and modern browsers execute the exact same `src/*.js` modules without bundler friction.
2. **Auditability Over Magic:** AI accelerates architecture, geometry, and test authoring while keeping match analytics 100% deterministic and offline-capable.
3. **Ship-Ready Discipline:** Every commit is gated by automated tests, visual multi-viewport Playwright checks, and live HTTP 200 verification on production routes (`/` and `/workflow.html`).
