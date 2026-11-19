/**
 * StratForge - VALORANT Tactical Scouting Application
 * Connects GRID Series State Parser + Analytics Engine to SVG Map Workbench,
 * VLR-style Round Strip, Operator Profiler, Dossier Export, and JSON Importer.
 */

import { getMapSpec } from './src/maps.js';
import {
  ABILITY_CATEGORIES,
  PRESET_METADATA,
  getPreset,
  getSampleGridJson,
  parseGridSeriesState
} from './src/gridParser.js';
import {
  analyzeOperators,
  analyzeUtility,
  formatClock,
  generateAntiOpDossier
} from './src/analytics.js';

const LAYER_COLORS = {
  smoke: '#2B9CE5',
  flash: '#D9A441',
  recon: '#38A878',
  molotov: '#D94452'
};

const state = {
  presetId: 'c9-sen-ascent',
  isCustomImport: false,
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
  utilityReport: null,
  fullUtilityReport: null,
  operatorReport: null,
  dossier: null
};

const el = {
  presetSelect: document.getElementById('preset-select'),
  scorePill: document.getElementById('score-pill'),
  tickerStats: document.getElementById('ticker-stats'),
  roundStrip: document.getElementById('round-strip'),
  btnAllRounds: document.getElementById('btn-all-rounds'),
  schemaMetaLabel: document.getElementById('schema-meta-label'),
  badgeUtilCount: document.getElementById('badge-util-count'),
  badgeOpCount: document.getElementById('badge-op-count'),

  mapPanelTitle: document.getElementById('map-panel-title'),
  mapPanelSubtitle: document.getElementById('map-panel-subtitle'),
  tacticalSvg: document.getElementById('tactical-svg'),
  mapCoordSummary: document.getElementById('map-coord-summary'),
  layerToggles: document.getElementById('layer-toggles'),
  sideFilter: document.getElementById('side-filter'),
  teamFilter: document.getElementById('team-filter'),
  phaseSlider: document.getElementById('phase-slider'),
  phaseClockReadout: document.getElementById('phase-clock-readout'),
  phasePresets: document.getElementById('phase-presets'),
  btnResetFilters: document.getElementById('btn-reset-filters'),

  pinInspector: document.getElementById('pin-inspector'),
  inspectorBadge: document.getElementById('inspector-badge'),
  phaseTimingBars: document.getElementById('phase-timing-bars'),
  setupImpactsBody: document.getElementById('setup-impacts-body'),
  counterRecommendations: document.getElementById('counter-recommendations'),

  opTargetSelect: document.getElementById('op-target-select'),
  opCompareSelect: document.getElementById('op-compare-select'),
  opRadarSvg: document.getElementById('op-radar-svg'),
  opRadarLegend: document.getElementById('op-radar-legend'),
  opEconomyBlock: document.getElementById('op-economy-block'),
  opPeekHistogram: document.getElementById('op-peek-histogram'),
  opRoleSplitBlock: document.getElementById('op-role-split-block'),
  opAnglesBody: document.getElementById('op-angles-body'),

  dossierProtocols: document.getElementById('dossier-protocols'),
  dossierMarkdown: document.getElementById('dossier-markdown'),
  dossierSubtitle: document.getElementById('dossier-subtitle'),

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
  return LAYER_COLORS[cat] || '#2B9CE5';
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
    (p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`
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

function loadPreset(presetId) {
  state.presetId = presetId;
  state.isCustomImport = false;
  state.parsedMatch = getPreset(presetId);
  state.filters.teamId = 'all';
  state.filters.roundNumber = null;
  state.selectedClusterId = null;
  state.selectedEventId = null;
  state.targetOpPlayerId = null;
  state.compareOpPlayerId = null;
  populatePresetDropdown();
  populateTeamFilter();
  recomputeAndRender();
}

function loadCustomMatch(parsedMatch) {
  state.isCustomImport = true;
  state.parsedMatch = parsedMatch;
  state.filters.teamId = 'all';
  state.filters.roundNumber = null;
  state.selectedClusterId = null;
  state.selectedEventId = null;
  state.targetOpPlayerId = null;
  state.compareOpPlayerId = null;
  populatePresetDropdown();
  populateTeamFilter();
  recomputeAndRender();
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

  // Map-scoped utility report (respects round selection)
  state.utilityReport = analyzeUtility(scopedMatch, {
    side: state.filters.side,
    teamId: state.filters.teamId,
    categories: activeCategories,
    minTime: state.filters.minTime,
    maxTime: state.filters.maxTime
  });

  // Full-match utility report for setup win-rate deltas & dossier stability
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

  state.dossier = generateAntiOpDossier(
    match,
    state.fullUtilityReport,
    state.operatorReport,
    state.targetOpPlayerId
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

  renderHeaderTicker();
  renderRoundStrip();
  renderLayerCounts(scopedMatch);
  renderTacticalMap();
  renderInspector();
  renderPhaseTiming();
  renderSetupImpacts();
  renderCounterRecommendations();
  renderOperatorProfiler();
  renderCoachDossier();
}

function renderHeaderTicker() {
  const { teams, meta } = state.parsedMatch;
  const util = state.utilityReport;
  const fullUtil = state.fullUtilityReport;
  const topSetup = fullUtil.setupImpacts[0];
  const primaryOp =
    state.operatorReport.profiles.find((p) => p.playerId === state.targetOpPlayerId) ||
    state.operatorReport.profiles[0];

  const roundLabel = state.filters.roundNumber ? `R${state.filters.roundNumber} / ${meta.totalRounds}` : `${meta.totalRounds} rds`;

  el.scorePill.innerHTML = `
    <span class="ticker-team-a">${escapeHtml(teams[0].tag)}</span>
    <span class="ticker-score-num">${teams[0].score} - ${teams[1].score}</span>
    <span class="ticker-team-b">${escapeHtml(teams[1].tag)}</span>
    <span class="ticker-sep">&middot;</span>
    <span class="ticker-map">${escapeHtml(meta.mapName)}</span>
    <span class="ticker-sep">&middot;</span>
    <span class="ticker-meta">${escapeHtml(roundLabel)}</span>
    <span class="ticker-sep">&middot;</span>
    <span class="ticker-meta">${escapeHtml(meta.seriesId)}</span>
  `;

  const topDeltaHtml = topSetup
    ? `<span class="ticker-stat-item">Top setup: <span class="${topSetup.winRateDelta >= 0 ? 'ticker-stat-pos' : 'ticker-stat-red'}">${escapeHtml(topSetup.winRateDeltaLabel)}</span></span>`
    : '';
  const opHtml = primaryOp
    ? `<span class="ticker-stat-item">Op: <span class="ticker-stat-amber">${escapeHtml(primaryOp.playerName)}</span> ${primaryOp.opKd} K/D (Vuln ${primaryOp.tradeVulnerability.score})</span>`
    : '';

  el.tickerStats.innerHTML = `
    <span class="ticker-stat-item"><strong>${util.totalEvents}</strong> casts / <strong>${util.clusters.length}</strong> clusters</span>
    ${topDeltaHtml ? `<span class="ticker-sep">|</span>${topDeltaHtml}` : ''}
    ${opHtml ? `<span class="ticker-sep">|</span>${opHtml}` : ''}
  `;

  el.schemaMetaLabel.textContent = `${meta.schemaVersion} | ${meta.totalRounds} rds`;
  el.badgeUtilCount.textContent = String(util.totalEvents);
  el.badgeOpCount.textContent = String(state.operatorReport.profiles.length);

  el.mapPanelTitle.textContent = state.filters.roundNumber
    ? `${meta.mapName} (Round ${state.filters.roundNumber})`
    : meta.mapName;
  el.mapPanelSubtitle.textContent = cleanText(meta.tournament);
}

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
      cells.push('<span class="round-half-sep" aria-hidden="true"></span>');
    }
    const teamAWon = r.winningTeamId === teamAId;
    const winSide = r.winningTeamId === r.attackingTeamId ? 'attack' : 'defense';
    const hasOp = opRounds.has(r.roundNumber);
    const isActive = state.filters.roundNumber === r.roundNumber;
    const iconColor = teamAWon ? '#2B9CE5' : '#D94452';

    // Attack win icon (minimal spike/blade) vs Defense win icon (minimal shield)
    const iconSvg =
      winSide === 'attack'
        ? `<svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M5 1L8.5 8.5H1.5L5 1Z" fill="${iconColor}" /></svg>`
        : `<svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M5 1L8.5 2.5V5.3C8.5 7.2 7 8.5 5 9.2C3 8.5 1.5 7.2 1.5 5.3V2.5L5 1Z" fill="${iconColor}" /></svg>`;

    const winnerTag = teamAWon ? teams[0].tag : teams[1].tag;
    const title = `R${r.roundNumber}: ${winnerTag} win (${winSide}, ${r.winCondition})${hasOp ? ' - Op bought' : ''}`;

    cells.push(`
      <button
        class="round-cell ${teamAWon ? 'win-a' : 'win-b'}${isActive ? ' active' : ''}"
        type="button"
        data-round="${r.roundNumber}"
        title="${escapeHtml(title)}"
        aria-pressed="${isActive}"
      >
        ${hasOp ? '<span class="round-op-mark" aria-hidden="true"></span>' : ''}
        <span class="round-num">${r.roundNumber}</span>
        <span class="round-side-icon">${iconSvg}</span>
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

function renderTacticalMap() {
  const mapSpec = getMapSpec(state.parsedMatch.meta.mapName);
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
        <path d="M0,0 L6.5,3 L0,6 Z" fill="#D9A441" />
      </marker>
      <marker id="op-arrow-red" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
        <path d="M0,0 L6.5,3 L0,6 Z" fill="#D94452" />
      </marker>
    </defs>
  `);

  // Subtle architectural coordinate grid
  parts.push('<g opacity="0.35">');
  for (let i = 100; i < 1000; i += 100) {
    parts.push(`<line x1="${i}" y1="0" x2="${i}" y2="1000" stroke="#1b2029" stroke-width="1" />`);
    parts.push(`<line x1="0" y1="${i}" x2="1000" y2="${i}" stroke="#1b2029" stroke-width="1" />`);
  }
  parts.push('</g>');

  // Playable map floors (matte blueprint style, crisp 2-3px corners)
  parts.push('<g class="map-floors">');
  for (const f of mapSpec.floors) {
    parts.push(
      `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="3" fill="#171b24" stroke="#2c3342" stroke-width="1.6" />`
    );
  }
  parts.push('</g>');

  // Site plant boxes
  parts.push('<g class="map-sites">');
  for (const sb of mapSpec.siteBoxes) {
    parts.push(`
      <rect x="${sb.x}" y="${sb.y}" width="${sb.w}" height="${sb.h}" rx="3"
        fill="rgba(43, 156, 229, 0.05)" stroke="rgba(155, 163, 176, 0.34)" stroke-width="1.4" stroke-dasharray="6 4" />
      <text x="${sb.labelX}" y="${sb.labelY + 14}" text-anchor="middle"
        font-family="Inter, sans-serif" font-size="44" font-weight="700"
        fill="rgba(230, 233, 239, 0.14)">${escapeHtml(sb.site)}</text>
    `);
  }
  parts.push('</g>');

  // Cover boxes & obstacles
  parts.push('<g class="map-obstacles">');
  for (const ob of mapSpec.obstacles) {
    parts.push(`
      <rect x="${ob.x}" y="${ob.y}" width="${ob.w}" height="${ob.h}" rx="2"
        fill="#222834" stroke="#394254" stroke-width="1.2" />
      <text x="${ob.x + ob.w / 2}" y="${ob.y + ob.h / 2 + 3.5}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="8.5" font-weight="600" fill="#8b94a3">${escapeHtml(ob.label)}</text>
    `);
  }
  parts.push('</g>');

  // Callout labels
  parts.push('<g class="map-callouts">');
  for (const z of mapSpec.zones) {
    parts.push(`
      <text x="${z.x}" y="${z.y - 22}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="10" font-weight="600"
        fill="#7d8696" letter-spacing="0.3">${escapeHtml(z.name.toUpperCase())}</text>
    `);
  }
  parts.push('</g>');

  // Layer: Flat Cluster Rings (clean tactical circles, no glowing radial fog)
  if (state.filters.layers.heatmap) {
    parts.push('<g class="layer-heatmap">');
    for (const c of util.clusters) {
      const ringColor = colorForCategory(c.dominantCategory);
      const isSelected = state.selectedClusterId === c.id && !state.selectedEventId;
      parts.push(`
        <g class="svg-pin" data-cluster-id="${escapeHtml(c.id)}">
          <circle cx="${c.x}" cy="${c.y}" r="${c.radius}"
            fill="${ringColor}" fill-opacity="${isSelected ? '0.14' : '0.07'}"
            stroke="${ringColor}" stroke-width="${isSelected ? '2.2' : '1.3'}"
            stroke-dasharray="${isSelected ? 'none' : '4 3'}" opacity="${isSelected ? '1' : '0.82'}" />
        </g>
      `);
    }
    parts.push('</g>');
  }

  // Layer: Operator Sightlines (warm amber for pick, muted red for death)
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
      const stroke = sl.wonDuel ? '#D9A441' : '#D94452';
      const fill = sl.wonDuel ? 'rgba(217, 164, 65, 0.08)' : 'rgba(217, 68, 82, 0.07)';
      const marker = sl.wonDuel ? 'url(#op-arrow-amber)' : 'url(#op-arrow-red)';

      parts.push(`
        <g opacity="0.88">
          <polygon points="${p1} ${p2} ${p3}" fill="${fill}" />
          <line x1="${sl.origin.x}" y1="${sl.origin.y}" x2="${sl.target.x}" y2="${sl.target.y}"
            stroke="${stroke}" stroke-width="${sl.firstBlood ? 2.1 : 1.3}"
            stroke-dasharray="${sl.wonDuel ? 'none' : '4 3'}" marker-end="${marker}" />
          <circle cx="${sl.origin.x}" cy="${sl.origin.y}" r="${sl.firstBlood ? 5 : 3.6}"
            fill="#0F1115" stroke="${stroke}" stroke-width="1.8" />
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
        ${isSelected ? `<circle cx="${ev.x}" cy="${ev.y}" r="12" fill="none" stroke="#E6E9EF" stroke-width="1.8" />` : ''}
        <circle class="pin-core" cx="${ev.x}" cy="${ev.y}" r="${isSelected ? 6.5 : 5}"
          fill="${color}" stroke="#0F1115" stroke-width="1.4" />
      </g>
    `);
  }
  parts.push('</g>');

  // Crisp Cluster Count Labels
  if (state.filters.layers.heatmap) {
    parts.push('<g class="layer-cluster-badges">');
    for (const c of util.clusters.slice(0, 10)) {
      if (c.count < 2) continue;
      const ringColor = colorForCategory(c.dominantCategory);
      parts.push(`
        <g class="svg-pin" data-cluster-id="${escapeHtml(c.id)}">
          <rect x="${c.x - 13}" y="${c.y - 23}" width="26" height="14" rx="2"
            fill="#0F1115" stroke="${ringColor}" stroke-width="1.1" />
          <text x="${c.x}" y="${c.y - 12.5}" text-anchor="middle"
            font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="600" fill="${ringColor}">${c.count}x</text>
        </g>
      `);
    }
    parts.push('</g>');
  }

  el.tacticalSvg.innerHTML = parts.join('');
  el.mapCoordSummary.textContent = `${util.events.length} casts | ${util.clusters.length} clusters | ${sightlines.length} Op lines`;
}

