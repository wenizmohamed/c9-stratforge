/**
 * C9 StratForge - VALORANT Tactical Scouting Workbench
 * Connects GRID Series State Parser + Deterministic Analytics Engine to:
 * - Real Official Riot VALORANT Minimaps, Map Splash Art & Agent Portraits
 * - Live Round Clock Replay & Freehand Coach Whiteboard Draw Layer
 * - Warm Editorial Bento Dashboard, Operator Profiler, Dossier & GRID JSON Importer
 */

import { getMapSpec } from './src/maps.js';
import {
  ABILITY_CATEGORIES,
  PRESET_METADATA,
  getPreset,
  getRawPresetJson,
  getSampleGridJson,
  parseGridSeriesState
} from './src/gridParser.js';
import {
  analyzeOperators,
  analyzeUtility,
  formatClock,
  generateAntiOpDossier
} from './src/analytics.js';
import { analyzeRoundEconomy } from './src/economy.js';
import {
  SIMULATION_PRESETS,
  formatSignedCredits,
  formatSignedDelta,
  simulateSeriesDelta
} from './src/simulator.js';

const LAYER_COLORS = {
  smoke: '#00AEEF',
  flash: '#E5A024',
  recon: '#179A6B',
  molotov: '#FF4655'
};

const KNOWN_AGENTS = new Set([
  'astra', 'breach', 'chamber', 'cypher', 'fade', 'jett', 'kayo',
  'killjoy', 'omen', 'raze', 'skye', 'sova', 'viper'
]);

const KNOWN_MAPS = new Set(['ascent', 'haven', 'split']);

// Per-map calibrated transforms to align Riot 1024x1024 minimaps (rotated 90deg CW)
// with src/maps.js 0..1000 normalized tactical coordinate space.
const MAP_IMAGE_TRANSFORMS = {
  ascent: 'translate(-32, 34) translate(500, 500) scale(0.96, 1.06) rotate(90) translate(-500, -500)',
  haven: 'translate(0, -38) translate(500, 500) scale(1.0, 1.02) rotate(90) translate(-500, -500)',
  split: 'translate(24, 20) translate(500, 500) scale(0.96, 1.03) rotate(90) translate(-500, -500)'
};

const PHASE_WINDOWS = [
  { min: 0, max: 25, short: '0:25', label: '0:00-0:25' },
  { min: 25, max: 55, short: '0:55', label: '0:25-0:55' },
  { min: 55, max: 75, short: '1:15', label: '0:55-1:15' },
  { min: 75, max: 100, short: '1:40', label: '1:15-1:40' }
];

const state = {
  presetId: 'c9-sen-ascent',
  isCustomImport: false,
  rawGridPayload: null,
  parsedMatch: null,
  activeTab: 'radar',
  filters: {
    roundNumber: null,
    side: 'all',
    teamId: 'all',
    minTime: 0,
    maxTime: 100,
    layers: {
      smoke: true,
      flash: true,
      recon: true,
      molotov: true,
      sightlines: true,
      heatmap: true
    }
  },
  selectedClusterId: null,
  selectedEventId: null,
  targetOpPlayerId: null,
  compareOpPlayerId: null,
  checkedCounters: new Set(),
  replayActive: false,
  replayTimer: null,
  drawMode: false,
  isDrawing: false,
  drawStrokes: [],
  activeStroke: null,
  utilityReport: null,
  fullUtilityReport: null,
  operatorReport: null,
  economyReport: null,
  simulation: {
    preset: 'anti-op-lock',
    opDenialPct: SIMULATION_PRESETS['anti-op-lock'].opDenialPct,
    economyPressurePct: SIMULATION_PRESETS['anti-op-lock'].economyPressurePct,
    protocols: { ...SIMULATION_PRESETS['anti-op-lock'].protocols }
  },
  simulationResult: null,
  dossier: null
};

const el = {
  presetSelect: document.getElementById('preset-select'),
  matchHeadline: document.getElementById('match-headline'),
  matchSubline: document.getElementById('match-subline'),
  kpiCapsules: document.getElementById('kpi-capsules'),
  openKpis: document.getElementById('open-kpis'),

  spotlightCard: document.getElementById('spotlight-card'),
  spotlightSplash: document.getElementById('spotlight-splash'),
  spotlightAgent: document.getElementById('spotlight-agent'),
  spotlightMapTag: document.getElementById('spotlight-map-tag'),
  spotlightName: document.getElementById('spotlight-name'),
  spotlightMeta: document.getElementById('spotlight-meta'),
  spotlightVulnPill: document.getElementById('spotlight-vuln-pill'),

  roundStrip: document.getElementById('round-strip'),
  btnAllRounds: document.getElementById('btn-all-rounds'),
  schemaMetaLabel: document.getElementById('schema-meta-label'),
  mapPanelTitle: document.getElementById('map-panel-title'),
  tacticalSvg: document.getElementById('tactical-svg'),
  mapCoordSummary: document.getElementById('map-coord-summary'),
  stageHint: document.getElementById('stage-hint'),

  btnReplay: document.getElementById('btn-replay'),
  replayIcon: document.getElementById('replay-icon'),
  replayLabel: document.getElementById('replay-label'),
  btnDrawToggle: document.getElementById('btn-draw-toggle'),
  btnDrawClear: document.getElementById('btn-draw-clear'),

  layerToggles: document.getElementById('layer-toggles'),
  sideFilter: document.getElementById('side-filter'),
  teamFilter: document.getElementById('team-filter'),
  phaseSlider: document.getElementById('phase-slider'),
  phaseClockReadout: document.getElementById('phase-clock-readout'),
  phasePresets: document.getElementById('phase-presets'),
  btnResetFilters: document.getElementById('btn-reset-filters'),

  pinInspector: document.getElementById('pin-inspector'),
  inspectorBadge: document.getElementById('inspector-badge'),
  counterProgress: document.getElementById('counter-progress'),
  counterRecommendations: document.getElementById('counter-recommendations'),

  setupImpactsBody: document.getElementById('setup-impacts-body'),
  activityPeakPct: document.getElementById('activity-peak-pct'),
  activityPeakLabel: document.getElementById('activity-peak-label'),
  phaseTimingBars: document.getElementById('phase-timing-bars'),
  btnFocusPeakPhase: document.getElementById('btn-focus-peak-phase'),
  dialPlayerChip: document.getElementById('dial-player-chip'),
  opThreatDial: document.getElementById('op-threat-dial'),
  btnJumpOp: document.getElementById('btn-jump-op'),

  opTargetImg: document.getElementById('op-target-img'),
  opCompareImg: document.getElementById('op-compare-img'),
  opTargetSelect: document.getElementById('op-target-select'),
  opCompareSelect: document.getElementById('op-compare-select'),
  opTargetBadges: document.getElementById('op-target-badges'),
  opCompareBadges: document.getElementById('op-compare-badges'),
  opRadarSvg: document.getElementById('op-radar-svg'),
  opRadarLegend: document.getElementById('op-radar-legend'),
  opEconomyBlock: document.getElementById('op-economy-block'),
  opPeekHistogram: document.getElementById('op-peek-histogram'),
  opRoleSplitBlock: document.getElementById('op-role-split-block'),
  opAnglesBody: document.getElementById('op-angles-body'),

  dossierSimSummary: document.getElementById('dossier-sim-summary'),
  dossierProtocols: document.getElementById('dossier-protocols'),
  dossierMarkdown: document.getElementById('dossier-markdown'),
  dossierSubtitle: document.getElementById('dossier-subtitle'),

  simSection: document.getElementById('series-simulator-section'),
  simPresetGroup: document.getElementById('sim-preset-group'),
  simOpDenial: document.getElementById('sim-op-denial'),
  simOpDenialVal: document.getElementById('sim-op-denial-val'),
  simEconPressure: document.getElementById('sim-econ-pressure'),
  simEconPressureVal: document.getElementById('sim-econ-pressure-val'),
  simActiveProtoCount: document.getElementById('sim-active-proto-count'),
  simProtocolToggles: document.getElementById('sim-protocol-toggles'),
  simScenarioBadge: document.getElementById('sim-scenario-badge'),
  simVerdict: document.getElementById('sim-verdict'),
  btnSimOpenDossier: document.getElementById('btn-sim-open-dossier'),
  simBaselineTag: document.getElementById('sim-baseline-tag'),
  simBaselineScore: document.getElementById('sim-baseline-score'),
  simBaselineTeams: document.getElementById('sim-baseline-teams'),
  simBaselineWr: document.getElementById('sim-baseline-wr'),
  simBaselineSeries: document.getElementById('sim-baseline-series'),
  simBaselineOp: document.getElementById('sim-baseline-op'),
  simBaselineEcon: document.getElementById('sim-baseline-econ'),
  simBaselineHalves: document.getElementById('sim-baseline-halves'),
  simProjectedWrDelta: document.getElementById('sim-projected-wr-delta'),
  simProjectedScore: document.getElementById('sim-projected-score'),
  simProjectedRoundsCap: document.getElementById('sim-projected-rounds-cap'),
  simProjectedWr: document.getElementById('sim-projected-wr'),
  simProjectedSeries: document.getElementById('sim-projected-series'),
  simCreditSwing: document.getElementById('sim-credit-swing'),
  simEcoBreaks: document.getElementById('sim-eco-breaks'),
  simOpDenied: document.getElementById('sim-op-denied'),
  simDeltaBars: document.getElementById('sim-delta-bars'),

  gridModal: document.getElementById('grid-modal'),
  jsonDropzone: document.getElementById('json-dropzone'),
  jsonFileInput: document.getElementById('json-file-input'),
  jsonTextarea: document.getElementById('json-textarea'),
  modalFeedback: document.getElementById('modal-feedback'),
  toast: document.getElementById('toast')
};

function cleanText(str) {
  return String(str ?? '').replaceAll('\u2014', '-').replaceAll('\u2013', '-');
}

