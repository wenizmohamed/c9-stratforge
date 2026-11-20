import test from 'node:test';
import assert from 'node:assert/strict';

import { PRESET_METADATA, getPreset, getRawPresetJson, parseGridSeriesState } from '../src/gridParser.js';
import { analyzeOperators, analyzeUtility, generateAntiOpDossier } from '../src/analytics.js';
import { analyzeRoundEconomy } from '../src/economy.js';
import {
  SIMULATION_PRESETS,
  computeBo3SeriesWinProbability,
  computeMapWinProbability,
  formatSignedCredits,
  formatSignedDelta,
  resolveSimulationControls,
  simulateSeriesDelta
} from '../src/simulator.js';

test('simulator.js Default Baseline preset produces exact zero delta across all 3 pro presets', () => {
  for (const preset of PRESET_METADATA) {
    const match = getPreset(preset.id);
    const util = analyzeUtility(match);
    const ops = analyzeOperators(match);
    const sim = simulateSeriesDelta(match, ops, util, { preset: 'baseline' });

    assert.equal(sim.controls.activePreset, 'baseline');
    assert.equal(sim.controls.scenarioLabel, 'Default Baseline');
    assert.equal(sim.simulated.winRate, sim.baseline.winRate);
    assert.equal(sim.simulated.regulationScoreline, sim.baseline.scoreline);
    assert.equal(sim.simulated.seriesWinProb, sim.baseline.seriesWinProb);
    assert.equal(sim.deltas.winRateDelta, 0);
    assert.equal(sim.deltas.roundsGained, 0);
    assert.equal(sim.deltas.creditSwingPerHalf, 0);
    assert.equal(sim.deltas.ecoBreakRoundsGained, 0);
    assert.equal(sim.deltas.opDuelsDenied, 0);
    assert.equal(sim.deltas.seriesWinProbDelta, 0);
  }
});

test('simulator.js Full Anti-Op Lock preset lifts projected win rate, series prob, Op denial, and credit swing', () => {
  const match = getPreset('c9-sen-ascent');
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);

  const baseline = simulateSeriesDelta(match, ops, util, { preset: 'baseline' });
  const antiOp = simulateSeriesDelta(match, ops, util, { preset: 'anti-op-lock' });

  assert.equal(antiOp.controls.activePreset, 'anti-op-lock');
  assert.equal(antiOp.controls.activeProtocols.length, 3);
  assert.ok(antiOp.simulated.winRate > baseline.baseline.winRate);
  assert.ok(antiOp.deltas.winRateDelta > 0);
  assert.ok(antiOp.deltas.roundsGained > 0);
  assert.ok(antiOp.deltas.opDuelsDenied > 0);
  assert.ok(antiOp.deltas.ecoBreakRoundsGained > 0);
  assert.ok(antiOp.deltas.creditSwingPerHalf > 0);
  assert.equal(antiOp.deltas.creditSwingPerHalf % 50, 0);
  assert.ok(antiOp.simulated.seriesWinProb > baseline.baseline.seriesWinProb);
  assert.ok(antiOp.simulated.projectedOpKills < baseline.baseline.opKills);
});

test('simulator.js Economy Choke preset drives high economy pressure and credit swing per half', () => {
  const match = getPreset('c9w-g2g-haven');
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);

  const choke = simulateSeriesDelta(match, ops, util, { preset: 'economy-choke' });
  assert.equal(choke.controls.activePreset, 'economy-choke');
  assert.equal(choke.controls.economyPressurePct, 90);
  assert.equal(choke.controls.protocols.smokeOff, false);
  assert.equal(choke.controls.protocols.flashTrade, true);
  assert.equal(choke.controls.protocols.economyBreak, true);
  assert.ok(choke.deltas.creditSwingPerHalf >= 5000);
  assert.ok(choke.deltas.ecoBreakRoundsGained >= 1.0);
  assert.ok(choke.deltas.winRateDelta > 0);
});

test('simulator.js is 100% deterministic across repeated invocations', () => {
  const match = getPreset('vct-americas-split');
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);
  const opts = {
    opDenialPct: 70,
    economyPressurePct: 60,
    protocols: { smokeOff: true, flashTrade: false, economyBreak: true }
  };

  const runA = simulateSeriesDelta(match, ops, util, opts);
  const runB = simulateSeriesDelta(match, ops, util, opts);
  assert.deepEqual(runA, runB);
});