function renderInspector() {
  const util = state.utilityReport;
  const ev = state.selectedEventId
    ? util.events.find((e) => e.id === state.selectedEventId)
    : null;

  if (ev) {
    el.inspectorBadge.textContent = `PIN R${ev.roundNumber}`;
    el.inspectorBadge.className = 'tag-mono tag-amber';
    const cat = ABILITY_CATEGORIES[ev.category];
    const color = colorForCategory(ev.category);
    el.pinInspector.innerHTML = `
      <div class="insp-head">
        <div>
          <div class="insp-title" style="color:${color}">${escapeHtml(ev.abilityName)}</div>
          <div class="insp-sub">${escapeHtml(ev.playerName)} (${escapeHtml(ev.agent)}) &middot; ${escapeHtml(ev.setupName)}</div>
        </div>
        <span class="tag-mono ${ev.roundWon ? 'tag-green' : 'tag-red'}">${ev.roundWon ? 'WIN' : 'LOSS'}</span>
      </div>
      <div class="kv-grid">
        <div class="kv-cell"><div class="kv-label">Callout</div><div class="kv-val">${escapeHtml(ev.callout)} (${escapeHtml(ev.site)})</div></div>
        <div class="kv-cell"><div class="kv-label">Clock / Side</div><div class="kv-val">${formatClock(ev.timestampSec)} ${ev.side.toUpperCase()}</div></div>
        <div class="kv-cell"><div class="kv-label">Coords</div><div class="kv-val">(${ev.x}, ${ev.y})</div></div>
        <div class="kv-cell"><div class="kv-label">Type</div><div class="kv-val" style="color:${color}">${escapeHtml(cat.label)}</div></div>
      </div>
    `;
    return;
  }

  // If a single round is selected and no specific pin was clicked, show round summary + top cluster
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
      el.inspectorBadge.className = 'tag-mono tag-blue';
      el.pinInspector.innerHTML = `
        <div class="insp-head">
          <div>
            <div class="insp-title">Round ${r.roundNumber} Summary</div>
            <div class="insp-sub">Winner: ${escapeHtml(winner?.name || r.winningTeamId)} (${winSide})</div>
          </div>
          <span class="tag-mono ${r.winningTeamId === state.parsedMatch.teams[0].id ? 'tag-blue' : 'tag-red'}">${escapeHtml(winner?.tag || '')} WIN</span>
        </div>
        <div class="kv-grid">
          <div class="kv-cell"><div class="kv-label">Condition</div><div class="kv-val">${escapeHtml(r.winCondition)}</div></div>
          <div class="kv-cell"><div class="kv-label">Site / Casts</div><div class="kv-val">Site ${escapeHtml(r.plantSite || '-')} | ${util.totalEvents}</div></div>
          <div class="kv-cell" style="grid-column:span 2"><div class="kv-label">Operator Buys</div><div class="kv-val">${opNames ? escapeHtml(opNames) : 'None'}</div></div>
        </div>
      `;
      return;
    }
  }

  const cluster =
    util.clusters.find((c) => c.id === state.selectedClusterId) || util.clusters[0];
  if (!cluster) {
    el.inspectorBadge.textContent = 'EMPTY';
    el.inspectorBadge.className = 'tag-mono';
    el.pinInspector.innerHTML = `<div class="insp-sub">No utility casts match active filters. Reset filters or widen clock window.</div>`;
    return;
  }

  const color = colorForCategory(cluster.dominantCategory);
  el.inspectorBadge.textContent = `CLUSTER ${cluster.density}%`;
  el.inspectorBadge.className = 'tag-mono tag-blue';
  el.pinInspector.innerHTML = `
    <div class="insp-head">
      <div>
        <div class="insp-title" style="color:${color}">${escapeHtml(cluster.callout)}</div>
        <div class="insp-sub">Top cast: ${escapeHtml(cluster.dominantAbility)}</div>
      </div>
      <span class="tag-mono ${cluster.winRate >= 50 ? 'tag-green' : 'tag-red'}">${cluster.winRate}% WR</span>
    </div>
    <div class="kv-grid">
      <div class="kv-cell"><div class="kv-label">Volume</div><div class="kv-val">${cluster.count} casts (r=${cluster.radius})</div></div>
      <div class="kv-cell"><div class="kv-label">Avg Clock</div><div class="kv-val">${cluster.avgClock}</div></div>
      <div class="kv-cell"><div class="kv-label">Centroid</div><div class="kv-val">(${cluster.x}, ${cluster.y})</div></div>
      <div class="kv-cell"><div class="kv-label">S / F / R / M</div><div class="kv-val">${cluster.categoryBreakdown.smoke}/${cluster.categoryBreakdown.flash}/${cluster.categoryBreakdown.recon}/${cluster.categoryBreakdown.molotov}</div></div>
    </div>
  `;
}