function escapeHtml(str) {
  return cleanText(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function colorForCategory(cat) {
  return LAYER_COLORS[cat] || '#00AEEF';
}

function getMapAssetKey(mapName) {
  const key = String(mapName || 'ascent').trim().toLowerCase();
  return KNOWN_MAPS.has(key) ? key : 'ascent';
}

function getAgentAssetUrl(agentName) {
  const normalized = String(agentName || 'jett')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const key = KNOWN_AGENTS.has(normalized) ? normalized : 'jett';
  return `./assets/riot/${key}.png`;
}

function showToast(message) {
  el.toast.textContent = cleanText(message);
  el.toast.classList.add('show');
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    el.toast.classList.remove('show');
  }, 2400);
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function populatePresetDropdown() {
  const options = PRESET_METADATA.map(
    (p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(cleanText(p.label))}</option>`
  );
  if (state.isCustomImport) {
    options.unshift(
      `<option value="__custom__">Imported GRID: ${escapeHtml(state.parsedMatch.meta.mapName)}</option>`
    );
  }
  el.presetSelect.innerHTML = options.join('');
  el.presetSelect.value = state.isCustomImport ? '__custom__' : state.presetId;
}

function populateTeamFilter() {
  const teams = state.parsedMatch.teams;
  el.teamFilter.innerHTML = [
    `<option value="all">Both Teams</option>`,
    ...teams.map(
      (t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.tag)} (${escapeHtml(t.name)})</option>`
    )
  ].join('');
  el.teamFilter.value = state.filters.teamId;
}

function stopReplay(resetLabel = true) {
  if (state.replayTimer) {
    window.clearInterval(state.replayTimer);
    state.replayTimer = null;
  }
  state.replayActive = false;
  el.btnReplay.setAttribute('aria-pressed', 'false');
  el.replayIcon.innerHTML = '&#9654;';
  if (resetLabel) {
    el.replayLabel.textContent = 'Replay 0:00->1:40';
  }
}

function loadPreset(presetId) {
  stopReplay();
  state.presetId = presetId;
  state.isCustomImport = false;
  state.rawGridPayload = getRawPresetJson(presetId);
  state.parsedMatch = parseGridSeriesState(state.rawGridPayload);
  try {
    state.economyReport = analyzeRoundEconomy(state.rawGridPayload);
  } catch {
    state.economyReport = null;
  }
  state.filters.teamId = 'all';
  state.filters.roundNumber = null;
  state.filters.minTime = 0;
  state.filters.maxTime = 100;
  state.selectedClusterId = null;
  state.selectedEventId = null;
  state.targetOpPlayerId = null;
  state.compareOpPlayerId = null;
  state.checkedCounters = new Set();
  state.drawStrokes = [];
  syncFilterInputs();
  populatePresetDropdown();
  populateTeamFilter();
  recomputeAndRender();
}

function loadCustomMatch(parsedMatch, rawPayload = null) {
  stopReplay();
  state.isCustomImport = true;
  state.rawGridPayload = rawPayload;
  state.parsedMatch = parsedMatch;
  try {
    state.economyReport = rawPayload ? analyzeRoundEconomy(rawPayload) : null;
  } catch {
    state.economyReport = null;
  }
  state.filters.teamId = 'all';
  state.filters.roundNumber = null;
  state.filters.minTime = 0;
  state.filters.maxTime = 100;
  state.selectedClusterId = null;
  state.selectedEventId = null;
  state.targetOpPlayerId = null;
  state.compareOpPlayerId = null;
  state.checkedCounters = new Set();
  state.drawStrokes = [];
  syncFilterInputs();
  populatePresetDropdown();
  populateTeamFilter();
  recomputeAndRender();
}

function syncFilterInputs() {
  el.phaseSlider.value = String(state.filters.maxTime);
  el.phaseClockReadout.textContent = `${formatClock(state.filters.minTime)}-${formatClock(state.filters.maxTime)}`;
  el.phasePresets.querySelectorAll('.phase-chip').forEach((chip) => {
    const match =
      Number(chip.dataset.min) === state.filters.minTime &&
      Number(chip.dataset.max) === state.filters.maxTime;
    chip.classList.toggle('active', match);
  });
  el.sideFilter.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.side === state.filters.side);
  });
  el.layerToggles.querySelectorAll('input[data-layer]').forEach((cb) => {
    const checked = Boolean(state.filters.layers[cb.dataset.layer]);
    cb.checked = checked;
    cb.closest('.layer-pill')?.classList.toggle('active', checked);
  });
  el.btnDrawClear.hidden = state.drawStrokes.length === 0;
}

function getScopedMatchForMap(match) {
  const rn = state.filters.roundNumber;
  if (rn == null) return match;
  return {
    ...match,
    rounds: match.rounds.filter((r) => r.roundNumber === rn),
    utilityEvents: match.utilityEvents.filter((e) => e.roundNumber === rn),
    weaponPurchases: match.weaponPurchases.filter((w) => w.roundNumber === rn),
    kills: match.kills.filter((k) => k.roundNumber === rn)
  };
}

function recomputeAndRender() {
  const match = state.parsedMatch;
  const scopedMatch = getScopedMatchForMap(match);
  const activeCategories = ['smoke', 'flash', 'recon', 'molotov'].filter(
    (cat) => state.filters.layers[cat]
  );

  state.utilityReport = analyzeUtility(scopedMatch, {
    side: state.filters.side,
    teamId: state.filters.teamId,
    categories: activeCategories,
    minTime: state.filters.minTime,
    maxTime: state.filters.maxTime
  });

  state.fullUtilityReport = analyzeUtility(match, {
    side: state.filters.side,
    teamId: state.filters.teamId,
    categories: activeCategories,
    minTime: state.filters.minTime,
    maxTime: state.filters.maxTime
  });

  state.operatorReport = analyzeOperators(match, {
    side: state.filters.side,
    teamId: 'all'
  });

  const profiles = state.operatorReport.profiles;
  if (!state.targetOpPlayerId || !profiles.some((p) => p.playerId === state.targetOpPlayerId)) {
    state.targetOpPlayerId = state.operatorReport.primaryTarget?.playerId || profiles[0]?.playerId || null;
  }
  if (!state.compareOpPlayerId || !profiles.some((p) => p.playerId === state.compareOpPlayerId)) {
    const other = profiles.find((p) => p.playerId !== state.targetOpPlayerId);
    state.compareOpPlayerId = other?.playerId || state.targetOpPlayerId;
  }

  state.simulationResult = simulateSeriesDelta(
    match,
    state.operatorReport,
    state.fullUtilityReport,
    {
      targetPlayerId: state.targetOpPlayerId,
      opDenialPct: state.simulation.opDenialPct,
      economyPressurePct: state.simulation.economyPressurePct,
      protocols: state.simulation.protocols,
      economyReport: state.economyReport
    }
  );

  state.dossier = generateAntiOpDossier(
    match,
    state.fullUtilityReport,
    state.operatorReport,
    state.targetOpPlayerId,
    state.simulationResult
  );

  if (state.selectedEventId && !state.utilityReport.events.some((e) => e.id === state.selectedEventId)) {
    state.selectedEventId = null;
  }
  if (state.selectedClusterId && !state.utilityReport.clusters.some((c) => c.id === state.selectedClusterId)) {
    state.selectedClusterId = null;
  }
  if (!state.selectedEventId && !state.selectedClusterId && state.utilityReport.clusters.length > 0) {
    state.selectedClusterId = state.utilityReport.clusters[0].id;
  }

  renderEditorialHero();
  renderSpotlightCard();
  renderRoundStrip();
  renderLayerCounts(scopedMatch);
  renderTacticalMap();
  renderInspector();
  renderCounterChecklist();
  renderSetupImpacts();
  renderClockActivityCard();
  renderOpThreatDialCard();
  renderSeriesSimulator();
  renderOperatorProfiler();
  renderCoachDossier();
}

function getPrimaryOpProfile() {
  return (
    state.operatorReport.profiles.find((p) => p.playerId === state.targetOpPlayerId) ||
    state.operatorReport.profiles[0] ||
    null
  );
}

/* =========================================================================
   EDITORIAL HERO + TALVEX CAPSULES + OPEN GIANT NUMERALS
   ========================================================================= */

function renderEditorialHero() {
  const { teams, meta } = state.parsedMatch;
  const util = state.utilityReport;
  const fullUtil = state.fullUtilityReport;
  const topSetup = fullUtil.setupImpacts[0];

  el.matchHeadline.innerHTML = `
    ${escapeHtml(teams[0].name)} ${teams[0].score} - ${teams[1].score} ${escapeHtml(teams[1].name)}
    <em class="headline-map">${escapeHtml(meta.mapName)}</em>
  `;
  const roundSuffix = state.filters.roundNumber
    ? `Round ${state.filters.roundNumber} of ${meta.totalRounds}`
    : meta.seriesId;
  el.matchSubline.textContent = cleanText(`${meta.tournament} · ${roundSuffix}`);

  const total = Math.max(1, fullUtil.totalEvents);
  const smokePct = Math.round(((fullUtil.categoryTotals.smoke || 0) / total) * 100);
  const reconPct = Math.round(((fullUtil.categoryTotals.recon || 0) / total) * 100);
  const fmPct = Math.max(0, 100 - smokePct - reconPct);

  el.kpiCapsules.innerHTML = `
    <div class="cap-group">
      <span class="cap-label">Smokes</span>
      <span class="cap-pill cap-pill-obsidian">Smokes ${smokePct}%</span>
    </div>
    <div class="cap-group">
      <span class="cap-label">Recon</span>
      <span class="cap-pill cap-pill-cyan">Recon ${reconPct}%</span>
    </div>
    <div class="cap-group">
      <span class="cap-label">Flashes &amp; Molotovs</span>
      <span class="cap-pill cap-pill-hatched">Flashes &amp; Molotovs ${fmPct}%</span>
    </div>
    <div class="cap-group">
      <span class="cap-label">Scope</span>
      <span class="cap-pill cap-pill-white">${state.filters.roundNumber ? `Round ${state.filters.roundNumber}` : `${meta.totalRounds} Rounds`}</span>
    </div>
  `;

  const topDeltaVal = topSetup ? topSetup.winRateDeltaLabel.replace(' WR', '') : '+0.0%';
  const topIsPos = !topSetup || topSetup.winRateDelta >= 0;

  el.openKpis.innerHTML = `
    <div class="open-kpi-item">
      <div class="open-kpi-top">
        <span class="open-kpi-icon" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>
        </span>
        <span class="open-kpi-num">${util.totalEvents}</span>
      </div>
      <span class="open-kpi-label">Utility Casts</span>
    </div>

    <div class="open-kpi-item">
      <div class="open-kpi-top">
        <span class="open-kpi-icon" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2" stroke="currentColor" stroke-width="1.4"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="4.5" height="4.5" rx="1.2" stroke="currentColor" stroke-width="1.4"/></svg>
        </span>
        <span class="open-kpi-num">${util.clusters.length}</span>
      </div>
      <span class="open-kpi-label">Clusters</span>
    </div>

    <div class="open-kpi-item">
      <div class="open-kpi-top">
        <span class="open-kpi-icon" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 11.5L6.5 8L9 10.5L13 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span class="open-kpi-num ${topIsPos ? 'is-positive' : ''}">${escapeHtml(topDeltaVal)}</span>
      </div>
      <span class="open-kpi-label">Top Setup WR</span>
    </div>
  `;

  el.schemaMetaLabel.textContent = `${meta.schemaVersion} · ${meta.totalRounds} rds`;
  el.mapPanelTitle.textContent = state.filters.roundNumber
    ? `${meta.mapName} (Round ${state.filters.roundNumber})`
    : meta.mapName;
}

