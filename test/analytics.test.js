import test from 'node:test';
import assert from 'node:assert/strict';

import { getMapSpec, normalizeCoordinate, resolveCallout } from '../src/maps.js';
import {
  PRESET_METADATA,
  classifyAbility,
  getPreset,
  getSampleGridJson,
  parseGridSeriesState
} from '../src/gridParser.js';
import {
  analyzeOperators,
  analyzeUtility,
  clusterUtilityEvents,
  formatClock,
  generateAntiOpDossier
} from '../src/analytics.js';

test('maps.js resolves Ascent, Haven, Split specs and normalizes raw world coordinates', () => {
  for (const mapName of ['Ascent', 'Haven', 'Split']) {
    const spec = getMapSpec(mapName);
    assert.equal(spec.id, mapName);
    assert.ok(spec.zones.length >= 12);
    assert.ok(spec.floors.length >= 8);
  }
  assert.deepEqual(getMapSpec('Haven').sites, ['A', 'B', 'C']);

  // Already normalized stays in 0..1000
  assert.deepEqual(normalizeCoordinate('Ascent', { x: 775, y: 345 }), { x: 775, y: 345 });

  // Raw VALORANT world coordinates map cleanly into 25..975
  const projected = normalizeCoordinate('Ascent', { x: 1850, y: -2100 });
  assert.ok(projected.x >= 25 && projected.x <= 975);
  assert.ok(projected.y >= 25 && projected.y <= 975);

  const callout = resolveCallout('Ascent', 775, 345);
  assert.equal(callout.name, 'A Site');
  assert.equal(callout.site, 'A');
});

test('gridParser.js classifies VALORANT abilities accurately across categories', () => {
  assert.equal(classifyAbility('Dark Cover'), 'smoke');
  assert.equal(classifyAbility('Poison Cloud'), 'smoke');
  assert.equal(classifyAbility('FLASH/drive'), 'flash');
  assert.equal(classifyAbility('Guiding Light'), 'flash');
  assert.equal(classifyAbility('Recon Bolt'), 'recon');
  assert.equal(classifyAbility('ZERO/point'), 'recon');
  assert.equal(classifyAbility('Nanoswarm'), 'molotov');
  assert.equal(classifyAbility('Snake Bite'), 'molotov');
});

test('gridParser.js loads all 3 pro scouting presets via official GRID Series State schema', () => {
  assert.equal(PRESET_METADATA.length, 3);
  for (const preset of PRESET_METADATA) {
    const match = getPreset(preset.id);
    assert.equal(match.meta.mapName, preset.mapName);
    assert.equal(match.teams.length, 2);
    assert.equal(match.players.length, 10);
    assert.ok(match.rounds.length >= 20, `${preset.id} should have >=20 rounds`);
    assert.ok(match.utilityEvents.length >= 40, `${preset.id} should have >=40 utility casts`);
    assert.ok(match.weaponPurchases.some((w) => w.isOperator), `${preset.id} should contain Operator buys`);
  }
});