function renderPhaseTiming() {
  el.phaseTimingBars.innerHTML = state.utilityReport.phaseTiming
    .map(
      (p) => `
      <div class="phase-mini-row">
        <div class="phase-mini-top">
          <span>${escapeHtml(p.label)}</span>
          <span>${p.count} (${p.pct}%)</span>
        </div>
        <div class="phase-mini-track">
          <div class="phase-mini-fill" style="width:${Math.max(2, p.pct)}%"></div>
        </div>
      </div>
    `
    )
    .join('');
}

function renderSetupImpacts() {
  const rows = state.fullUtilityReport.setupImpacts.slice(0, 6);
  if (rows.length === 0) {
    el.setupImpactsBody.innerHTML = `<tr><td colspan="4" class="mono-muted">No setups in filter window.</td></tr>`;
    return;
  }
  el.setupImpactsBody.innerHTML = rows
    .map(
      (s) => `
      <tr>
        <td>
          <div class="setup-name">${escapeHtml(s.setupName)}</div>
          <div class="setup-meta">${escapeHtml(s.primaryCallout)} &middot; ${s.roundsUsed}r &middot; ${escapeHtml(s.avgClock)}</div>
        </td>
        <td><span class="side-tag ${s.side === 'attack' ? 'side-atk' : 'side-def'}">${s.side === 'attack' ? 'ATK' : 'DEF'}</span></td>
        <td class="num-col">${s.winRate}%</td>
        <td class="num-col"><span class="delta-val ${s.winRateDelta >= 0 ? 'delta-pos' : 'delta-neg'}">${escapeHtml(s.winRateDeltaLabel.replace(' WR', ''))}</span></td>
      </tr>
    `
    )
    .join('');
}