/* =========================================================================
   OPERATOR & MAP SPOTLIGHT PHOTO CARD (REAL RIOT SPLASH + AGENT PORTRAIT)
   ========================================================================= */

function renderSpotlightCard() {
  const { meta } = state.parsedMatch;
  const mapKey = getMapAssetKey(meta.mapName);
  const primaryOp = getPrimaryOpProfile();

  el.spotlightSplash.src = `./assets/riot/${mapKey}_splash.png`;
  el.spotlightSplash.alt = `${meta.mapName} map splash art`;
  el.spotlightMapTag.textContent = meta.mapName;

  if (primaryOp) {
    el.spotlightAgent.src = getAgentAssetUrl(primaryOp.agent);
    el.spotlightAgent.alt = `${primaryOp.agent} official portrait`;
    el.spotlightName.textContent = primaryOp.playerName;
    el.spotlightMeta.textContent = `${primaryOp.teamName} · ${primaryOp.agent} · ${primaryOp.opRounds} Op rds`;
    el.spotlightVulnPill.textContent = `Vuln ${primaryOp.tradeVulnerability.score}`;
  } else {
    el.spotlightAgent.src = './assets/riot/jett.png';
    el.spotlightName.textContent = state.parsedMatch.teams[1]?.name || 'Opponent';
    el.spotlightMeta.textContent = `${meta.mapName} · No Op buys`;
    el.spotlightVulnPill.textContent = 'Scout';
  }
}

/* =========================================================================
   ROUND STRIP & LAYER COUNTS
   ========================================================================= */

function renderRoundStrip() {
  const { teams, rounds, weaponPurchases } = state.parsedMatch;
  const teamAId = teams[0].id;
  const opRounds = new Set(
    weaponPurchases.filter((w) => w.isOperator).map((w) => w.roundNumber)
  );

  el.btnAllRounds.classList.toggle('active', state.filters.roundNumber === null);

  const cells = [];
  for (const r of rounds) {
    if (r.roundNumber === 13) {
      cells.push('<span class="rs-half-sep" aria-hidden="true"></span>');
    }
    const teamAWon = r.winningTeamId === teamAId;
    const winSide = r.winningTeamId === r.attackingTeamId ? 'attack' : 'defense';
    const hasOp = opRounds.has(r.roundNumber);
    const isActive = state.filters.roundNumber === r.roundNumber;
    const winnerTag = teamAWon ? teams[0].tag : teams[1].tag;
    const title = `R${r.roundNumber}: ${winnerTag} win (${winSide}, ${r.winCondition})${hasOp ? ' - Op bought' : ''}`;

    cells.push(`
      <button
        class="rs-cell ${teamAWon ? 'win-a' : 'win-b'}${isActive ? ' active' : ''}"
        type="button"
        data-round="${r.roundNumber}"
        title="${escapeHtml(title)}"
        aria-pressed="${isActive}"
      >
        ${hasOp ? '<span class="rs-op-dot" aria-hidden="true"></span>' : ''}
        <span>${r.roundNumber}</span>
        <span class="rs-win-bar" aria-hidden="true"></span>
      </button>
    `);
  }
  el.roundStrip.innerHTML = cells.join('');
}

function renderLayerCounts(scopedMatch) {
  const allCatsReport = analyzeUtility(scopedMatch, {
    side: state.filters.side,
    teamId: state.filters.teamId,
    categories: ['smoke', 'flash', 'recon', 'molotov'],
    minTime: state.filters.minTime,
    maxTime: state.filters.maxTime
  });
  for (const cat of ['smoke', 'flash', 'recon', 'molotov']) {
    const span = el.layerToggles.querySelector(`[data-count="${cat}"]`);
    if (span) span.textContent = String(allCatsReport.categoryTotals[cat] || 0);
  }
}

/* =========================================================================
   REAL OFFICIAL RIOT VALORANT MINIMAP SVG + CLUSTERS + OP LINES + WHITEBOARD
   ========================================================================= */

function renderTacticalMap() {
  const mapSpec = getMapSpec(state.parsedMatch.meta.mapName);
  const mapKey = getMapAssetKey(mapSpec.displayName);
  const mapTransform = MAP_IMAGE_TRANSFORMS[mapKey] || MAP_IMAGE_TRANSFORMS.ascent;
  const util = state.utilityReport;

  const sightlines = state.operatorReport.sightlines.filter((s) => {
    if (state.filters.roundNumber !== null && s.roundNumber !== state.filters.roundNumber) return false;
    if (state.filters.teamId !== 'all' && s.teamId !== state.filters.teamId) return false;
    if (s.timestampSec < state.filters.minTime || s.timestampSec > state.filters.maxTime) return false;
    return true;
  });

  const parts = [];

  parts.push(`
    <defs>
      <marker id="op-arrow-amber" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
        <path d="M0,0 L6.5,3 L0,6 Z" fill="#E5A024" />
      </marker>
      <marker id="op-arrow-red" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
        <path d="M0,0 L6.5,3 L0,6 Z" fill="#FF4655" />
      </marker>
      <marker id="draw-arrow-cyan" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
        <path d="M0,0 L6.5,3 L0,6 Z" fill="#00AEEF" />
      </marker>
      <filter id="riot-blueprint" x="-5%" y="-5%" width="110%" height="110%">
        <feColorMatrix type="matrix" values="
          0.95 0    0    0 0.04
          0    1.02 0    0 0.06
          0    0    1.12 0 0.09
          0    0    0    0.96 0" />
      </filter>
      <filter id="ring-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  `);

  // Official Riot VALORANT Minimap PNG (calibrated to 0..1000 coordinate space)
  parts.push(`
    <g class="riot-minimap-layer">
      <image
        id="riot-minimap-image"
        href="./assets/riot/${mapKey}_minimap.png"
        x="0"
        y="0"
        width="1000"
        height="1000"
        preserveAspectRatio="xMidYMid meet"
        transform="${mapTransform}"
        filter="url(#riot-blueprint)"
      />
    </g>
  `);

  // Subtle translucent site badge callouts (A SITE / B SITE / C SITE / MID)
  parts.push('<g class="site-badges" pointer-events="none">');
  for (const sb of mapSpec.siteBoxes) {
    parts.push(`
      <g transform="translate(${sb.labelX}, ${sb.labelY - 82})">
        <rect x="-31" y="-11" width="62" height="20" rx="10"
          fill="rgba(17, 20, 26, 0.82)" stroke="rgba(255, 255, 255, 0.24)" stroke-width="1.2" />
        <text x="0" y="2.5" text-anchor="middle"
          font-family="Space Grotesk, sans-serif" font-size="10.5" font-weight="700"
          letter-spacing="0.06em" fill="#F4F7FB">${escapeHtml(sb.site)} SITE</text>
      </g>
    `);
  }
  const midZone = mapSpec.zones.find((z) => z.id.includes('mid-top') || z.id.includes('mid-bottom') || z.id.includes('mid-courtyard'));
  if (midZone) {
    parts.push(`
      <g transform="translate(${midZone.x}, ${midZone.y + 42})">
        <rect x="-24" y="-10" width="48" height="20" rx="10"
          fill="rgba(17, 20, 26, 0.72)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1" />
        <text x="0" y="3.5" text-anchor="middle"
          font-family="JetBrains Mono, monospace" font-size="10" font-weight="600" fill="#B9C1D0">MID</text>
      </g>
    `);
  }
  parts.push('</g>');

  // Layer: Glowing DBSCAN Cluster Rings
  if (state.filters.layers.heatmap) {
    parts.push('<g class="layer-heatmap">');
    for (const c of util.clusters) {
      const ringColor = colorForCategory(c.dominantCategory);
      const isSelected = state.selectedClusterId === c.id && !state.selectedEventId;
      parts.push(`
        <g class="svg-pin" data-cluster-id="${escapeHtml(c.id)}">
          <circle cx="${c.x}" cy="${c.y}" r="${c.radius}"
            fill="${ringColor}" fill-opacity="${isSelected ? '0.2' : '0.11'}"
            stroke="${ringColor}" stroke-width="${isSelected ? '2.6' : '1.5'}"
            stroke-dasharray="${isSelected ? 'none' : '5 4'}"
            ${isSelected ? 'filter="url(#ring-glow)"' : ''}
            opacity="${isSelected ? '1' : '0.88'}" />
        </g>
      `);
    }
    parts.push('</g>');
  }

  // Layer: Operator Sightlines (dashed amber picks, crimson deaths)
  if (state.filters.layers.sightlines) {
    parts.push('<g class="layer-sightlines">');
    for (const sl of sightlines) {
      const dx = sl.target.x - sl.origin.x;
      const dy = sl.target.y - sl.origin.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const spread = Math.min(26, dist * 0.11);
      const nx = (-dy / dist) * spread;
      const ny = (dx / dist) * spread;
      const p1 = `${sl.origin.x},${sl.origin.y}`;
      const p2 = `${Math.round(sl.target.x + nx)},${Math.round(sl.target.y + ny)}`;
      const p3 = `${Math.round(sl.target.x - nx)},${Math.round(sl.target.y - ny)}`;
      const stroke = sl.wonDuel ? '#E5A024' : '#FF4655';
      const fill = sl.wonDuel ? 'rgba(229, 160, 36, 0.12)' : 'rgba(255, 70, 85, 0.10)';
      const marker = sl.wonDuel ? 'url(#op-arrow-amber)' : 'url(#op-arrow-red)';

      parts.push(`
        <g opacity="0.92">
          <polygon points="${p1} ${p2} ${p3}" fill="${fill}" />
          <line x1="${sl.origin.x}" y1="${sl.origin.y}" x2="${sl.target.x}" y2="${sl.target.y}"
            stroke="${stroke}" stroke-width="${sl.firstBlood ? 2.4 : 1.5}"
            stroke-dasharray="${sl.wonDuel ? '6 3' : '4 3'}" marker-end="${marker}" />
          <circle cx="${sl.origin.x}" cy="${sl.origin.y}" r="${sl.firstBlood ? 5.5 : 4}"
            fill="#11141A" stroke="${stroke}" stroke-width="2" />
        </g>
      `);
    }
    parts.push('</g>');
  }

  // Layer: Individual Clickable Utility Pins
  parts.push('<g class="layer-pins">');
  for (const ev of util.events) {
    const color = colorForCategory(ev.category);
    const isSelected = state.selectedEventId === ev.id;
    parts.push(`
      <g class="svg-pin" data-event-id="${escapeHtml(ev.id)}" role="button" tabindex="0" aria-label="${escapeHtml(ev.abilityName)} at ${escapeHtml(ev.callout)}">
        ${
          isSelected
            ? `<circle cx="${ev.x}" cy="${ev.y}" r="14" fill="rgba(255,255,255,0.12)" stroke="#FFFFFF" stroke-width="2.2" />`
            : ''
        }
        <circle class="pin-core" cx="${ev.x}" cy="${ev.y}" r="${isSelected ? 7 : 5.5}"
          fill="${color}" stroke="#11141A" stroke-width="1.6" />
      </g>
    `);
  }
  parts.push('</g>');

  // Crisp Cluster Count Pills
  if (state.filters.layers.heatmap) {
    parts.push('<g class="layer-cluster-badges">');
    for (const c of util.clusters.slice(0, 9)) {
      if (c.count < 2) continue;
      const ringColor = colorForCategory(c.dominantCategory);
      parts.push(`
        <g class="svg-pin" data-cluster-id="${escapeHtml(c.id)}">
          <rect x="${c.x - 16}" y="${c.y - 26}" width="32" height="16" rx="8"
            fill="#11141A" stroke="${ringColor}" stroke-width="1.3" />
          <text x="${c.x}" y="${c.y - 14.5}" text-anchor="middle"
            font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="700" fill="${ringColor}">${c.count}x</text>
        </g>
      `);
    }
    parts.push('</g>');
  }

  // Layer: Coach Whiteboard Freehand Tactical Strokes
  parts.push('<g id="layer-whiteboard" class="layer-whiteboard" pointer-events="none">');
  const strokesToRender = state.activeStroke
    ? [...state.drawStrokes, state.activeStroke]
    : state.drawStrokes;
  for (const stroke of strokesToRender) {
    if (stroke.length < 2) continue;
    const pts = stroke.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    parts.push(`
      <polyline points="${pts}" fill="none" stroke="#00AEEF" stroke-width="4.5"
        stroke-linecap="round" stroke-linejoin="round" marker-end="url(#draw-arrow-cyan)" />
    `);
  }
  parts.push('</g>');

  el.tacticalSvg.innerHTML = parts.join('');
  el.tacticalSvg.classList.toggle('draw-active', state.drawMode);
  el.mapCoordSummary.textContent = `${util.events.length} casts · ${util.clusters.length} clusters · ${sightlines.length} Op lines`;
}