test('gridParser.js supports raw GRID JSON roundtrip and rejects malformed payloads', () => {
  const rawJson = getSampleGridJson('c9w-g2g-haven');
  const parsed = parseGridSeriesState(rawJson);
  assert.equal(parsed.meta.mapName, 'Haven');
  assert.equal(parsed.teams[0].tag, 'C9W');
  assert.equal(parsed.teams[1].tag, 'G2G');

  // Custom raw world-coordinate GRID import test
  const customPayload = {
    data: {
      seriesState: {
        id: 'custom-test-001',
        tournament: { name: 'VCT Custom Scrim' },
        games: [
          {
            id: 'g1',
            map: { name: 'Split' },
            teams: [
              { id: 't1', name: 'Cloud9', tag: 'C9', players: [{ id: 'p1', name: 'OXY', character: { name: 'Jett' } }] },
              { id: 't2', name: 'NRG', tag: 'NRG', players: [{ id: 'p2', name: 's0m', character: { name: 'Omen' } }] }
            ],
            rounds: [
              {
                sequenceNumber: 1,
                attackingTeamId: 't1',
                defendingTeamId: 't2',
                winningTeamId: 't1',
                weaponPurchases: [
                  { playerId: 'p1', teamId: 't1', weapon: 'Operator', creditsBeforeBuy: 4400, armor: 'None' }
                ],
                utilityEvents: [
                  { playerId: 'p2', teamId: 't2', abilityName: 'Dark Cover', timestampSec: 18, coordinates: { x: 1200, y: -800 } }
                ],
                kills: [
                  {
                    killerId: 'p1',
                    victimId: 'p2',
                    weapon: 'Operator',
                    timestampSec: 14,
                    firstBlood: true,
                    attackerPosition: { x: 495, y: 650 },
                    victimPosition: { x: 410, y: 385 }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  };

  const customParsed = parseGridSeriesState(JSON.stringify(customPayload));
  assert.equal(customParsed.meta.mapName, 'Split');
  assert.equal(customParsed.utilityEvents.length, 1);
  assert.equal(customParsed.utilityEvents[0].category, 'smoke');
  assert.equal(customParsed.weaponPurchases[0].isGlassCannon, true);

  assert.throws(() => parseGridSeriesState('{bad json'), /Invalid JSON syntax/);
  assert.throws(() => parseGridSeriesState({ data: { seriesState: {} } }), /missing `games`/);
  assert.throws(
    () =>
      parseGridSeriesState({
        data: { seriesState: { games: [{ map: { name: 'Ascent' }, teams: [{ id: 'a' }, { id: 'b' }], rounds: [] }] } }
      }),
    /zero rounds/
  );
});

test('analytics.js computes deterministic utility clusters, phase timing, win-rate delta & counter-utility', () => {
  const match = getPreset('c9-sen-ascent');
  const reportA = analyzeUtility(match);
  const reportB = analyzeUtility(match);

  // Determinism check
  assert.deepEqual(reportA.clusters.map((c) => [c.id, c.x, c.y, c.count]), reportB.clusters.map((c) => [c.id, c.x, c.y, c.count]));
  assert.ok(reportA.clusters.length >= 4);
  assert.ok(reportA.heatmapZones.length >= 4);
  assert.equal(reportA.phaseTiming.length, 4);

  const phaseTotal = reportA.phaseTiming.reduce((s, p) => s + p.count, 0);
  assert.equal(phaseTotal, reportA.totalEvents);

  // Win-rate delta & counter recommendations
  assert.ok(reportA.setupImpacts.length >= 3);
  for (const setup of reportA.setupImpacts) {
    assert.match(setup.winRateDeltaLabel, /^[+-]\d+\.\d% WR$/);
  }
  assert.ok(reportA.counterRecommendations.length >= 2);
  for (const rec of reportA.counterRecommendations) {
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM'].includes(rec.priority));
    assert.ok(rec.counterAbility.length > 5);
    assert.ok(rec.reasoning.length > 20);
  }

  // Filtering check (Attack smokes only, <= 50s)
  const filtered = analyzeUtility(match, {
    side: 'attack',
    categories: ['smoke'],
    minTime: 0,
    maxTime: 50
  });
  assert.ok(filtered.events.every((e) => e.side === 'attack' && e.category === 'smoke' && e.timestampSec <= 50));

  // Direct clustering check on tight points
  const tightClusters = clusterUtilityEvents([
    { id: '1', x: 100, y: 100, category: 'smoke', abilityName: 'Dark Cover', callout: 'A Site', site: 'A', timestampSec: 20, roundWon: true },
    { id: '2', x: 112, y: 108, category: 'smoke', abilityName: 'Dark Cover', callout: 'A Site', site: 'A', timestampSec: 24, roundWon: false },
    { id: '3', x: 750, y: 750, category: 'flash', abilityName: 'FLASH/drive', callout: 'B Main', site: 'B', timestampSec: 40, roundWon: true }
  ], 60);
  assert.equal(tightClusters.length, 2);
  assert.equal(tightClusters[0].count, 2);
  assert.equal(tightClusters[0].winRate, 50);
});

test('analytics.js Operator profiler computes economy thresholds, peek histogram, anchor/roam split & vulnerability', () => {
  const match = getPreset('c9-sen-ascent');
  const opReport = analyzeOperators(match);

  assert.ok(opReport.profiles.length >= 2, 'Should profile both primary Operators (OXY & zekken)');
  assert.ok(opReport.sightlines.length >= 6);

  for (const prof of opReport.profiles) {
    assert.ok(prof.opRounds >= 3);
    assert.equal(prof.economy.fullBuyOps + prof.economy.glassCannonOps, prof.economy.totalOpBuys);
    assert.equal(prof.peekHistogram.length, 6);

    const splitSum = prof.roleSplit.anchorPct + prof.roleSplit.roamPct + prof.roleSplit.retakePct;
    assert.ok(Math.abs(splitSum - 100) <= 0.5, `Role split should sum to ~100%, got ${splitSum}`);

    assert.ok(prof.tradeVulnerability.score >= 0 && prof.tradeVulnerability.score <= 100);
    assert.ok(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(prof.tradeVulnerability.tier));
    assert.ok(prof.angleFrequency.length >= 2);
  }
});

test('analytics.js generates complete Anti-Op Counter-Strat Dossier (Markdown + JSON)', () => {
  const match = getPreset('vct-americas-split');
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);
  const dossier = generateAntiOpDossier(match, util, ops, ops.primaryTarget.playerId);

  assert.equal(dossier.json.schema, 'c9-stratforge-anti-op-dossier-v1');
  assert.equal(dossier.json.match.mapName, 'Split');
  assert.ok(dossier.json.targetSniper.playerName.length > 0);
  assert.equal(dossier.json.antiOpProtocols.length, 3);
  assert.match(dossier.markdown, /# C9 StratForge — Anti-Operator & Tactical Counter-Strat Dossier/);
  assert.match(dossier.markdown, /Trade-Death Vulnerability/);
  assert.match(dossier.markdown, /Automatic Counter-Utility Recommendations/);
  assert.equal(formatClock(75), '1:15');
});