function renderCounterRecommendations() {
  const recs = state.fullUtilityReport.counterRecommendations.slice(0, 3);
  if (recs.length === 0) {
    el.counterRecommendations.innerHTML = `<div class="mono-muted">No counter rules triggered in filter window.</div>`;
    return;
  }
  el.counterRecommendations.innerHTML = recs
    .map(
      (r) => `
      <article class="counter-item ${escapeHtml(r.priority)}">
        <div class="counter-top">
          <span class="counter-title">${escapeHtml(r.callout)}: ${escapeHtml(r.counterAbility)}</span>
          <span class="tag-mono ${r.priority === 'CRITICAL' ? 'tag-red' : r.priority === 'HIGH' ? 'tag-amber' : 'tag-blue'}">${escapeHtml(r.priority)}</span>
        </div>
        <p class="counter-body">${escapeHtml(r.reasoning)}</p>
        <div class="counter-meta">
          <span>${escapeHtml(r.window)}</span>
          <span>${escapeHtml(r.agentSuggestion)}</span>
        </div>
      </article>
    `
    )
    .join('');
}

function renderOperatorRadarChart(primary, compare) {
  const axes = [
    { key: 'openingImpact', label: 'Opening' },
    { key: 'economyAggression', label: 'Op Econ' },
    { key: 'mapMobility', label: 'Mid Roam' },
    { key: 'angleDiversity', label: 'Angles' },
    { key: 'tradeVulnerability', label: 'Trade Vuln' },
    { key: 'duelWinRate', label: 'Duel WR%' }
  ];

  const cx = 190;
  const cy = 152;
  const maxR = 96;
  const n = axes.length;

  const pointFor = (idx, pct) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const r = (Math.max(5, Math.min(100, pct)) / 100) * maxR;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const parts = [];
  for (const level of [25, 50, 75, 100]) {
    const pts = axes.map((_, i) => pointFor(i, level).map((v) => v.toFixed(1)).join(',')).join(' ');
    parts.push(`<polygon points="${pts}" fill="none" stroke="#252a34" stroke-width="1" />`);
  }

  axes.forEach((ax, i) => {
    const [x2, y2] = pointFor(i, 100);
    const [lx, ly] = pointFor(i, 126);
    const yNudge = i === 0 ? -4 : i === 3 ? 11 : 4;
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#252a34" stroke-width="1" />`);
    parts.push(`
      <text x="${lx.toFixed(1)}" y="${(ly + yNudge).toFixed(1)}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="600" fill="#9ba3b0">${escapeHtml(ax.label)}</text>
    `);
  });

  if (compare && compare.playerId !== primary.playerId) {
    const cPts = axes
      .map((ax, i) => pointFor(i, compare.radar[ax.key]).map((v) => v.toFixed(1)).join(','))
      .join(' ');
    parts.push(
      `<polygon points="${cPts}" fill="rgba(43, 156, 229, 0.16)" stroke="#2B9CE5" stroke-width="1.8" />`
    );
  }

  const pPts = axes
    .map((ax, i) => pointFor(i, primary.radar[ax.key]).map((v) => v.toFixed(1)).join(','))
    .join(' ');
  parts.push(
    `<polygon points="${pPts}" fill="rgba(217, 164, 65, 0.18)" stroke="#D9A441" stroke-width="2" />`
  );

  axes.forEach((ax, i) => {
    const [px, py] = pointFor(i, primary.radar[ax.key]);
    parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="#D9A441" stroke="#0F1115" stroke-width="1.2" />`);
  });

  el.opRadarSvg.innerHTML = parts.join('');
  el.opRadarLegend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:#D9A441"></span>${escapeHtml(primary.playerName)} (${escapeHtml(primary.teamTag)})</span>
    ${
      compare && compare.playerId !== primary.playerId
        ? `<span class="legend-item"><span class="legend-swatch" style="background:#2B9CE5"></span>${escapeHtml(compare.playerName)} (${escapeHtml(compare.teamTag)})</span>`
        : ''
    }
  `;
}

function renderOperatorProfiler() {
  const profiles = state.operatorReport.profiles;
  if (profiles.length === 0) {
    el.opTargetSelect.innerHTML = '<option value="">No Operators</option>';
    el.opCompareSelect.innerHTML = '<option value="">None</option>';
    el.opEconomyBlock.innerHTML = '<div class="mono-muted">No Operator purchases in dataset.</div>';
    el.opPeekHistogram.innerHTML = '';
    el.opRoleSplitBlock.innerHTML = '';
    el.opAnglesBody.innerHTML = '';
    return;
  }

  const optsHtml = profiles
    .map(
      (p) =>
        `<option value="${escapeHtml(p.playerId)}">${escapeHtml(p.playerName)} (${escapeHtml(p.teamTag)} | ${escapeHtml(p.agent)} | ${p.opRounds}r)</option>`
    )
    .join('');

  el.opTargetSelect.innerHTML = optsHtml;
  el.opTargetSelect.value = state.targetOpPlayerId;
  el.opCompareSelect.innerHTML = optsHtml;
  el.opCompareSelect.value = state.compareOpPlayerId;

  const primary = profiles.find((p) => p.playerId === state.targetOpPlayerId) || profiles[0];
  const compare = profiles.find((p) => p.playerId === state.compareOpPlayerId) || primary;

  renderOperatorRadarChart(primary, compare);

  el.opEconomyBlock.innerHTML = `
    <div class="kv-grid" style="margin-top:0;">
      <div class="kv-cell">
        <div class="kv-label">&ge;$4,700 Full-Buy Op</div>
        <div class="kv-val" style="color:var(--c9-blue)">${primary.economy.fullBuyRate}% (${primary.economy.fullBuyOps}/${primary.economy.totalOpBuys})</div>
      </div>
      <div class="kv-cell">
        <div class="kv-label">Glass Cannon (&lt;$4,700 / No Armor)</div>
        <div class="kv-val" style="color:var(--val-red)">${primary.economy.glassCannonRate}% (${primary.economy.glassCannonOps}/${primary.economy.totalOpBuys})</div>
      </div>
      <div class="kv-cell">
        <div class="kv-label">Avg / Min Bank</div>
        <div class="kv-val" style="color:var(--op-amber)">$${primary.economy.avgBankOnOpBuy} / $${primary.economy.minBankOnOpBuy}</div>
      </div>
      <div class="kv-cell">
        <div class="kv-label">Op K/D &amp; First Bloods</div>
        <div class="kv-val">${primary.opKd} K/D | ${primary.firstBloods} FB (${primary.duelWinRate}%)</div>
      </div>
    </div>

    <div class="note-bar">${escapeHtml(primary.economy.thresholdAlert)}</div>

    <div class="vuln-box">
      <div class="vuln-score-tile ${escapeHtml(primary.tradeVulnerability.tier)}">
        <span class="num">${primary.tradeVulnerability.score}</span>
        <span class="denom">/100</span>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          <strong style="font-size:12.5px;">Trade-Death Vulnerability</strong>
          <span class="tag-mono ${primary.tradeVulnerability.tier === 'CRITICAL' ? 'tag-red' : primary.tradeVulnerability.tier === 'HIGH' ? 'tag-amber' : 'tag-blue'}">${escapeHtml(primary.tradeVulnerability.tier)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);">
          ${primary.tradeVulnerability.untradedDeaths}/${primary.tradeVulnerability.totalOpDeaths} Op deaths untraded (${primary.tradeVulnerability.untradedPct}%), ${primary.tradeVulnerability.earlyPeekDeaths} before 0:18.
          ${
            compare && compare.playerId !== primary.playerId
              ? `<br/>vs ${escapeHtml(compare.playerName)}: ${compare.tradeVulnerability.score}/100 (${escapeHtml(compare.tradeVulnerability.tier)}), ${compare.opKd} K/D.`
              : ''
          }
        </div>
      </div>
    </div>
  `;

  const maxBucket = Math.max(1, ...primary.peekHistogram.map((b) => b.count));
  el.opPeekHistogram.innerHTML = primary.peekHistogram
    .map((b) => {
      const totalH = b.count > 0 ? Math.max(14, Math.round((b.count / maxBucket) * 108)) : 3;
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
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span class="rail-title">Anchor vs Mid-Roam Split</span>
      <span class="mono-muted">Avg peek ${escapeHtml(primary.avgPeekClock)}</span>
    </div>
    <div class="split-bar">
      <div class="split-anchor" style="width:${primary.roleSplit.anchorPct}%"></div>
      <div class="split-roam" style="width:${primary.roleSplit.roamPct}%"></div>
      <div class="split-retake" style="width:${primary.roleSplit.retakePct}%"></div>
    </div>
    <div class="split-legend">
      <span style="color:var(--c9-blue)">Anchor ${primary.roleSplit.anchorPct}% (${primary.roleSplit.anchorCount})</span>
      <span style="color:var(--op-amber)">Mid Roam ${primary.roleSplit.roamPct}% (${primary.roleSplit.roamCount})</span>
      <span style="color:var(--val-red)">Retake ${primary.roleSplit.retakePct}% (${primary.roleSplit.retakeCount})</span>
    </div>
  `;

  el.opAnglesBody.innerHTML = primary.angleFrequency
    .map(
      (a) => `
      <tr>
        <td><strong>${escapeHtml(a.angleName)}</strong></td>
        <td style="color:var(--text-secondary)">${escapeHtml(a.callout)}</td>
        <td class="num-col">${a.engagements} (${a.frequencyPct}%)</td>
        <td class="num-col" style="color:var(--op-amber);font-weight:600">${a.firstBloods}</td>
        <td class="num-col" style="color:${a.kd >= 1 ? 'var(--recon-green)' : 'var(--val-red)'}">${a.kd}</td>
        <td class="num-col">${formatClock(a.avgPeekSec)}</td>
      </tr>
    `
    )
    .join('');
}

function renderCoachDossier() {
  const dossier = state.dossier;
  const target = dossier.json.targetSniper;
  el.dossierSubtitle.textContent = target
    ? `Target: ${target.playerName} (${target.teamTag}, ${target.agent}) on ${dossier.json.match.mapName}`
    : `Map: ${dossier.json.match.mapName}`;

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

  el.dossierMarkdown.textContent = dossier.markdown;
}

// =========================================================================
// Event Listeners & Modal Wiring
// =========================================================================

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
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
    loadCustomMatch(parsed);
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

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Round Strip Click (toggle single round or return to all)
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

  // Layer Checkboxes
  el.layerToggles.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-layer]');
    if (!input) return;
    const layer = input.dataset.layer;
    state.filters.layers[layer] = input.checked;
    recomputeAndRender();
  });

  // Side Filter
  el.sideFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-side]');
    if (!btn) return;
    state.filters.side = btn.dataset.side;
    el.sideFilter.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    recomputeAndRender();
  });

  // Team Filter
  el.teamFilter.addEventListener('change', (e) => {
    state.filters.teamId = e.target.value;
    recomputeAndRender();
  });

  // Round Clock Slider
  el.phaseSlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.filters.minTime = 0;
    state.filters.maxTime = val;
    el.phaseClockReadout.textContent = `0:00-${formatClock(val)}`;
    el.phasePresets.querySelectorAll('.phase-btn').forEach((c) => c.classList.remove('active'));
    recomputeAndRender();
  });

  // Clock Presets
  el.phasePresets.addEventListener('click', (e) => {
    const chip = e.target.closest('.phase-btn');
    if (!chip) return;
    state.filters.minTime = Number(chip.dataset.min);
    state.filters.maxTime = Number(chip.dataset.max);
    el.phaseSlider.value = String(state.filters.maxTime);
    el.phaseClockReadout.textContent = `${formatClock(state.filters.minTime)}-${formatClock(state.filters.maxTime)}`;
    el.phasePresets.querySelectorAll('.phase-btn').forEach((c) => c.classList.toggle('active', c === chip));
    recomputeAndRender();
  });

  // Reset Filters
  el.btnResetFilters.addEventListener('click', () => {
    state.filters = {
      roundNumber: null,
      side: 'all',
      teamId: 'all',
      minTime: 0,
      maxTime: 100,
      layers: { smoke: true, flash: true, recon: true, molotov: true, sightlines: true, heatmap: true }
    };
    el.layerToggles.querySelectorAll('input[data-layer]').forEach((cb) => {
      cb.checked = true;
    });
    el.sideFilter.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.side === 'all'));
    el.teamFilter.value = 'all';
    el.phaseSlider.value = '100';
    el.phaseClockReadout.textContent = '0:00-1:40';
    el.phasePresets.querySelectorAll('.phase-btn').forEach((c, idx) => c.classList.toggle('active', idx === 0));
    state.selectedEventId = null;
    state.selectedClusterId = null;
    recomputeAndRender();
  });

  // SVG Pin / Cluster Click Inspector
  el.tacticalSvg.addEventListener('click', (e) => {
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

  // Operator Profiler Selectors
  el.opTargetSelect.addEventListener('change', (e) => {
    state.targetOpPlayerId = e.target.value;
    state.dossier = generateAntiOpDossier(
      state.parsedMatch,
      state.fullUtilityReport,
      state.operatorReport,
      state.targetOpPlayerId
    );
    renderHeaderTicker();
    renderOperatorProfiler();
    renderCoachDossier();
  });

  el.opCompareSelect.addEventListener('change', (e) => {
    state.compareOpPlayerId = e.target.value;
    renderOperatorProfiler();
  });

  // Exports
  const exportMd = () => {
    downloadFile(`${state.dossier.filenameBase}.md`, state.dossier.markdown, 'text/markdown;charset=utf-8');
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

  document.getElementById('btn-copy-md').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.dossier.markdown);
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