/* =========================================================================
   RIGHT COLUMN TOP: CERAMIC WHITE INSPECTOR + PROPORTIONAL MIX BAR
   ========================================================================= */

function renderProportionalBar(breakdown) {
  const s = breakdown.smoke || 0;
  const f = breakdown.flash || 0;
  const r = breakdown.recon || 0;
  const m = breakdown.molotov || 0;
  const total = Math.max(1, s + f + r + m);

  const segs = [
    { key: 'smoke', label: 'S', pct: Math.round((s / total) * 100), cls: 'prop-seg-smoke' },
    { key: 'flash', label: 'F', pct: Math.round((f / total) * 100), cls: 'prop-seg-flash' },
    { key: 'recon', label: 'R', pct: Math.round((r / total) * 100), cls: 'prop-seg-recon' },
    { key: 'molotov', label: 'M', pct: Math.round((m / total) * 100), cls: 'prop-seg-molotov' }
  ].filter((x) => x.pct > 0);

  return `
    <div class="prop-bar-wrap">
      <div class="prop-bar-labels">
        <span>S ${s}</span>
        <span>F ${f}</span>
        <span>R ${r}</span>
        <span>M ${m}</span>
      </div>
      <div class="prop-bar-track">
        ${segs
          .map(
            (seg) => `
          <div class="prop-seg ${seg.cls}" style="width:${Math.max(12, seg.pct)}%" title="${seg.key}: ${seg.pct}%">
            ${seg.pct >= 18 ? `${seg.label} ${seg.pct}%` : seg.label}
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderInspector() {
  const util = state.utilityReport;
  const ev = state.selectedEventId
    ? util.events.find((e) => e.id === state.selectedEventId)
    : null;

  if (ev) {
    el.inspectorBadge.textContent = `PIN R${ev.roundNumber}`;
    el.inspectorBadge.className = 'pill-tag pill-tag-amber';
    const cat = ABILITY_CATEGORIES[ev.category];
    el.pinInspector.innerHTML = `
      <div class="insp-headline-row">
        <div class="insp-title">${escapeHtml(ev.abilityName)}</div>
        <span class="pill-tag ${ev.roundWon ? 'pill-tag-green' : 'pill-tag-red'}">${ev.roundWon ? 'WIN' : 'LOSS'}</span>
      </div>
      <div class="insp-sub">${escapeHtml(ev.playerName)} (${escapeHtml(ev.agent)}) · ${escapeHtml(ev.setupName)}</div>
      <div class="insp-meta-strip">
        <div class="insp-meta-cell">
          <div class="insp-meta-label">Callout</div>
          <div class="insp-meta-val">${escapeHtml(ev.callout)} (${escapeHtml(ev.site)})</div>
        </div>
        <div class="insp-meta-cell">
          <div class="insp-meta-label">Clock / Side</div>
          <div class="insp-meta-val">${formatClock(ev.timestampSec)} ${ev.side.toUpperCase()}</div>
        </div>
        <div class="insp-meta-cell">
          <div class="insp-meta-label">Coords</div>
          <div class="insp-meta-val">(${ev.x}, ${ev.y})</div>
        </div>
        <div class="insp-meta-cell">
          <div class="insp-meta-label">Category</div>
          <div class="insp-meta-val">${escapeHtml(cat.label)}</div>
        </div>
      </div>
    `;
    return;
  }

  if (state.filters.roundNumber !== null) {
    const r = state.parsedMatch.rounds.find((x) => x.roundNumber === state.filters.roundNumber);
    if (r) {
      const winner = state.parsedMatch.teams.find((t) => t.id === r.winningTeamId);
      const winSide = r.winningTeamId === r.attackingTeamId ? 'ATK' : 'DEF';
      const opBuys = state.parsedMatch.weaponPurchases.filter(
        (w) => w.roundNumber === r.roundNumber && w.isOperator
      );
      const opNames = opBuys
        .map((b) => {
          const p = state.parsedMatch.players.find((pl) => pl.id === b.playerId);
          return p ? `${p.name} ($${b.creditsBeforeBuy})` : b.playerId;
        })
        .join(', ');

      el.inspectorBadge.textContent = `ROUND ${r.roundNumber}`;
      el.inspectorBadge.className = 'pill-tag';
      el.pinInspector.innerHTML = `
        <div class="insp-headline-row">
          <div class="insp-title">Round ${r.roundNumber}</div>
          <span class="pill-tag ${r.winningTeamId === state.parsedMatch.teams[0].id ? '' : 'pill-tag-red'}">${escapeHtml(winner?.tag || '')} ${winSide}</span>
        </div>
        <div class="insp-sub">Winner: ${escapeHtml(winner?.name || r.winningTeamId)} · ${escapeHtml(r.winCondition)}</div>
        ${renderProportionalBar(util.categoryTotals)}
        <div class="insp-meta-strip">
          <div class="insp-meta-cell">
            <div class="insp-meta-label">Site / Casts</div>
            <div class="insp-meta-val">Site ${escapeHtml(r.plantSite || '-')} · ${util.totalEvents}</div>
          </div>
          <div class="insp-meta-cell">
            <div class="insp-meta-label">Operator Buys</div>
            <div class="insp-meta-val">${opNames ? escapeHtml(opNames) : 'None'}</div>
          </div>
        </div>
      `;
      return;
    }
  }

  const cluster =
    util.clusters.find((c) => c.id === state.selectedClusterId) || util.clusters[0];
  if (!cluster) {
    el.inspectorBadge.textContent = 'EMPTY';
    el.inspectorBadge.className = 'pill-tag pill-tag-soft';
    el.pinInspector.innerHTML = `<div class="insp-sub">No utility casts in current filter window. Reset filters or widen clock range.</div>`;
    return;
  }

  el.inspectorBadge.textContent = `CLUSTER ${cluster.density}%`;
  el.inspectorBadge.className = 'pill-tag';
  el.pinInspector.innerHTML = `
    <div class="insp-headline-row">
      <div class="insp-title">${escapeHtml(cluster.callout)}</div>
      <span class="pill-tag ${cluster.winRate >= 50 ? 'pill-tag-green' : 'pill-tag-red'}">${cluster.winRate}% WR</span>
    </div>
    <div class="insp-sub">Top cast: ${escapeHtml(cluster.dominantAbility)} · ${cluster.count} casts · avg ${cluster.avgClock}</div>
    ${renderProportionalBar(cluster.categoryBreakdown)}
    <div class="insp-meta-strip">
      <div class="insp-meta-cell">
        <div class="insp-meta-label">Centroid</div>
        <div class="insp-meta-val">(${cluster.x}, ${cluster.y})</div>
      </div>
      <div class="insp-meta-cell">
        <div class="insp-meta-label">Cluster Radius</div>
        <div class="insp-meta-val">r = ${cluster.radius} px</div>
      </div>
    </div>
  `;
}

/* =========================================================================
   RIGHT COLUMN BOTTOM: NESTED OBSIDIAN COUNTER-STRAT PREP CHECKLIST
   ========================================================================= */

function buildCounterPrepItems() {
  const recs = state.fullUtilityReport.counterRecommendations.slice(0, 3).map((r, idx) => ({
    id: `rec-${idx}-${r.callout}`,
    callout: r.callout,
    title: `${r.callout}: ${r.counterAbility}`,
    meta: `${r.window} · ${r.agentSuggestion}`,
    priority: r.priority,
    badge: r.priority === 'CRITICAL' ? 'CR' : r.priority === 'HIGH' ? 'HI' : 'MD'
  }));

  const primaryOp = getPrimaryOpProfile();
  if (primaryOp && primaryOp.angleFrequency.length > 0 && recs.length < 4) {
    const topAngle = primaryOp.angleFrequency[0];
    recs.push({
      id: `op-angle-${topAngle.callout}`,
      callout: topAngle.callout,
      title: `Deny ${primaryOp.playerName} ${topAngle.angleName}`,
      meta: `${formatClock(topAngle.avgPeekSec)} · Jump-spot or Flash`,
      priority: 'CRITICAL',
      badge: 'OP'
    });
  }
  return recs.slice(0, 4);
}

function focusCalloutOnMap(calloutName) {
  const match = state.utilityReport.clusters.find(
    (c) => c.callout.toLowerCase() === String(calloutName || '').toLowerCase()
  );
  if (match) {
    state.selectedEventId = null;
    state.selectedClusterId = match.id;
    renderTacticalMap();
    renderInspector();
    showToast(`Focused ${match.callout} (${match.count} casts)`);
    return;
  }
  const ev = state.utilityReport.events.find(
    (e) => e.callout.toLowerCase() === String(calloutName || '').toLowerCase()
  );
  if (ev) {
    state.selectedEventId = ev.id;
    renderTacticalMap();
    renderInspector();
    showToast(`Focused ${ev.callout} pin`);
  }
}

function renderCounterChecklist() {
  const items = buildCounterPrepItems();
  const doneCount = items.filter((item) => state.checkedCounters.has(item.id)).length;
  el.counterProgress.textContent = `${doneCount}/${items.length}`;

  if (items.length === 0) {
    el.counterRecommendations.innerHTML = `<div style="font-size:12px;color:#9BA3B4;">All clear in active filter window.</div>`;
    return;
  }

  el.counterRecommendations.innerHTML = items
    .map((item) => {
      const checked = state.checkedCounters.has(item.id);
      const prioClass =
        item.priority === 'CRITICAL'
          ? 'prio-critical'
          : item.priority === 'HIGH'
            ? 'prio-high'
            : '';
      return `
        <div class="counter-row ${prioClass}${checked ? ' checked' : ''}" data-counter-id="${escapeHtml(item.id)}">
          <span class="counter-icon-tile" aria-hidden="true">${escapeHtml(item.badge)}</span>
          <button class="counter-text-btn" type="button" data-focus-callout="${escapeHtml(item.callout)}" title="Focus ${escapeHtml(item.callout)} on map">
            <span class="counter-row-title">${escapeHtml(item.title)}</span>
            <span class="counter-row-meta">${escapeHtml(item.meta)}</span>
          </button>
          <button class="counter-check-btn" type="button" data-toggle-counter="${escapeHtml(item.id)}" aria-pressed="${checked}" aria-label="Mark ${escapeHtml(item.title)} briefed">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6.2L5 8.7L9.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      `;
    })
    .join('');
}

/* =========================================================================
   ROW 2: SETUPS TABLE, CLOCK ACTIVITY PILL-BARS, OP THREAT CIRCULAR DIAL
   ========================================================================= */

function renderSetupImpacts() {
  const rows = state.fullUtilityReport.setupImpacts.slice(0, 6);
  if (rows.length === 0) {
    el.setupImpactsBody.innerHTML = `<tr><td colspan="5" class="card-sub">No setups in active filter window.</td></tr>`;
    return;
  }
  el.setupImpactsBody.innerHTML = rows
    .map(
      (s) => `
      <tr class="clickable-row" data-setup-callout="${escapeHtml(s.primaryCallout)}">
        <td><div class="setup-row-name">${escapeHtml(s.setupName)}</div></td>
        <td><span class="setup-row-site">${escapeHtml(s.primaryCallout)} · ${s.roundsUsed}r · ${escapeHtml(s.avgClock)}</span></td>
        <td><span class="side-pill ${s.side === 'attack' ? 'side-pill-atk' : 'side-pill-def'}">${s.side === 'attack' ? 'ATK' : 'DEF'}</span></td>
        <td class="num-col">${s.winRate}%</td>
        <td class="num-col"><span class="${s.winRateDelta >= 0 ? 'delta-pos' : 'delta-neg'}">${escapeHtml(s.winRateDeltaLabel.replace(' WR', ''))}</span></td>
      </tr>
    `
    )
    .join('');
}

function renderClockActivityCard() {
  const phases = state.utilityReport.phaseTiming;
  if (!phases || phases.length === 0) {
    el.phaseTimingBars.innerHTML = '';
    return;
  }

  let peakIdx = 0;
  phases.forEach((p, idx) => {
    if (p.count > phases[peakIdx].count) peakIdx = idx;
  });

  const peak = phases[peakIdx];
  const maxPct = Math.max(1, ...phases.map((p) => p.pct));
  el.activityPeakPct.textContent = `${peak.pct}%`;
  el.activityPeakLabel.textContent = `Peak ${PHASE_WINDOWS[peakIdx]?.label || peak.label}`;
  el.btnFocusPeakPhase.dataset.min = String(PHASE_WINDOWS[peakIdx]?.min ?? 0);
  el.btnFocusPeakPhase.dataset.max = String(PHASE_WINDOWS[peakIdx]?.max ?? 100);

  el.phaseTimingBars.innerHTML = phases
    .map((p, idx) => {
      const h = p.count > 0 ? Math.max(20, Math.round((p.pct / maxPct) * 96)) : 10;
      const win = PHASE_WINDOWS[idx] || { min: 0, max: 100, short: p.label };
      const isPeak = idx === peakIdx && p.count > 0;
      return `
        <div class="pill-bar-col ${isPeak ? 'is-peak' : ''}" data-phase-min="${win.min}" data-phase-max="${win.max}" title="${escapeHtml(p.label)}: ${p.count} casts (${p.pct}%)">
          <span class="pill-bar-count">${p.count}</span>
          <div class="pill-bar-stick" style="height:${h}px"></div>
          <span class="pill-bar-axis">${escapeHtml(win.short)}</span>
        </div>
      `;
    })
    .join('');
}

function buildCircularDialSvg(score, caption, color) {
  const cx = 70;
  const cy = 70;
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const dashOffset = circumference * (1 - clamped / 100);

  const ticks = [];
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + Math.cos(angle) * 58;
    const y1 = cy + Math.sin(angle) * 58;
    const x2 = cx + Math.cos(angle) * 63;
    const y2 = cy + Math.sin(angle) * 63;
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(22,24,29,0.16)" stroke-width="1.5" stroke-linecap="round" />`);
  }

  return `
    ${ticks.join('')}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(22,24,29,0.08)" stroke-width="8" />
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
      stroke-linecap="round"
      stroke-dasharray="${circumference.toFixed(1)}"
      stroke-dashoffset="${dashOffset.toFixed(1)}"
      transform="rotate(-90 ${cx} ${cy})" />
    <text x="${cx}" y="${cy + 3}" text-anchor="middle"
      font-family="Space Grotesk, sans-serif" font-size="30" font-weight="700" fill="#16181D">${clamped}</text>
    <text x="${cx}" y="${cy + 21}" text-anchor="middle"
      font-family="JetBrains Mono, monospace" font-size="10" font-weight="600" fill="#696D77">${escapeHtml(caption)}</text>
  `;
}