test('simulator.js Op denial slider monotonically increases Op suppression and round win rate', () => {
  const match = getPreset('c9-sen-ascent');
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);

  const steps = [0, 25, 50, 75, 100].map((opDenialPct) =>
    simulateSeriesDelta(match, ops, util, {
      opDenialPct,
      economyPressurePct: 0,
      protocols: { smokeOff: false, flashTrade: false, economyBreak: false }
    })
  );

  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].deltas.opDuelsDenied >= steps[i - 1].deltas.opDuelsDenied);
    assert.ok(steps[i].deltas.antiOpRoundsGained >= steps[i - 1].deltas.antiOpRoundsGained);
    assert.ok(steps[i].simulated.winRate >= steps[i - 1].simulated.winRate);
  }
  assert.ok(steps[4].simulated.winRate > steps[0].simulated.winRate);
});

test('simulator.js economy pressure slider monotonically increases eco-breaks and credit swing', () => {
  const match = getPreset('c9-sen-ascent');
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);

  const steps = [0, 30, 60, 100].map((economyPressurePct) =>
    simulateSeriesDelta(match, ops, util, {
      opDenialPct: 0,
      economyPressurePct,
      protocols: { smokeOff: false, flashTrade: false, economyBreak: false }
    })
  );

  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].deltas.ecoBreakRoundsGained > steps[i - 1].deltas.ecoBreakRoundsGained);
    assert.ok(steps[i].deltas.creditSwingPerHalf > steps[i - 1].deltas.creditSwingPerHalf);
    assert.ok(steps[i].simulated.winRate >= steps[i - 1].simulated.winRate);
  }
});

test('simulator.js individual anti-Op protocol toggles each produce independent lift over baseline', () => {
  const match = getPreset('c9-sen-ascent');
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);

  const base = simulateSeriesDelta(match, ops, util, { preset: 'baseline' });
  const smokeOnly = simulateSeriesDelta(match, ops, util, {
    protocols: { smokeOff: true, flashTrade: false, economyBreak: false }
  });
  const flashOnly = simulateSeriesDelta(match, ops, util, {
    protocols: { smokeOff: false, flashTrade: true, economyBreak: false }
  });
  const econOnly = simulateSeriesDelta(match, ops, util, {
    protocols: { smokeOff: false, flashTrade: false, economyBreak: true }
  });
  const allThree = simulateSeriesDelta(match, ops, util, {
    protocols: { smokeOff: true, flashTrade: true, economyBreak: true }
  });

  for (const single of [smokeOnly, flashOnly, econOnly]) {
    assert.ok(single.deltas.winRateDelta > base.deltas.winRateDelta);
    assert.ok(single.deltas.creditSwingPerHalf > 0);
    assert.equal(single.controls.activeProtocols.length, 1);
  }
  assert.ok(allThree.deltas.winRateDelta > smokeOnly.deltas.winRateDelta);
  assert.ok(allThree.deltas.winRateDelta > flashOnly.deltas.winRateDelta);
  assert.ok(allThree.deltas.winRateDelta > econOnly.deltas.winRateDelta);
});

test('simulator.js closed-form map & BO3 series win probabilities obey mathematical invariants', () => {
  assert.equal(computeMapWinProbability(50), 50);
  assert.equal(computeBo3SeriesWinProbability(50), 50);

  // Symmetry: P(50 + d) + P(50 - d) == 100
  const highMap = computeMapWinProbability(62);
  const lowMap = computeMapWinProbability(38);
  assert.ok(Math.abs(highMap + lowMap - 100) <= 0.2);

  // Monotonicity & BO3 amplification above 50%
  assert.ok(highMap > 50);
  const highBo3 = computeBo3SeriesWinProbability(highMap);
  assert.ok(highBo3 > highMap, 'BO3 should amplify single-map edge >50%');
  assert.ok(highBo3 <= 99);

  // Clamping at extremes
  assert.ok(computeMapWinProbability(0) >= 1 && computeMapWinProbability(100) <= 99);
  assert.ok(computeBo3SeriesWinProbability(0) >= 1 && computeBo3SeriesWinProbability(100) <= 99);
});

test('simulator.js integrates cleanly with src/economy.js output without mutating inputs', () => {
  const raw = getRawPresetJson('c9-sen-ascent');
  const match = parseGridSeriesState(raw);
  const economyReport = analyzeRoundEconomy(raw);
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);

  const snapshot = JSON.stringify(economyReport);
  const sim = simulateSeriesDelta(match, ops, util, {
    preset: 'anti-op-lock',
    economyReport
  });

  assert.equal(JSON.stringify(economyReport), snapshot);
  assert.ok(sim.baseline.oppAvgBank > 0);
  assert.ok(typeof sim.baseline.observedForceRate === 'number');
  assert.ok(sim.simulated.halfSplit.h1Our >= sim.baseline.halfSplit.h1Our);
});

