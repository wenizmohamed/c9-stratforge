# Junie Project Guidelines - C9 StratForge

## Architecture & Runtime
- Zero-build native ES Modules (`"type": "module"` in `package.json`), shared directly between modern browsers and Node.js >= 18.
- Keep all tactical analytics pure and deterministic inside `src/` (`src/gridParser.js`, `src/maps.js`, `src/analytics.js`, `src/economy.js`). Never introduce external runtime npm dependencies.
- Official GRID Esports Series State JSON (`data.seriesState.games[].rounds[]`) is the single source of truth for all match telemetry.

## Visual & UX Invariants
- Preserve the sunlit Cloud9 editorial design system in `index.html`, `workflow.html`, and `styles.css`: cream-to-Cloud9-sky gradients (`#FAF8F4` to `#D9ECF8`), crisp white cards, `Space Grotesk` + italic `Instrument Serif` + `Instrument Sans` + `JetBrains Mono` typography.
- Never replace official locally vendored VALORANT assets (`assets/valorant/`) or alter calibrated minimap coordinates.

## Verification Contract
- Every module added or modified in `src/` must have deterministic `node:test` unit coverage under `test/`.
- Always run `npm test` before finishing any task and confirm 100% passing assertions with zero regressions.