function renderOpThreatDialCard() {
  const primaryOp = getPrimaryOpProfile();
  if (!primaryOp) {
    el.dialPlayerChip.textContent = 'None';
    el.opThreatDial.innerHTML = buildCircularDialSvg(0, '/100 Vuln', '#00AEEF');
    return;
  }
  const score = primaryOp.tradeVulnerability.score;
  const ringColor = score >= 65 ? '#FF4655' : score >= 45 ? '#E5A024' : '#00AEEF';
  el.dialPlayerChip.textContent = primaryOp.playerName;
  el.opThreatDial.innerHTML = buildCircularDialSvg(score, '/100 Vuln', ringColor);
}

/* =========================================================================
   ROW 3: SIDE-BY-SIDE SERIES DELTA & WIN-CONDITION SIMULATOR
   ========================================================================= */

function syncSimulationControlsUI(controls) {
  el.simOpDenial.value = String(controls.opDenialPct);
  el.simOpDenialVal.textContent = `${controls.opDenialPct}%`;
  el.simEconPressure.value = String(controls.economyPressurePct);
  el.simEconPressureVal.textContent = `${controls.economyPressurePct}%`;

  const activeCount = controls.activeProtocols.length;
  el.simActiveProtoCount.textContent = `${activeCount}/3 active`;

  el.simPresetGroup.querySelectorAll('[data-sim-preset]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.simPreset === controls.activePreset);
  });

  el.simProtocolToggles.querySelectorAll('input[data-sim-proto]').forEach((cb) => {
    const enabled = Boolean(controls.protocols[cb.dataset.simProto]);
    cb.checked = enabled;
    const pill = cb.closest('.sim-proto-pill');
    if (pill) {
      pill.classList.toggle('active', enabled);
      const stateBadge = pill.querySelector('.sim-proto-state');
      if (stateBadge) stateBadge.textContent = enabled ? 'ON' : 'OFF';
    }
  });
}

function updateSimulationAndDossier() {
  if (!state.parsedMatch || !state.operatorReport) return;
  state.simulationResult = simulateSeriesDelta(
    state.parsedMatch,
    state.operatorReport,
    state.fullUtilityReport,
    {
      targetPlayerId: state.targetOpPlayerId,
      opDenialPct: state.simulation.opDenialPct,
      economyPressurePct: state.simulation.economyPressurePct,
      protocols: state.simulation.protocols,
      economyReport: state.economyReport
    }
  );
  state.dossier = generateAntiOpDossier(
    state.parsedMatch,
    state.fullUtilityReport,
    state.operatorReport,
    state.targetOpPlayerId,
    state.simulationResult
  );
  renderSeriesSimulator();
  renderCoachDossier();
}

