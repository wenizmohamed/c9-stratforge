/**
 * C9 StratForge — Interactive Tactical Scouting Application
 * Connects GRID Series State Parser + Deterministic Analytics Engine to SVG Radar,
 * Operator Profiler, Coach Match-Prep Dossier, and Live JSON Importer.
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

const state = {
  presetId: 'c9-sen-ascent',
  isCustomImport: false,
  parsedMatch: null,
  activeTab: 'radar',
  filters: {
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
  operatorReport: null,
  dossier: null
};

// DOM References
const el = {
  presetSelect: document.getElementById('preset-select'),
  scorePill: document.getElementById('score-pill'),
  kpiStrip: document.getElementById('kpi-strip'),
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

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    el.toast.classList.remove('show');
  }, 2600);
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
      `<option value="__custom__">Custom GRID Import — ${escapeHtml(state.parsedMatch.meta.mapName)}</option>`
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
      (t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.tag)} — ${escapeHtml(t.name)}</option>`
    )
  ].join('');
  el.teamFilter.value = state.filters.teamId;
}

function loadPreset(presetId) {
  state.presetId = presetId;
  state.isCustomImport = false;
  state.parsedMatch = getPreset(presetId);
  state.filters.teamId = 'all';
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
  state.selectedClusterId = null;
  state.selectedEventId = null;
  state.targetOpPlayerId = null;
  state.compareOpPlayerId = null;
  populatePresetDropdown();
  populateTeamFilter();
  recomputeAndRender();
}

function recomputeAndRender() {
  const match = state.parsedMatch;
  const activeCategories = ['smoke', 'flash', 'recon', 'molotov'].filter(
    (cat) => state.filters.layers[cat]
  );

  state.utilityReport = analyzeUtility(match, {
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
    state.utilityReport,
    state.operatorReport,
    state.targetOpPlayerId
  );

  if (!state.selectedEventId && !state.selectedClusterId && state.utilityReport.clusters.length > 0) {
    state.selectedClusterId = state.utilityReport.clusters[0].id;
  }

  renderHeaderMeta();
  renderKpis();
  renderLayerCounts();
  renderTacticalMap();
  renderInspector();
  renderPhaseTiming();
  renderSetupImpacts();
  renderCounterRecommendations();
  renderOperatorProfiler();
  renderCoachDossier();
}

function renderHeaderMeta() {
  const { teams, meta } = state.parsedMatch;
  el.scorePill.innerHTML = `
    <span class="team-a">${escapeHtml(teams[0].tag)} ${teams[0].score}</span>
    <span style="color:var(--text-muted)">:</span>
    <span class="team-b">${teams[1].score} ${escapeHtml(teams[1].tag)}</span>
    <span class="map-tag">${escapeHtml(meta.mapName.toUpperCase())}</span>
  `;
  el.schemaMetaLabel.textContent = `${meta.schemaVersion} • ${meta.totalRounds} Rds • ${meta.seriesId}`;
  el.badgeUtilCount.textContent = String(state.utilityReport.totalEvents);
  el.badgeOpCount.textContent = String(state.operatorReport.profiles.length);
  el.mapPanelTitle.textContent = `${meta.mapName} Tactical Radar`;
  el.mapPanelSubtitle.textContent = `${meta.tournament} • Click any pin or cluster halo to inspect timing, WR delta & counters`;
}

function renderKpis() {
  const util = state.utilityReport;
  const opReport = state.operatorReport;
  const topSetup = util.setupImpacts[0];
  const primaryOp =
    opReport.profiles.find((p) => p.playerId === state.targetOpPlayerId) ||
    opReport.profiles[0];

  el.kpiStrip.innerHTML = `
    <div class="kpi-card accent-cyan">
      <div class="kpi-label">Utility Events &amp; Clusters</div>
      <div class="kpi-value">${util.totalEvents} <span style="font-size:14px;color:var(--c9-cyan);font-family:var(--font-mono)">${util.clusters.length} clusters</span></div>
      <div class="kpi-sub">Active window ${formatClock(state.filters.minTime)}&ndash;${formatClock(state.filters.maxTime)} • ${util.heatmapZones[0]?.callout || 'All Zones'} hottest</div>
    </div>
    <div class="kpi-card accent-mint">
      <div class="kpi-label">Highest Win-Rate Delta Setup</div>
      <div class="kpi-value">${topSetup ? escapeHtml(topSetup.winRateDeltaLabel) : 'N/A'}</div>
      <div class="kpi-sub">${topSetup ? `${escapeHtml(topSetup.setupName)} (${topSetup.winRate}% WR)` : 'Adjust filters to inspect setups'}</div>
    </div>
    <div class="kpi-card accent-gold">
      <div class="kpi-label">Primary Operator Threat</div>
      <div class="kpi-value">${primaryOp ? `${escapeHtml(primaryOp.playerName)} <span style="font-size:14px;color:var(--op-gold);font-family:var(--font-mono)">${primaryOp.opKd} K/D</span>` : 'None'}</div>
      <div class="kpi-sub">${primaryOp ? `${primaryOp.opRounds}/${primaryOp.totalRounds} Op rds • ${primaryOp.economy.glassCannonRate}% glass cannon • Avg peek ${primaryOp.avgPeekClock}` : 'No Operator buys in dataset'}</div>
    </div>
    <div class="kpi-card accent-crimson">
      <div class="kpi-label">Trade-Death Vulnerability</div>
      <div class="kpi-value">${primaryOp ? `${primaryOp.tradeVulnerability.score}<span style="font-size:15px;color:var(--text-muted)">/100</span> <span class="priority-badge priority-${primaryOp.tradeVulnerability.tier}">${primaryOp.tradeVulnerability.tier}</span>` : 'N/A'}</div>
      <div class="kpi-sub">${primaryOp ? `${primaryOp.tradeVulnerability.untradedPct}% untraded Op deaths • ${primaryOp.roleSplit.anchorPct}% Anchor / ${primaryOp.roleSplit.roamPct}% Roam` : 'No Operator deaths recorded'}</div>
    </div>
  `;
}

function renderLayerCounts() {
  // Compute full counts for current time/side/team across all 4 categories so chips show accurate badges
  const allCatsReport = analyzeUtility(state.parsedMatch, {
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
    if (state.filters.teamId !== 'all' && s.teamId !== state.filters.teamId) return false;
    if (s.timestampSec < state.filters.minTime || s.timestampSec > state.filters.maxTime) return false;
    return true;
  });

  const parts = [];

  // SVG Defs: radial heatmap gradients + arrowhead markers
  parts.push(`
    <defs>
      <radialGradient id="heat-cyan" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#00AEEF" stop-opacity="0.48" />
        <stop offset="55%" stop-color="#00AEEF" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#00AEEF" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="heat-gold" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#F5B700" stop-opacity="0.46" />
        <stop offset="55%" stop-color="#F5B700" stop-opacity="0.15" />
        <stop offset="100%" stop-color="#F5B700" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="heat-mint" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#2EE6A6" stop-opacity="0.45" />
        <stop offset="55%" stop-color="#2EE6A6" stop-opacity="0.15" />
        <stop offset="100%" stop-color="#2EE6A6" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="heat-crimson" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FF4655" stop-opacity="0.48" />
        <stop offset="55%" stop-color="#FF4655" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#FF4655" stop-opacity="0" />
      </radialGradient>
      <marker id="op-arrow-gold" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L7,3 L0,6 Z" fill="#F5B700" />
      </marker>
      <marker id="op-arrow-red" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L7,3 L0,6 Z" fill="#FF4655" />
      </marker>
    </defs>
  `);

  // Tactical Radar Coordinate Grid
  parts.push('<g opacity="0.22">');
  for (let i = 100; i < 1000; i += 100) {
    parts.push(`<line x1="${i}" y1="0" x2="${i}" y2="1000" stroke="#2c4469" stroke-width="1" stroke-dasharray="3 6" />`);
    parts.push(`<line x1="0" y1="${i}" x2="1000" y2="${i}" stroke="#2c4469" stroke-width="1" stroke-dasharray="3 6" />`);
  }
  parts.push('</g>');

  // Architectural Floors
  parts.push('<g class="map-floors">');
  for (const f of mapSpec.floors) {
    parts.push(
      `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="${f.rx || 8}" fill="#111d33" stroke="#2b4266" stroke-width="2" />`
    );
  }
  parts.push('</g>');

  // Site Plant Boxes
  parts.push('<g class="map-sites">');
  for (const sb of mapSpec.siteBoxes) {
    parts.push(`
      <rect x="${sb.x}" y="${sb.y}" width="${sb.w}" height="${sb.h}" rx="10"
        fill="rgba(0, 174, 239, 0.07)" stroke="rgba(0, 174, 239, 0.45)" stroke-width="2" stroke-dasharray="8 5" />
      <text x="${sb.labelX}" y="${sb.labelY + 12}" text-anchor="middle"
        font-family="Rajdhani, sans-serif" font-size="48" font-weight="700"
        fill="rgba(0, 174, 239, 0.22)" letter-spacing="4">${escapeHtml(sb.site)}</text>
    `);
  }
  parts.push('</g>');

  // Cover Obstacles
  parts.push('<g class="map-obstacles">');
  for (const ob of mapSpec.obstacles) {
    parts.push(`
      <rect x="${ob.x}" y="${ob.y}" width="${ob.w}" height="${ob.h}" rx="4"
        fill="#1c2d4a" stroke="#3c5a85" stroke-width="1.5" />
      <text x="${ob.x + ob.w / 2}" y="${ob.y + ob.h / 2 + 4}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="9" font-weight="600" fill="#7c98be">${escapeHtml(ob.label)}</text>
    `);
  }
  parts.push('</g>');

  // Callout Labels
  parts.push('<g class="map-callouts">');
  for (const z of mapSpec.zones) {
    parts.push(`
      <text x="${z.x}" y="${z.y - 22}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="600"
        fill="rgba(181, 206, 236, 0.56)" letter-spacing="0.4">${escapeHtml(z.name.toUpperCase())}</text>
    `);
  }
  parts.push('</g>');

  // Layer: Heatmap Rings (Spatial Clusters)
  if (state.filters.layers.heatmap) {
    const gradMap = { smoke: 'heat-cyan', flash: 'heat-gold', recon: 'heat-mint', molotov: 'heat-crimson' };
    parts.push('<g class="layer-heatmap">');
    for (const c of util.clusters) {
      const gradId = gradMap[c.dominantCategory] || 'heat-cyan';
      const isSelected = state.selectedClusterId === c.id;
      const outerR = c.radius * 1.45;
      parts.push(`
        <g class="svg-pin" data-cluster-id="${escapeHtml(c.id)}">
          <circle cx="${c.x}" cy="${c.y}" r="${outerR}" fill="url(#${gradId})" />
          <circle cx="${c.x}" cy="${c.y}" r="${c.radius}" fill="none"
            stroke="${c.color}" stroke-width="${isSelected ? 3 : 1.6}"
            stroke-dasharray="${isSelected ? 'none' : '5 4'}" opacity="${isSelected ? 0.98 : 0.72}" />
        </g>
      `);
    }
    parts.push('</g>');
  }

  // Layer: Operator Sightline Cones
  if (state.filters.layers.sightlines) {
    parts.push('<g class="layer-sightlines">');
    for (const sl of sightlines) {
      const dx = sl.target.x - sl.origin.x;
      const dy = sl.target.y - sl.origin.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const spread = Math.min(34, dist * 0.14);
      const nx = (-dy / dist) * spread;
      const ny = (dx / dist) * spread;
      const p1 = `${sl.origin.x},${sl.origin.y}`;
      const p2 = `${Math.round(sl.target.x + nx)},${Math.round(sl.target.y + ny)}`;
      const p3 = `${Math.round(sl.target.x - nx)},${Math.round(sl.target.y - ny)}`;
      const stroke = sl.wonDuel ? '#F5B700' : '#FF4655';
      const fill = sl.wonDuel ? 'rgba(245, 183, 0, 0.11)' : 'rgba(255, 70, 85, 0.10)';
      const marker = sl.wonDuel ? 'url(#op-arrow-gold)' : 'url(#op-arrow-red)';

      parts.push(`
        <g opacity="0.86">
          <polygon points="${p1} ${p2} ${p3}" fill="${fill}" />
          <line x1="${sl.origin.x}" y1="${sl.origin.y}" x2="${sl.target.x}" y2="${sl.target.y}"
            stroke="${stroke}" stroke-width="${sl.firstBlood ? 2.4 : 1.5}"
            stroke-dasharray="${sl.wonDuel ? 'none' : '4 4'}" marker-end="${marker}" />
          <circle cx="${sl.origin.x}" cy="${sl.origin.y}" r="${sl.firstBlood ? 6 : 4.2}"
            fill="#060a13" stroke="${stroke}" stroke-width="2" />
        </g>
      `);
    }
    parts.push('</g>');
  }

  // Layer: Individual Clickable Utility Pins
  parts.push('<g class="layer-pins">');
  for (const ev of util.events) {
    const color = ABILITY_CATEGORIES[ev.category]?.color || '#00AEEF';
    const isSelected = state.selectedEventId === ev.id;
    parts.push(`
      <g class="svg-pin" data-event-id="${escapeHtml(ev.id)}" role="button" tabindex="0" aria-label="${escapeHtml(ev.abilityName)} at ${escapeHtml(ev.callout)}">
        ${isSelected ? `<circle cx="${ev.x}" cy="${ev.y}" r="14" fill="none" stroke="#ffffff" stroke-width="2.2" />` : ''}
        <circle class="pin-core" cx="${ev.x}" cy="${ev.y}" r="${isSelected ? 7.5 : 5.8}"
          fill="${color}" stroke="#060a13" stroke-width="1.8" />
      </g>
    `);
  }
  parts.push('</g>');

  // Cluster Count Badges on Top
  if (state.filters.layers.heatmap) {
    parts.push('<g class="layer-cluster-badges">');
    for (const c of util.clusters.slice(0, 10)) {
      if (c.count < 2) continue;
      parts.push(`
        <g class="svg-pin" data-cluster-id="${escapeHtml(c.id)}">
          <rect x="${c.x - 14}" y="${c.y - 26}" width="28" height="16" rx="8"
            fill="#060a13" stroke="${c.color}" stroke-width="1.4" />
          <text x="${c.x}" y="${c.y - 14.5}" text-anchor="middle"
            font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="${c.color}">${c.count}x</text>
        </g>
      `);
    }
    parts.push('</g>');
  }

  el.tacticalSvg.innerHTML = parts.join('');
  el.mapCoordSummary.textContent = `${util.events.length} utility casts • ${util.clusters.length} clusters • ${sightlines.length} Op sightlines`;
}

function renderInspector() {
  const util = state.utilityReport;
  const ev = state.selectedEventId
    ? util.events.find((e) => e.id === state.selectedEventId)
    : null;

  if (ev) {
    el.inspectorBadge.textContent = `PIN • R${ev.roundNumber}`;
    el.inspectorBadge.className = 'priority-badge priority-HIGH';
    const cat = ABILITY_CATEGORIES[ev.category];
    el.pinInspector.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div>
          <strong style="font-size:15px;color:${cat.color}">${escapeHtml(ev.abilityName)}</strong>
          <span style="color:var(--text-secondary);margin-left:6px;">by ${escapeHtml(ev.playerName)} (${escapeHtml(ev.agent)})</span>
        </div>
        <span class="delta-badge ${ev.roundWon ? 'delta-pos' : 'delta-neg'}">${ev.roundWon ? 'ROUND WON' : 'ROUND LOST'}</span>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Setup: <strong>${escapeHtml(ev.setupName)}</strong></div>
      <div class="inspector-grid">
        <div class="mini-stat"><div class="mini-stat-label">Callout / Site</div><div class="mini-stat-val">${escapeHtml(ev.callout)} (${escapeHtml(ev.site)})</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Clock / Side</div><div class="mini-stat-val">${formatClock(ev.timestampSec)} • ${ev.side.toUpperCase()}</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Radar Coords</div><div class="mini-stat-val">(${ev.x}, ${ev.y})</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Category</div><div class="mini-stat-val" style="color:${cat.color}">${escapeHtml(cat.label)}</div></div>
      </div>
    `;
    return;
  }

  const cluster =
    util.clusters.find((c) => c.id === state.selectedClusterId) || util.clusters[0];
  if (!cluster) {
    el.inspectorBadge.textContent = 'NO DATA';
    el.pinInspector.innerHTML = `<div style="color:var(--text-secondary)">No utility events match the active filters. Widen the clock slider or enable more ability layers.</div>`;
    return;
  }

  el.inspectorBadge.textContent = `CLUSTER • ${cluster.density}% HEAT`;
  el.inspectorBadge.className = 'priority-badge priority-MEDIUM';
  el.pinInspector.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <div>
        <strong style="font-size:15px;color:${cluster.color}">${escapeHtml(cluster.callout)}</strong>
        <span style="color:var(--text-secondary);margin-left:6px;">Dominant: ${escapeHtml(cluster.dominantAbility)}</span>
      </div>
      <span class="delta-badge ${cluster.winRate >= 50 ? 'delta-pos' : 'delta-neg'}">${cluster.winRate}% Cluster WR</span>
    </div>
    <div class="inspector-grid">
      <div class="mini-stat"><div class="mini-stat-label">Cluster Casts</div><div class="mini-stat-val">${cluster.count} casts (r=${cluster.radius})</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Avg Cast Clock</div><div class="mini-stat-val">${cluster.avgClock}</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Centroid (X, Y)</div><div class="mini-stat-val">(${cluster.x}, ${cluster.y})</div></div>
      <div class="mini-stat"><div class="mini-stat-label">Mix (S/F/R/M)</div><div class="mini-stat-val">${cluster.categoryBreakdown.smoke}/${cluster.categoryBreakdown.flash}/${cluster.categoryBreakdown.recon}/${cluster.categoryBreakdown.molotov}</div></div>
    </div>
  `;
}

function renderPhaseTiming() {
  el.phaseTimingBars.innerHTML = state.utilityReport.phaseTiming
    .map(
      (p) => `
      <div class="phase-bar-card">
        <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10.5px;">
          <span style="color:var(--c9-cyan);font-weight:700">${escapeHtml(p.label)}</span>
          <span>${p.pct}%</span>
        </div>
        <div class="phase-bar-track"><div class="phase-bar-fill" style="width:${Math.max(4, p.pct)}%"></div></div>
        <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml(p.title)} (${p.count})</div>
      </div>
    `
    )
    .join('');
}

function renderSetupImpacts() {
  const rows = state.utilityReport.setupImpacts.slice(0, 6);
  if (rows.length === 0) {
    el.setupImpactsBody.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted)">No utility setups in current filter window.</td></tr>`;
    return;
  }
  el.setupImpactsBody.innerHTML = rows
    .map(
      (s) => `
      <tr>
        <td>
          <div style="font-weight:600;color:var(--text-primary)">${escapeHtml(s.setupName)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(s.primaryCallout)} • ${s.roundsUsed} rds</div>
        </td>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:${s.side === 'attack' ? '#ff808b' : '#00aeef'}">${s.side.toUpperCase()}</span></td>
        <td style="font-family:var(--font-mono)">${escapeHtml(s.avgClock)}</td>
        <td style="font-family:var(--font-mono)">${s.winRate}%</td>
        <td><span class="delta-badge ${s.winRateDelta >= 0 ? 'delta-pos' : 'delta-neg'}">${escapeHtml(s.winRateDeltaLabel)}</span></td>
      </tr>
    `
    )
    .join('');
}

function renderCounterRecommendations() {
  const recs = state.utilityReport.counterRecommendations;
  if (recs.length === 0) {
    el.counterRecommendations.innerHTML = `<div style="color:var(--text-muted)">No high-frequency setups detected in this filter window.</div>`;
    return;
  }
  el.counterRecommendations.innerHTML = recs
    .map(
      (r) => `
      <article class="counter-card ${escapeHtml(r.priority)}">
        <div class="counter-card-top">
          <span class="counter-card-title">${escapeHtml(r.callout)} &mdash; ${escapeHtml(r.counterAbility)}</span>
          <span class="priority-badge priority-${escapeHtml(r.priority)}">${escapeHtml(r.priority)}</span>
        </div>
        <p>${escapeHtml(r.reasoning)}</p>
        <div class="counter-meta">
          <span>Window: ${escapeHtml(r.window)}</span>
          <span>Agent: ${escapeHtml(r.agentSuggestion)}</span>
          <span style="color:var(--recon-mint)">${escapeHtml(r.expectedImpact)}</span>
        </div>
      </article>
    `
    )
    .join('');
}

function renderOperatorRadarChart(primary, compare) {
  const axes = [
    { key: 'openingImpact', label: 'Opening Impact' },
    { key: 'economyAggression', label: 'Op Economy' },
    { key: 'mapMobility', label: 'Mid Roam' },
    { key: 'angleDiversity', label: 'Angle Variety' },
    { key: 'tradeVulnerability', label: 'Trade Vuln.' },
    { key: 'duelWinRate', label: 'Duel WR%' }
  ];

  const cx = 190;
  const cy = 160;
  const maxR = 100;
  const n = axes.length;

  const pointFor = (idx, pct) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const r = (Math.max(5, Math.min(100, pct)) / 100) * maxR;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const parts = [];
  // Concentric hex webs
  for (const level of [25, 50, 75, 100]) {
    const pts = axes.map((_, i) => pointFor(i, level).map((v) => v.toFixed(1)).join(',')).join(' ');
    parts.push(`<polygon points="${pts}" fill="none" stroke="rgba(148,179,214,0.16)" stroke-width="1" />`);
  }
  // Spokes + Labels
  axes.forEach((ax, i) => {
    const [x2, y2] = pointFor(i, 100);
    const [lx, ly] = pointFor(i, 130);
    const yNudge = i === 0 ? -4 : i === 3 ? 11 : 4;
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(148,179,214,0.18)" stroke-width="1" />`);
    parts.push(`
      <text x="${lx.toFixed(1)}" y="${(ly + yNudge).toFixed(1)}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="600" fill="#a8bed9">${escapeHtml(ax.label)}</text>
    `);
  });

  if (compare && compare.playerId !== primary.playerId) {
    const cPts = axes
      .map((ax, i) => pointFor(i, compare.radar[ax.key]).map((v) => v.toFixed(1)).join(','))
      .join(' ');
    parts.push(
      `<polygon points="${cPts}" fill="rgba(0, 174, 239, 0.22)" stroke="#00AEEF" stroke-width="2.2" />`
    );
  }

  const pPts = axes
    .map((ax, i) => pointFor(i, primary.radar[ax.key]).map((v) => v.toFixed(1)).join(','))
    .join(' ');
  parts.push(
    `<polygon points="${pPts}" fill="rgba(245, 183, 0, 0.24)" stroke="#F5B700" stroke-width="2.5" />`
  );

  axes.forEach((ax, i) => {
    const [px, py] = pointFor(i, primary.radar[ax.key]);
    parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="#F5B700" stroke="#060a13" stroke-width="1.5" />`);
  });

  el.opRadarSvg.innerHTML = parts.join('');
  el.opRadarLegend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:#F5B700"></span>${escapeHtml(primary.playerName)} (${escapeHtml(primary.teamTag)})</span>
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
    el.opEconomyBlock.innerHTML = '<div style="color:var(--text-muted)">No Operator purchases found in this dataset.</div>';
    el.opPeekHistogram.innerHTML = '';
    el.opRoleSplitBlock.innerHTML = '';
    el.opAnglesBody.innerHTML = '';
    return;
  }

  const optsHtml = profiles
    .map(
      (p) =>
        `<option value="${escapeHtml(p.playerId)}">${escapeHtml(p.playerName)} (${escapeHtml(p.teamTag)} • ${escapeHtml(p.agent)} • ${p.opRounds} Op rds)</option>`
    )
    .join('');

  el.opTargetSelect.innerHTML = optsHtml;
  el.opTargetSelect.value = state.targetOpPlayerId;
  el.opCompareSelect.innerHTML = optsHtml;
  el.opCompareSelect.value = state.compareOpPlayerId;

  const primary = profiles.find((p) => p.playerId === state.targetOpPlayerId) || profiles[0];
  const compare = profiles.find((p) => p.playerId === state.compareOpPlayerId) || primary;

  renderOperatorRadarChart(primary, compare);

  // Economy Thresholds & Vulnerability
  el.opEconomyBlock.innerHTML = `
    <div class="inspector-grid" style="margin-top:0;">
      <div class="mini-stat">
        <div class="mini-stat-label">&ge;$4,700 Full-Buy Op Rate</div>
        <div class="mini-stat-val" style="color:var(--c9-cyan)">${primary.economy.fullBuyRate}% (${primary.economy.fullBuyOps}/${primary.economy.totalOpBuys})</div>
      </div>
      <div class="mini-stat">
        <div class="mini-stat-label">Glass Cannon (&lt;$4,700 / No Armor)</div>
        <div class="mini-stat-val" style="color:var(--val-crimson)">${primary.economy.glassCannonRate}% (${primary.economy.glassCannonOps}/${primary.economy.totalOpBuys})</div>
      </div>
      <div class="mini-stat">
        <div class="mini-stat-label">Avg / Min Bank on Op Buy</div>
        <div class="mini-stat-val" style="color:var(--op-gold)">$${primary.economy.avgBankOnOpBuy} / $${primary.economy.minBankOnOpBuy}</div>
      </div>
      <div class="mini-stat">
        <div class="mini-stat-label">Op K/D &amp; First Bloods</div>
        <div class="mini-stat-val">${primary.opKd} K/D • ${primary.firstBloods} FB (${primary.duelWinRate}% WR)</div>
      </div>
    </div>

    <div class="alert-banner">${escapeHtml(primary.economy.thresholdAlert)}</div>

    <div class="vuln-meter">
      <div class="vuln-score-circle ${escapeHtml(primary.tradeVulnerability.tier)}">
        <span class="num">${primary.tradeVulnerability.score}</span>
        <span class="denom">/100</span>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <strong style="font-size:14px;">Trade-Death Vulnerability Index</strong>
          <span class="priority-badge priority-${escapeHtml(primary.tradeVulnerability.tier)}">${escapeHtml(primary.tradeVulnerability.tier)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);">
          ${primary.tradeVulnerability.untradedDeaths}/${primary.tradeVulnerability.totalOpDeaths} Op deaths untraded (${primary.tradeVulnerability.untradedPct}%) • ${primary.tradeVulnerability.earlyPeekDeaths} early-peek deaths (&lt;0:18).
          ${
            compare && compare.playerId !== primary.playerId
              ? `<br/>Compare vs <strong>${escapeHtml(compare.playerName)}</strong>: ${compare.tradeVulnerability.score}/100 (${compare.tradeVulnerability.tier}) • ${compare.opKd} K/D.`
              : ''
          }
        </div>
      </div>
    </div>
  `;

  // Early-Peek Timing Histogram
  const maxBucket = Math.max(1, ...primary.peekHistogram.map((b) => b.count));
  el.opPeekHistogram.innerHTML = primary.peekHistogram
    .map((b) => {
      const totalH = b.count > 0 ? Math.max(16, Math.round((b.count / maxBucket) * 116)) : 4;
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

  // Site-Anchor vs Roam Split
  el.opRoleSplitBlock.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <strong style="font-family:var(--font-display);font-size:15px;letter-spacing:0.04em;text-transform:uppercase;">Site-Anchor vs Mid-Roam Split</strong>
      <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);">Avg Peek Clock: ${escapeHtml(primary.avgPeekClock)}</span>
    </div>
    <div class="split-bar">
      <div class="split-anchor" style="width:${primary.roleSplit.anchorPct}%"></div>
      <div class="split-roam" style="width:${primary.roleSplit.roamPct}%"></div>
      <div class="split-retake" style="width:${primary.roleSplit.retakePct}%"></div>
    </div>
    <div class="split-legend">
      <span style="color:var(--c9-cyan)">Anchor: ${primary.roleSplit.anchorPct}% (${primary.roleSplit.anchorCount})</span>
      <span style="color:var(--op-gold)">Mid Roam: ${primary.roleSplit.roamPct}% (${primary.roleSplit.roamCount})</span>
      <span style="color:var(--val-crimson)">Retake: ${primary.roleSplit.retakePct}% (${primary.roleSplit.retakeCount})</span>
    </div>
  `;

  // First-Blood Angle Frequency Table
  el.opAnglesBody.innerHTML = primary.angleFrequency
    .map(
      (a) => `
      <tr>
        <td><strong>${escapeHtml(a.angleName)}</strong></td>
        <td style="color:var(--text-secondary)">${escapeHtml(a.callout)}</td>
        <td style="font-family:var(--font-mono)">${a.engagements} (${a.frequencyPct}%)</td>
        <td style="font-family:var(--font-mono);color:var(--op-gold);font-weight:700">${a.firstBloods}</td>
        <td style="font-family:var(--font-mono);color:${a.kd >= 1 ? 'var(--recon-mint)' : '#ff7a86'}">${a.kd}</td>
        <td style="font-family:var(--font-mono)">${formatClock(a.avgPeekSec)}</td>
      </tr>
    `
    )
    .join('');
}

function renderCoachDossier() {
  const dossier = state.dossier;
  const target = dossier.json.targetSniper;
  el.dossierSubtitle.textContent = target
    ? `Prepared vs ${target.playerName} (${target.teamTag} • ${target.agent}) on ${dossier.json.match.mapName}`
    : `Match briefing for ${dossier.json.match.mapName}`;

  el.dossierProtocols.innerHTML = dossier.json.antiOpProtocols
    .map(
      (p) => `
      <article class="protocol-card">
        <h4>${escapeHtml(p.phase)}</h4>
        <div class="protocol-trigger">${escapeHtml(p.trigger)}</div>
        <div style="font-size:12.5px;color:var(--text-secondary)">${escapeHtml(p.action)}</div>
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
    el.modalFeedback.textContent = `Validated GRID Series State: ${parsed.meta.mapName} • ${parsed.meta.totalRounds} rounds • ${parsed.utilityEvents.length} utility events.`;
    el.modalFeedback.className = 'modal-feedback success';
    loadCustomMatch(parsed);
    closeImportModal();
    showToast(`Imported GRID JSON: ${parsed.teams[0].tag} vs ${parsed.teams[1].tag} (${parsed.meta.mapName})`);
  } catch (err) {
    el.modalFeedback.textContent = `Schema Error: ${err.message}`;
    el.modalFeedback.className = 'modal-feedback error';
  }
}

function bindEvents() {
  el.presetSelect.addEventListener('change', (e) => {
    if (e.target.value !== '__custom__') {
      loadPreset(e.target.value);
      showToast(`Loaded preset: ${e.target.options[e.target.selectedIndex].text}`);
    }
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Layer Toggles
  el.layerToggles.addEventListener('click', (e) => {
    const chip = e.target.closest('.layer-chip');
    if (!chip) return;
    const layer = chip.dataset.layer;
    state.filters.layers[layer] = !state.filters.layers[layer];
    chip.classList.toggle('active', state.filters.layers[layer]);
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

  // Round-Phase Slider
  el.phaseSlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.filters.minTime = 0;
    state.filters.maxTime = val;
    el.phaseClockReadout.textContent = formatClock(val);
    el.phasePresets.querySelectorAll('.phase-chip').forEach((c) => c.classList.remove('active'));
    recomputeAndRender();
  });

  // Round-Phase Preset Buttons
  el.phasePresets.addEventListener('click', (e) => {
    const chip = e.target.closest('.phase-chip');
    if (!chip) return;
    state.filters.minTime = Number(chip.dataset.min);
    state.filters.maxTime = Number(chip.dataset.max);
    el.phaseSlider.value = String(state.filters.maxTime);
    el.phaseClockReadout.textContent = `${formatClock(state.filters.minTime)}-${formatClock(state.filters.maxTime)}`;
    el.phasePresets.querySelectorAll('.phase-chip').forEach((c) => c.classList.toggle('active', c === chip));
    recomputeAndRender();
  });

  // Reset Filters
  el.btnResetFilters.addEventListener('click', () => {
    state.filters = {
      side: 'all',
      teamId: 'all',
      minTime: 0,
      maxTime: 100,
      layers: { smoke: true, flash: true, recon: true, molotov: true, sightlines: true, heatmap: true }
    };
    el.layerToggles.querySelectorAll('.layer-chip').forEach((c) => c.classList.add('active'));
    el.sideFilter.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.side === 'all'));
    el.teamFilter.value = 'all';
    el.phaseSlider.value = '100';
    el.phaseClockReadout.textContent = '1:40';
    el.phasePresets.querySelectorAll('.phase-chip').forEach((c, idx) => c.classList.toggle('active', idx === 0));
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
      state.utilityReport,
      state.operatorReport,
      state.targetOpPlayerId
    );
    renderKpis();
    renderOperatorProfiler();
    renderCoachDossier();
  });

  el.opCompareSelect.addEventListener('change', (e) => {
    state.compareOpPlayerId = e.target.value;
    renderOperatorProfiler();
  });

  // Export Buttons (both Operator tab and Dossier tab)
  const exportMd = () => {
    downloadFile(`${state.dossier.filenameBase}.md`, state.dossier.markdown, 'text/markdown;charset=utf-8');
    showToast(`Downloaded ${state.dossier.filenameBase}.md`);
  };
  const exportJson = () => {
    downloadFile(
      `${state.dossier.filenameBase}.json`,
      JSON.stringify(state.dossier.json, null, 2),
      'application/json;charset=utf-8'
    );
    showToast(`Downloaded ${state.dossier.filenameBase}.json`);
  };

  document.getElementById('btn-op-download-md').addEventListener('click', exportMd);
  document.getElementById('btn-op-download-json').addEventListener('click', exportJson);
  document.getElementById('btn-download-md').addEventListener('click', exportMd);
  document.getElementById('btn-download-json').addEventListener('click', exportJson);

  document.getElementById('btn-copy-md').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.dossier.markdown);
      showToast('Copied Anti-Op Dossier Markdown to clipboard');
    } catch {
      showToast('Clipboard unavailable — use Download .md button');
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
    el.modalFeedback.textContent = 'Loaded full official GRID Series State JSON fixture. Edit or click Analyze & Recalculate.';
    el.modalFeedback.className = 'modal-feedback success';
  });

  document.getElementById('btn-download-sample-json').addEventListener('click', () => {
    downloadFile(
      `${state.presetId}-grid-series-state.json`,
      getSampleGridJson(state.presetId),
      'application/json;charset=utf-8'
    );
    showToast('Downloaded sample GRID Series State JSON');
  });

  document.getElementById('btn-apply-json').addEventListener('click', () => {
    const text = el.jsonTextarea.value.trim();
    if (!text) {
      el.modalFeedback.textContent = 'Paste a GRID JSON payload or click "Load Active Match GRID JSON" first.';
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

// Initialize Application
bindEvents();
loadPreset('c9-sen-ascent');