test('simulator.js handles no-Operator custom matches, out-of-range sliders, and rejects invalid matches', () => {
  const noOpMatch = parseGridSeriesState({
    data: {
      seriesState: {
        id: 'no-op-scrim',
        games: [
          {
            id: 'g1',
            map: { name: 'Ascent' },
            teams: [
              { id: 'c9', name: 'Cloud9', tag: 'C9', players: [{ id: 'p1', name: 'OXY', character: { name: 'Jett' } }] },
              { id: 'opp', name: 'Rival', tag: 'RVL', players: [{ id: 'p2', name: 'Ace', character: { name: 'Omen' } }] }
            ],
            rounds: [
              { sequenceNumber: 1, attackingTeamId: 'c9', defendingTeamId: 'opp', winningTeamId: 'c9', weaponPurchases: [], utilityEvents: [], kills: [] },
              { sequenceNumber: 2, attackingTeamId: 'c9', defendingTeamId: 'opp', winningTeamId: 'opp', weaponPurchases: [], utilityEvents: [], kills: [] }
            ]
          }
        ]
      }
    }
  });

  const ops = analyzeOperators(noOpMatch);
  const sim = simulateSeriesDelta(noOpMatch, ops, null, {
    opDenialPct: 250,
    economyPressurePct: -15,
    protocols: { smokeOff: true, flashTrade: false, economyBreak: true }
  });

  assert.equal(sim.controls.opDenialPct, 100);
  assert.equal(sim.controls.economyPressurePct, 0);
  assert.equal(sim.baseline.opKills, 0);
  assert.equal(sim.deltas.opDuelsDenied, 0);
  assert.ok(sim.simulated.winRate >= sim.baseline.winRate);

  assert.throws(() => simulateSeriesDelta(null, ops), /at least one round/);
  assert.throws(() => simulateSeriesDelta({ rounds: [] }, ops), /at least one round/);
});

test('simulator.js integrates with generateAntiOpDossier (.json & .md) with zero em/en-dashes in verdict', () => {
  const match = getPreset('c9-sen-ascent');
  const util = analyzeUtility(match);
  const ops = analyzeOperators(match);
  const sim = simulateSeriesDelta(match, ops, util, {
    preset: 'anti-op-lock',
    targetPlayerId: ops.primaryTarget.playerId
  });

  assert.equal(sim.verdict.includes('\u2014'), false);
  assert.equal(sim.verdict.includes('\u2013'), false);

  const dossier = generateAntiOpDossier(match, util, ops, ops.primaryTarget.playerId, sim);
  assert.ok(dossier.json.seriesDeltaSimulation);
  assert.equal(dossier.json.seriesDeltaSimulation.scenario, 'Full Anti-Op Lock');
  assert.equal(
    dossier.json.seriesDeltaSimulation.deltas.creditSwingPerHalf,
    sim.deltas.creditSwingPerHalf
  );
  assert.match(dossier.markdown, /## 5\. Series Delta & Win-Condition Simulation \(Full Anti-Op Lock\)/);
  assert.match(dossier.markdown, /BO3 Series Win Prob/);
  assert.match(dossier.markdown, /Economy Swing \/ Half/);
});

test('simulator.js formatting helpers and preset detection work accurately', () => {
  assert.equal(formatSignedCredits(0), '$0');
  assert.equal(formatSignedCredits(14250), '+$14,250');
  assert.equal(formatSignedCredits(-3200), '-$3,200');
  assert.equal(formatSignedDelta(12.34, '% WR'), '+12.3% WR');
  assert.equal(formatSignedDelta(0, '%'), '0.0%');
  assert.equal(formatSignedDelta(-4.5, '%'), '-4.5%');

  assert.equal(Object.keys(SIMULATION_PRESETS).length, 3);
  const custom = resolveSimulationControls({ opDenialPct: 45, economyPressurePct: 30 });
  assert.equal(custom.activePreset, 'custom');
  assert.equal(custom.scenarioLabel, 'Custom Counter-Plan');

  const detected = resolveSimulationControls({
    opDenialPct: 80,
    economyPressurePct: 65,
    protocols: { smokeOff: true, flashTrade: true, economyBreak: true }
  });
  assert.equal(detected.activePreset, 'anti-op-lock');
});