function renderSeriesSimulator() {
  const sim = state.simulationResult;
  if (!sim || !el.simSection) return;

  const { match, controls, baseline, simulated, deltas } = sim;
  syncSimulationControlsUI(controls);

  el.simScenarioBadge.textContent = controls.scenarioLabel;
  el.simVerdict.textContent = cleanText(sim.verdict);

  // Left card: Baseline Observed
  el.simBaselineTag.textContent = `${match.mapName} · ${match.totalRounds} rds`;
  el.simBaselineScore.textContent = baseline.scoreline;
  el.simBaselineTeams.textContent = `${match.ourTeam.tag} vs ${match.opponentTeam.tag}`;
  el.simBaselineWr.textContent = `${baseline.winRate}%`;
  el.simBaselineSeries.textContent = `${baseline.seriesWinProb}%`;
  el.simBaselineOp.textContent = match.targetSniper
    ? `${baseline.opKills}K / ${baseline.opFirstBloods} FB`
    : 'No Op Buys';
  el.simBaselineEcon.textContent = `$${baseline.oppAvgBank.toLocaleString('en-US')} · ${baseline.observedForceRate}% force`;
  el.simBaselineHalves.textContent = `H1: ${baseline.halfSplit.h1Our}/${baseline.halfSplit.h1Total} · H2: ${baseline.halfSplit.h2Our}/${baseline.halfSplit.h2Total} (${match.ourTeam.tag})`;

  // Right card: Simulated Counter-Plan
  const isNeutral = deltas.winRateDelta === 0 && deltas.creditSwingPerHalf === 0;
  el.simProjectedWrDelta.textContent = deltas.winRateDeltaLabel;
  el.simProjectedWrDelta.classList.toggle('is-neutral', isNeutral);
  el.simProjectedScore.textContent = simulated.regulationScoreline;
  el.simProjectedRoundsCap.textContent = `${simulated.projectedOurWinsExact.toFixed(1)} exp rds (${formatSignedDelta(deltas.roundsGained, '')})`;
  el.simProjectedWr.textContent = `${simulated.winRate}%`;
  el.simProjectedSeries.textContent = `${simulated.seriesWinProb}% (${deltas.seriesWinProbDeltaLabel})`;
  el.simCreditSwing.textContent = deltas.creditSwingPerHalfLabel;
  el.simEcoBreaks.textContent = `+${deltas.ecoBreakRoundsGained.toFixed(1)} eco rds`;
  el.simOpDenied.textContent = match.targetSniper
    ? `${deltas.opDuelsDenied} ${match.targetSniper.playerName} Op picks denied · ${simulated.projectedOpKills}K (${simulated.projectedOpKd} K/D)`
    : `${deltas.antiOpRoundsGained.toFixed(1)} anti-Op rds · ${formatSignedCredits(deltas.creditSwingFullMatch)} full match`;

  // Comparative visual delta bars
  const opSuppressionPct = simulated.effectiveOpDenialPct;
  el.simDeltaBars.innerHTML = `
    <div class="sim-bar-item">
      <div class="sim-bar-head">
        <span>Round Win Rate</span>
        <span class="sim-bar-delta">${escapeHtml(deltas.winRateDeltaLabel)}</span>
      </div>
      <div class="sim-bar-track">
        <div class="sim-bar-sim is-emerald" style="width:${Math.min(100, simulated.winRate)}%"></div>
        <div class="sim-bar-base" style="width:${Math.min(100, baseline.winRate)}%"></div>
      </div>
      <div class="sim-bar-sub">Base ${baseline.winRate}% -> Sim ${simulated.winRate}%</div>
    </div>

    <div class="sim-bar-item">
      <div class="sim-bar-head">
        <span>BO3 Series Win Prob</span>
        <span class="sim-bar-delta">${escapeHtml(deltas.seriesWinProbDeltaLabel)}</span>
      </div>
      <div class="sim-bar-track">
        <div class="sim-bar-sim" style="width:${Math.min(100, simulated.seriesWinProb)}%"></div>
        <div class="sim-bar-base" style="width:${Math.min(100, baseline.seriesWinProb)}%"></div>
      </div>
      <div class="sim-bar-sub">Base ${baseline.seriesWinProb}% -> Sim ${simulated.seriesWinProb}%</div>
    </div>

    <div class="sim-bar-item">
      <div class="sim-bar-head">
        <span>Anti-Op Angle Lock</span>
        <span class="sim-bar-delta">${opSuppressionPct}% lock</span>
      </div>
      <div class="sim-bar-track">
        <div class="sim-bar-sim is-amber" style="width:${Math.min(100, opSuppressionPct)}%"></div>
        <div class="sim-bar-base" style="width:0%"></div>
      </div>
      <div class="sim-bar-sub">-${deltas.opDuelsDenied} Op picks · ${escapeHtml(deltas.creditSwingPerHalfLabel)}</div>
    </div>
  `;
}

/* =========================================================================
   TAB 2: OPERATOR PROFILER
   ========================================================================= */

function renderOperatorRadarChart(primary, compare) {
  const axes = [
    { key: 'openingImpact', label: 'Opening' },
    { key: 'economyAggression', label: 'Op Econ' },
    { key: 'mapMobility', label: 'Mid Roam' },
    { key: 'angleDiversity', label: 'Angles' },
    { key: 'tradeVulnerability', label: 'Trade Vuln' },
    { key: 'duelWinRate', label: 'Duel WR%' }
  ];

  const cx = 200;
  const cy = 142;
  const maxR = 92;
  const n = axes.length;

  const pointFor = (idx, pct) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const r = (Math.max(5, Math.min(100, pct)) / 100) * maxR;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const parts = [];
  for (const level of [25, 50, 75, 100]) {
    const pts = axes.map((_, i) => pointFor(i, level).map((v) => v.toFixed(1)).join(',')).join(' ');
    parts.push(`<polygon points="${pts}" fill="${level === 100 ? 'rgba(22,24,29,0.02)' : 'none'}" stroke="rgba(22,24,29,0.12)" stroke-width="1" />`);
  }

  axes.forEach((ax, i) => {
    const [x2, y2] = pointFor(i, 100);
    const [lx, ly] = pointFor(i, 126);
    const yNudge = i === 0 ? -4 : i === 3 ? 11 : 4;
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(22,24,29,0.1)" stroke-width="1" />`);
    parts.push(`
      <text x="${lx.toFixed(1)}" y="${(ly + yNudge).toFixed(1)}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="600" fill="#696D77">${escapeHtml(ax.label)}</text>
    `);
  });

  if (compare && compare.playerId !== primary.playerId) {
    const cPts = axes
      .map((ax, i) => pointFor(i, compare.radar[ax.key]).map((v) => v.toFixed(1)).join(','))
      .join(' ');
    parts.push(`<polygon points="${cPts}" fill="rgba(0, 174, 239, 0.16)" stroke="#00AEEF" stroke-width="2.2" />`);
  }

  const pPts = axes
    .map((ax, i) => pointFor(i, primary.radar[ax.key]).map((v) => v.toFixed(1)).join(','))
    .join(' ');
  parts.push(`<polygon points="${pPts}" fill="rgba(229, 160, 36, 0.22)" stroke="#E5A024" stroke-width="2.4" />`);

  axes.forEach((ax, i) => {
    const [px, py] = pointFor(i, primary.radar[ax.key]);
    parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="#E5A024" stroke="#FFFFFF" stroke-width="1.8" />`);
  });

  el.opRadarSvg.innerHTML = parts.join('');
  el.opRadarLegend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:#E5A024"></span>${escapeHtml(primary.playerName)} (${escapeHtml(primary.teamTag)})</span>
    ${
      compare && compare.playerId !== primary.playerId
        ? `<span class="legend-item"><span class="legend-swatch" style="background:#00AEEF"></span>${escapeHtml(compare.playerName)} (${escapeHtml(compare.teamTag)})</span>`
        : ''
    }
  `;
}

function renderOperatorProfiler() {
  const profiles = state.operatorReport.profiles;
  if (profiles.length === 0) {
    el.opTargetSelect.innerHTML = '<option value="">No Operators</option>';
    el.opCompareSelect.innerHTML = '<option value="">None</option>';
    el.opEconomyBlock.innerHTML = '<div class="card-sub">No Operator purchases in dataset.</div>';
    el.opPeekHistogram.innerHTML = '';
    el.opRoleSplitBlock.innerHTML = '';
    el.opAnglesBody.innerHTML = '';
    return;
  }

  const optsHtml = profiles
    .map(
      (p) =>
        `<option value="${escapeHtml(p.playerId)}">${escapeHtml(p.playerName)} (${escapeHtml(p.teamTag)} · ${escapeHtml(p.agent)} · ${p.opRounds}r)</option>`
    )
    .join('');

  el.opTargetSelect.innerHTML = optsHtml;
  el.opTargetSelect.value = state.targetOpPlayerId;
  el.opCompareSelect.innerHTML = optsHtml;
  el.opCompareSelect.value = state.compareOpPlayerId;

  const primary = profiles.find((p) => p.playerId === state.targetOpPlayerId) || profiles[0];
  const compare = profiles.find((p) => p.playerId === state.compareOpPlayerId) || primary;

  el.opTargetImg.src = getAgentAssetUrl(primary.agent);
  el.opTargetImg.alt = `${primary.agent} portrait`;
  el.opCompareImg.src = getAgentAssetUrl(compare.agent);
  el.opCompareImg.alt = `${compare.agent} portrait`;

  el.opTargetBadges.innerHTML = `
    <span class="pill-tag pill-tag-amber">${primary.opKd} K/D</span>
    <span class="pill-tag pill-tag-red">Vuln ${primary.tradeVulnerability.score}/100</span>
    <span class="pill-tag pill-tag-soft">${primary.firstBloods} FB</span>
  `;

  el.opCompareBadges.innerHTML = `
    <span class="pill-tag">${compare.opKd} K/D</span>
    <span class="pill-tag pill-tag-soft">Vuln ${compare.tradeVulnerability.score}/100</span>
    <span class="pill-tag pill-tag-soft">${compare.firstBloods} FB</span>
  `;

  renderOperatorRadarChart(primary, compare);

  const vulnScore = primary.tradeVulnerability.score;
  const dialColor = vulnScore >= 65 ? '#FF4655' : vulnScore >= 45 ? '#E5A024' : '#00AEEF';
  const fullBuyPct = primary.economy.fullBuyRate;
  const glassPct = primary.economy.glassCannonRate;

  el.opEconomyBlock.innerHTML = `
    <div class="op-econ-hero">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Trade-Death Vulnerability Score">
        ${buildCircularDialSvg(vulnScore, primary.tradeVulnerability.tier, dialColor)}
      </svg>
      <div class="op-econ-stats">
        <div class="econ-stat-tile">
          <div class="econ-stat-label">&ge;$4,700 Full Buy</div>
          <div class="econ-stat-val" style="color:var(--accent-c9-ink)">${fullBuyPct}%</div>
        </div>
        <div class="econ-stat-tile">
          <div class="econ-stat-label">Glass Cannon</div>
          <div class="econ-stat-val" style="color:var(--accent-val)">${glassPct}%</div>
        </div>
        <div class="econ-stat-tile">
          <div class="econ-stat-label">Avg / Min Bank</div>
          <div class="econ-stat-val">$${primary.economy.avgBankOnOpBuy}</div>
        </div>
        <div class="econ-stat-tile">
          <div class="econ-stat-label">Untraded Deaths</div>
          <div class="econ-stat-val">${primary.tradeVulnerability.untradedPct}%</div>
        </div>
      </div>
    </div>

    <div class="econ-bar-block">
      <div class="prop-bar-labels" style="margin-bottom:5px;">
        <span>Full Buy (${primary.economy.fullBuyOps}/${primary.economy.totalOpBuys})</span>
        <span>Glass Cannon (${primary.economy.glassCannonOps}/${primary.economy.totalOpBuys})</span>
      </div>
      <div class="prop-bar-track">
        <div class="prop-seg prop-seg-smoke" style="width:${Math.max(12, fullBuyPct)}%">${fullBuyPct}% Full</div>
        <div class="prop-seg prop-seg-molotov" style="width:${Math.max(12, glassPct)}%">${glassPct}% Glass</div>
      </div>
    </div>

    <div class="econ-note-pill">
      ${escapeHtml(primary.economy.thresholdAlert)}
      ${
        compare && compare.playerId !== primary.playerId
          ? ` vs ${escapeHtml(compare.playerName)}: ${compare.tradeVulnerability.score}/100 (${compare.opKd} K/D).`
          : ''
      }
    </div>
  `;

  const maxBucket = Math.max(1, ...primary.peekHistogram.map((b) => b.count));
  el.opPeekHistogram.innerHTML = primary.peekHistogram
    .map((b) => {
      const totalH = b.count > 0 ? Math.max(18, Math.round((b.count / maxBucket) * 108)) : 6;
      const pickH = b.count > 0 ? Math.round((b.picks / b.count) * totalH) : 0;
      const deathH = Math.max(0, totalH - pickH);
      return `
        <div class="hist-col" title="${b.label}: ${b.picks} picks, ${b.deaths} deaths">
          <div class="hist-val">${b.count}</div>
          <div class="hist-bar-stack" style="height:${totalH}px">
            <div class="hist-seg-pick" style="height:${pickH}px"></div>
            <div class="hist-seg-death" style="height:${deathH}px"></div>
          </div>
          <div class="hist-label">${escapeHtml(b.label)}</div>
        </div>
      `;
    })
    .join('');

  el.opRoleSplitBlock.innerHTML = `
    <div class="clock-head">
      <span class="micro-label">Anchor vs Mid-Roam Split</span>
      <span class="clock-readout">Avg peek ${escapeHtml(primary.avgPeekClock)}</span>
    </div>
    <div class="split-bar">
      <div class="split-anchor" style="width:${primary.roleSplit.anchorPct}%"></div>
      <div class="split-roam" style="width:${primary.roleSplit.roamPct}%"></div>
      <div class="split-retake" style="width:${primary.roleSplit.retakePct}%"></div>
    </div>
    <div class="split-legend">
      <span style="color:var(--accent-c9-ink)">Anchor ${primary.roleSplit.anchorPct}%</span>
      <span style="color:#B77910">Mid Roam ${primary.roleSplit.roamPct}%</span>
      <span style="color:var(--accent-val)">Retake ${primary.roleSplit.retakePct}%</span>
    </div>
  `;

  el.opAnglesBody.innerHTML = primary.angleFrequency
    .map(
      (a) => `
      <tr>
        <td><strong>${escapeHtml(a.angleName)}</strong></td>
        <td style="color:var(--ink-muted)">${escapeHtml(a.callout)}</td>
        <td class="num-col">${a.engagements} (${a.frequencyPct}%)</td>
        <td class="num-col" style="color:#B77910;font-weight:700">${a.firstBloods}</td>
        <td class="num-col" style="color:${a.kd >= 1 ? 'var(--accent-emerald)' : 'var(--accent-val)'};font-weight:700">${a.kd}</td>
        <td class="num-col">${formatClock(a.avgPeekSec)}</td>
      </tr>
    `
    )
    .join('');
}

/* =========================================================================
   TAB 3: COACH DOSSIER
   ========================================================================= */

function renderCoachDossier() {
  const dossier = state.dossier;
  const target = dossier.json.targetSniper;
  el.dossierSubtitle.textContent = target
    ? `Target: ${target.playerName} (${target.teamTag}, ${target.agent}) on ${dossier.json.match.mapName}`
    : `Map: ${dossier.json.match.mapName}`;

  if (el.dossierSimSummary && state.simulationResult) {
    const sim = state.simulationResult;
    el.dossierSimSummary.innerHTML = `
      <div class="dossier-sim-inner">
        <div class="dossier-sim-left">
          <div class="dossier-sim-kicker">Synced Simulation Scenario · ${escapeHtml(sim.controls.scenarioLabel)}</div>
          <div class="dossier-sim-copy">${escapeHtml(cleanText(sim.verdict))}</div>
        </div>
        <div class="dossier-sim-pills">
          <span class="dossier-sim-pill">${escapeHtml(sim.baseline.scoreline)} -&gt; ${escapeHtml(sim.simulated.regulationScoreline)}</span>
          <span class="dossier-sim-pill is-accent">${escapeHtml(sim.deltas.winRateDeltaLabel)}</span>
          <span class="dossier-sim-pill">${escapeHtml(sim.deltas.creditSwingPerHalfLabel)}</span>
          <button id="btn-dossier-tune-sim" class="dossier-sim-btn" type="button">Tune Simulator</button>
        </div>
      </div>
    `;
    const tuneBtn = document.getElementById('btn-dossier-tune-sim');
    if (tuneBtn) {
      tuneBtn.addEventListener('click', () => {
        switchTab('radar');
        el.simSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  el.dossierProtocols.innerHTML = dossier.json.antiOpProtocols
    .map(
      (p) => `
      <article class="protocol-card">
        <h4>${escapeHtml(p.phase)}</h4>
        <div class="protocol-trigger">${escapeHtml(p.trigger)}</div>
        <div class="protocol-action">${escapeHtml(p.action)}</div>
      </article>
    `
    )
    .join('');

  el.dossierMarkdown.textContent = cleanText(dossier.markdown);
}

/* =========================================================================
   INTERACTIVE HANDLERS: TABS, REPLAY, WHITEBOARD DRAW, FILTERS, MODAL
   ========================================================================= */

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.pill-tab[data-tab]').forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
}

function toggleReplay() {
  if (state.replayActive) {
    stopReplay(true);
    return;
  }
  state.replayActive = true;
  el.btnReplay.setAttribute('aria-pressed', 'true');
  el.replayIcon.innerHTML = '&#10074;&#10074;';
  state.filters.minTime = 0;
  let current = 10;
  state.filters.maxTime = current;
  el.replayLabel.textContent = `Playing 0:00->${formatClock(current)}`;
  syncFilterInputs();
  recomputeAndRender();

  state.replayTimer = window.setInterval(() => {
    current += 5;
    if (current > 100) {
      stopReplay(true);
      showToast('Round replay finished (0:00-1:40)');
      return;
    }
    state.filters.maxTime = current;
    el.replayLabel.textContent = `Playing 0:00->${formatClock(current)}`;
    syncFilterInputs();
    recomputeAndRender();
  }, 150);
}

function svgPointFromEvent(evt) {
  const rect = el.tacticalSvg.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / Math.max(1, rect.width)) * 1000;
  const y = ((evt.clientY - rect.top) / Math.max(1, rect.height)) * 1000;
  return {
    x: Math.max(0, Math.min(1000, x)),
    y: Math.max(0, Math.min(1000, y))
  };
}

function openImportModal() {
  el.modalFeedback.textContent = '';
  el.modalFeedback.className = 'modal-feedback';
  el.gridModal.classList.add('open');
}

function closeImportModal() {
  el.gridModal.classList.remove('open');
}

function handleJsonImportText(rawText) {
  try {
    const parsed = parseGridSeriesState(rawText);
    el.modalFeedback.textContent = `Parsed GRID Series State: ${parsed.meta.mapName}, ${parsed.meta.totalRounds} rounds, ${parsed.utilityEvents.length} casts.`;
    el.modalFeedback.className = 'modal-feedback success';
    loadCustomMatch(parsed, rawText);
    closeImportModal();
    showToast(`Loaded ${parsed.teams[0].tag} vs ${parsed.teams[1].tag} (${parsed.meta.mapName})`);
  } catch (err) {
    el.modalFeedback.textContent = `Schema Error: ${err.message}`;
    el.modalFeedback.className = 'modal-feedback error';
  }
}

function bindEvents() {
  el.presetSelect.addEventListener('change', (e) => {
    if (e.target.value !== '__custom__') {
      loadPreset(e.target.value);
      showToast(`Loaded ${e.target.options[e.target.selectedIndex].text}`);
    }
  });

  document.querySelectorAll('.pill-tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Spotlight Card + Dial CTA jump straight to Op Profiler
  const jumpToOp = () => {
    switchTab('operator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  el.spotlightCard.addEventListener('click', jumpToOp);
  el.spotlightCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      jumpToOp();
    }
  });
  el.btnJumpOp.addEventListener('click', jumpToOp);

  // Replay & Coach Whiteboard Draw Controls
  el.btnReplay.addEventListener('click', toggleReplay);

  el.btnDrawToggle.addEventListener('click', () => {
    state.drawMode = !state.drawMode;
    el.btnDrawToggle.classList.toggle('active', state.drawMode);
    el.btnDrawToggle.setAttribute('aria-pressed', String(state.drawMode));
    el.stageHint.textContent = state.drawMode
      ? 'Draw mode active: drag across the minimap to sketch Cloud9 cyan tactical arrows.'
      : 'Click any pin, cluster ring, or round cell to inspect telemetry.';
    renderTacticalMap();
  });

  el.btnDrawClear.addEventListener('click', () => {
    state.drawStrokes = [];
    state.activeStroke = null;
    el.btnDrawClear.hidden = true;
    renderTacticalMap();
  });

  el.tacticalSvg.addEventListener('pointerdown', (e) => {
    if (!state.drawMode) return;
    state.isDrawing = true;
    state.activeStroke = [svgPointFromEvent(e)];
    el.tacticalSvg.setPointerCapture(e.pointerId);
  });

  el.tacticalSvg.addEventListener('pointermove', (e) => {
    if (!state.drawMode || !state.isDrawing || !state.activeStroke) return;
    const pt = svgPointFromEvent(e);
    const prev = state.activeStroke[state.activeStroke.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 8) {
      state.activeStroke.push(pt);
      renderTacticalMap();
    }
  });

  const finishStroke = () => {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    if (state.activeStroke && state.activeStroke.length >= 2) {
      state.drawStrokes.push(state.activeStroke);
      el.btnDrawClear.hidden = false;
    }
    state.activeStroke = null;
    renderTacticalMap();
  };
  el.tacticalSvg.addEventListener('pointerup', finishStroke);
  el.tacticalSvg.addEventListener('pointercancel', finishStroke);

  // Round Strip Click
  el.btnAllRounds.addEventListener('click', () => {
    if (state.filters.roundNumber !== null) {
      state.filters.roundNumber = null;
      state.selectedEventId = null;
      state.selectedClusterId = null;
      recomputeAndRender();
    }
  });

  el.roundStrip.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-round]');
    if (!btn) return;
    const rn = Number(btn.dataset.round);
    state.filters.roundNumber = state.filters.roundNumber === rn ? null : rn;
    state.selectedEventId = null;
    state.selectedClusterId = null;
    recomputeAndRender();
  });

  // Layer Pill Toggles
  el.layerToggles.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-layer]');
    if (!input) return;
    state.filters.layers[input.dataset.layer] = input.checked;
    input.closest('.layer-pill')?.classList.toggle('active', input.checked);
    recomputeAndRender();
  });

  // Side Filter
  el.sideFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-side]');
    if (!btn) return;
    state.filters.side = btn.dataset.side;
    syncFilterInputs();
    recomputeAndRender();
  });

  // Team Filter
  el.teamFilter.addEventListener('change', (e) => {
    state.filters.teamId = e.target.value;
    recomputeAndRender();
  });

  // Round Clock Slider
  el.phaseSlider.addEventListener('input', (e) => {
    stopReplay(true);
    state.filters.minTime = 0;
    state.filters.maxTime = Number(e.target.value);
    syncFilterInputs();
    recomputeAndRender();
  });

  // Clock Presets
  el.phasePresets.addEventListener('click', (e) => {
    const chip = e.target.closest('.phase-chip');
    if (!chip) return;
    stopReplay(true);
    state.filters.minTime = Number(chip.dataset.min);
    state.filters.maxTime = Number(chip.dataset.max);
    syncFilterInputs();
    recomputeAndRender();
  });

  // Clock Activity Card bar clicks & peak focus button
  const applyPhaseWindow = (minVal, maxVal) => {
    stopReplay(true);
    state.filters.minTime = Number(minVal);
    state.filters.maxTime = Number(maxVal);
    syncFilterInputs();
    recomputeAndRender();
    showToast(`Filtered clock to ${formatClock(state.filters.minTime)}-${formatClock(state.filters.maxTime)}`);
  };

  el.phaseTimingBars.addEventListener('click', (e) => {
    const col = e.target.closest('[data-phase-min]');
    if (!col) return;
    applyPhaseWindow(col.dataset.phaseMin, col.dataset.phaseMax);
  });

  el.btnFocusPeakPhase.addEventListener('click', () => {
    applyPhaseWindow(el.btnFocusPeakPhase.dataset.min, el.btnFocusPeakPhase.dataset.max);
  });

  // Reset Filters
  el.btnResetFilters.addEventListener('click', () => {
    stopReplay(true);
    state.filters = {
      roundNumber: null,
      side: 'all',
      teamId: 'all',
      minTime: 0,
      maxTime: 100,
      layers: { smoke: true, flash: true, recon: true, molotov: true, sightlines: true, heatmap: true }
    };
    el.teamFilter.value = 'all';
    state.selectedEventId = null;
    state.selectedClusterId = null;
    syncFilterInputs();
    recomputeAndRender();
  });

  // SVG Pin / Cluster Click Inspector
  el.tacticalSvg.addEventListener('click', (e) => {
    if (state.drawMode) return;
    const pin = e.target.closest('[data-event-id]');
    if (pin) {
      state.selectedEventId = pin.dataset.eventId;
      renderTacticalMap();
      renderInspector();
      return;
    }
    const cluster = e.target.closest('[data-cluster-id]');
    if (cluster) {
      state.selectedEventId = null;
      state.selectedClusterId = cluster.dataset.clusterId;
      renderTacticalMap();
      renderInspector();
    }
  });

  // Counter-Strat Checklist interactions (toggle checked OR focus cluster)
  el.counterRecommendations.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('[data-toggle-counter]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.toggleCounter;
      if (state.checkedCounters.has(id)) {
        state.checkedCounters.delete(id);
      } else {
        state.checkedCounters.add(id);
      }
      renderCounterChecklist();
      return;
    }
    const focusBtn = e.target.closest('[data-focus-callout]');
    if (focusBtn) {
      focusCalloutOnMap(focusBtn.dataset.focusCallout);
    }
  });

  // Setup Table Row Click -> Focus Callout on Map
  el.setupImpactsBody.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-setup-callout]');
    if (!row) return;
    focusCalloutOnMap(row.dataset.setupCallout);
  });

  // Operator Profiler Selectors
  el.opTargetSelect.addEventListener('change', (e) => {
    state.targetOpPlayerId = e.target.value;
    updateSimulationAndDossier();
    renderSpotlightCard();
    renderOpThreatDialCard();
    renderOperatorProfiler();
  });

  // Series Delta & Win-Condition Simulator Controls
  el.simPresetGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sim-preset]');
    if (!btn) return;
    const presetKey = btn.dataset.simPreset;
    const preset = SIMULATION_PRESETS[presetKey];
    if (!preset) return;
    state.simulation = {
      preset: preset.id,
      opDenialPct: preset.opDenialPct,
      economyPressurePct: preset.economyPressurePct,
      protocols: { ...preset.protocols }
    };
    updateSimulationAndDossier();
    showToast(`Applied ${preset.label} simulation`);
  });

  el.simOpDenial.addEventListener('input', (e) => {
    state.simulation.preset = 'custom';
    state.simulation.opDenialPct = Number(e.target.value);
    updateSimulationAndDossier();
  });

  el.simEconPressure.addEventListener('input', (e) => {
    state.simulation.preset = 'custom';
    state.simulation.economyPressurePct = Number(e.target.value);
    updateSimulationAndDossier();
  });

  el.simProtocolToggles.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-sim-proto]');
    if (!cb) return;
    state.simulation.preset = 'custom';
    state.simulation.protocols[cb.dataset.simProto] = cb.checked;
    updateSimulationAndDossier();
  });

  el.btnSimOpenDossier.addEventListener('click', () => {
    switchTab('dossier');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.opCompareSelect.addEventListener('change', (e) => {
    state.compareOpPlayerId = e.target.value;
    renderOperatorProfiler();
  });

  // Exports & Print
  const exportMd = () => {
    downloadFile(`${state.dossier.filenameBase}.md`, cleanText(state.dossier.markdown), 'text/markdown;charset=utf-8');
    showToast(`Saved ${state.dossier.filenameBase}.md`);
  };
  const exportJson = () => {
    downloadFile(
      `${state.dossier.filenameBase}.json`,
      JSON.stringify(state.dossier.json, null, 2),
      'application/json;charset=utf-8'
    );
    showToast(`Saved ${state.dossier.filenameBase}.json`);
  };

  document.getElementById('btn-op-download-md').addEventListener('click', exportMd);
  document.getElementById('btn-op-download-json').addEventListener('click', exportJson);
  document.getElementById('btn-download-md').addEventListener('click', exportMd);
  document.getElementById('btn-download-json').addEventListener('click', exportJson);
  document.getElementById('btn-print-dossier').addEventListener('click', () => window.print());

  document.getElementById('btn-copy-md').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cleanText(state.dossier.markdown));
      showToast('Copied Markdown dossier to clipboard');
    } catch {
      showToast('Clipboard unavailable. Use Download .md.');
    }
  });

  // GRID JSON Importer Modal
  document.getElementById('btn-open-import').addEventListener('click', openImportModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeImportModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeImportModal);
  el.gridModal.addEventListener('click', (e) => {
    if (e.target === el.gridModal) closeImportModal();
  });

  document.getElementById('btn-load-sample-json').addEventListener('click', () => {
    el.jsonTextarea.value = getSampleGridJson(state.presetId);
    el.modalFeedback.textContent = 'Loaded active match GRID Series State JSON. Edit or click Parse & Load.';
    el.modalFeedback.className = 'modal-feedback success';
  });

  document.getElementById('btn-download-sample-json').addEventListener('click', () => {
    downloadFile(
      `${state.presetId}-grid-series-state.json`,
      getSampleGridJson(state.presetId),
      'application/json;charset=utf-8'
    );
    showToast('Saved sample GRID Series State JSON');
  });

  document.getElementById('btn-apply-json').addEventListener('click', () => {
    const text = el.jsonTextarea.value.trim();
    if (!text) {
      el.modalFeedback.textContent = 'Paste a GRID JSON payload or click Load Active Match JSON first.';
      el.modalFeedback.className = 'modal-feedback error';
      return;
    }
    handleJsonImportText(text);
  });

  el.jsonDropzone.addEventListener('click', () => el.jsonFileInput.click());
  el.jsonDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.jsonDropzone.classList.add('dragover');
  });
  el.jsonDropzone.addEventListener('dragleave', () => {
    el.jsonDropzone.classList.remove('dragover');
  });
  el.jsonDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.jsonDropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) readJsonFile(file);
  });
  el.jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) readJsonFile(file);
  });
}

function readJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    el.jsonTextarea.value = String(reader.result || '');
    handleJsonImportText(el.jsonTextarea.value);
  };
  reader.readAsText(file);
}

bindEvents();
loadPreset('c9-sen-ascent');

if (window.location.hash === '#operator') {
  switchTab('operator');
} else if (window.location.hash === '#dossier') {
  switchTab('dossier');
}
