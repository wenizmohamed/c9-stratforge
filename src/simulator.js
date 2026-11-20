/**
 * C9 StratForge - Deterministic Side-by-Side Series Delta & Win-Condition Simulator
 * Projects round win-rate delta, first-to-13 map scoreline, BO3 series win probability,
 * credit swing per half, eco-break rounds gained, and Operator suppression from GRID telemetry.
 */

const OP_FULL_COST = 4700;
const HALF_ROUNDS = 12;

export const SIMULATION_PRESETS = Object.freeze({
  baseline: Object.freeze({
    id: 'baseline',
    label: 'Default Baseline',
    description: 'Observed GRID match telemetry with zero counter-strat adjustments.',
    opDenialPct: 0,
    economyPressurePct: 0,
    protocols: Object.freeze({
      smokeOff: false,
      flashTrade: false,
      economyBreak: false
    })
  }),
  'anti-op-lock': Object.freeze({
    id: 'anti-op-lock',
    label: 'Full Anti-Op Lock',
    description: 'Neutralizes target sniper opening angles with smoke displacement, flash-trade swings, and post-death economy breaks.',
    opDenialPct: 80,
    economyPressurePct: 65,
    protocols: Object.freeze({
      smokeOff: true,
      flashTrade: true,
      economyBreak: true
    })
  }),
  'economy-choke': Object.freeze({
    id: 'economy-choke',
    label: 'Economy Choke',
    description: 'Maximizes post-loss force-buy punishment and bank denial to starve $4,700 full-buy Operator rounds.',
    opDenialPct: 55,
    economyPressurePct: 90,
    protocols: Object.freeze({
      smokeOff: false,
      flashTrade: true,
      economyBreak: true
    })
  })
});

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function nCr(n, r) {
  if (r < 0 || r > n) return 0;
  let k = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return result;
}

/**
 * Exact closed-form VALORANT First-to-13 + Overtime map win probability
 * with Bayesian shrinkage (0.72) calibrated for VCT pro-tier parity.
 */
export function computeMapWinProbability(roundWinRatePct) {
  const rawP = clamp(roundWinRatePct, 5, 95) / 100;
  const p = 0.5 + (rawP - 0.5) * 0.72;
  const q = 1 - p;

  let regWinProb = 0;
  for (let oppWins = 0; oppWins <= 11; oppWins++) {
    regWinProb += nCr(12 + oppWins, oppWins) * Math.pow(p, 13) * Math.pow(q, oppWins);
  }
  const reachOtProb = nCr(24, 12) * Math.pow(p, 12) * Math.pow(q, 12);
  const otWinProb = (p * p) / (p * p + q * q);

  return round1(clamp((regWinProb + reachOtProb * otWinProb) * 100, 1, 99));
}

/**
 * Exact Best-of-3 series win probability given single-map win probability (%).
 */
export function computeBo3SeriesWinProbability(mapWinProbPct) {
  const m = clamp(mapWinProbPct, 1, 99) / 100;
  return round1(clamp(m * m * (3 - 2 * m) * 100, 1, 99));
}

/**
 * Format signed dollar credit swing cleanly (e.g. "+$13,450", "$0", "-$1,200").
 */
export function formatSignedCredits(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n === 0) return '$0';
  const sign = n > 0 ? '+' : '-';
  return `${sign}$${Math.abs(n).toLocaleString('en-US')}`;
}

/**
 * Format signed percentage cleanly (e.g. "+11.4%", "0.0%").
 */
export function formatSignedDelta(value, suffix = '%') {
  const rounded = round1(Number(value) || 0);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}${suffix}`;
}

/**
 * Resolve normalized simulation controls from preset + explicit overrides.
 */
export function resolveSimulationControls(options = {}) {
  const presetKey =
    options.preset && SIMULATION_PRESETS[options.preset] ? options.preset : null;
  const base = presetKey ? SIMULATION_PRESETS[presetKey] : SIMULATION_PRESETS.baseline;

  const opDenialPct =
    options.opDenialPct !== undefined
      ? Math.round(clamp(options.opDenialPct, 0, 100))
      : base.opDenialPct;

  const economyPressurePct =
    options.economyPressurePct !== undefined
      ? Math.round(clamp(options.economyPressurePct, 0, 100))
      : base.economyPressurePct;

  const protoInput = options.protocols || {};
  const protocols = {
    smokeOff:
      protoInput.smokeOff !== undefined ? Boolean(protoInput.smokeOff) : base.protocols.smokeOff,
    flashTrade:
      protoInput.flashTrade !== undefined
        ? Boolean(protoInput.flashTrade)
        : base.protocols.flashTrade,
    economyBreak:
      protoInput.economyBreak !== undefined
        ? Boolean(protoInput.economyBreak)
        : base.protocols.economyBreak
  };

  // Detect whether current controls match one of the named presets
  let activePreset = 'custom';
  for (const candidate of Object.values(SIMULATION_PRESETS)) {
    if (
      candidate.opDenialPct === opDenialPct &&
      candidate.economyPressurePct === economyPressurePct &&
      candidate.protocols.smokeOff === protocols.smokeOff &&
      candidate.protocols.flashTrade === protocols.flashTrade &&
      candidate.protocols.economyBreak === protocols.economyBreak
    ) {
      activePreset = candidate.id;
      break;
    }
  }

  return {
    activePreset,
    scenarioLabel:
      activePreset !== 'custom' ? SIMULATION_PRESETS[activePreset].label : 'Custom Counter-Plan',
    opDenialPct,
    economyPressurePct,
    protocols
  };
}

function projectRegulationScore(winRatePct) {
  const p = clamp(winRatePct, 8, 92) / 100;
  if (p >= 0.5) {
    const opp = Math.min(12, Math.max(2, Math.round(13 * ((1 - p) / Math.max(0.15, p)))));
    return { our: 13, opp };
  }
  const our = Math.min(12, Math.max(2, Math.round(13 * (p / Math.max(0.15, 1 - p)))));
  return { our, opp: 13 };
}

/**
 * Deterministic Side-by-Side Series Delta & Win-Condition Simulator.
 */
export function simulateSeriesDelta(parsedMatch, operatorReport, utilityReport = null, options = {}) {
  if (!parsedMatch || !Array.isArray(parsedMatch.rounds) || parsedMatch.rounds.length === 0) {
    throw new Error('simulateSeriesDelta requires a parsed match with at least one round.');
  }

  const controls = resolveSimulationControls(options);
  const profiles = Array.isArray(operatorReport?.profiles) ? operatorReport.profiles : [];
  const target =
    profiles.find((p) => p.playerId === options.targetPlayerId) ||
    operatorReport?.primaryTarget ||
    profiles[0] ||
    null;

  const opponentTeam = target
    ? parsedMatch.teams.find((t) => t.id === target.teamId) || parsedMatch.teams[1]
    : parsedMatch.teams[1];
  const ourTeam =
    parsedMatch.teams.find((t) => t.id !== opponentTeam?.id) || parsedMatch.teams[0];

  const rounds = parsedMatch.rounds;
  const totalRounds = rounds.length;
  const baselineOurWins = rounds.filter((r) => r.winningTeamId === ourTeam.id).length;
  const baselineOppWins = totalRounds - baselineOurWins;
  const baselineWinRate = round1((baselineOurWins / totalRounds) * 100);

  const firstHalfRounds = rounds.filter((r) => r.roundNumber <= HALF_ROUNDS);
  const secondHalfRounds = rounds.filter((r) => r.roundNumber > HALF_ROUNDS);
  const baselineH1Our = firstHalfRounds.filter((r) => r.winningTeamId === ourTeam.id).length;
  const baselineH2Our = secondHalfRounds.filter((r) => r.winningTeamId === ourTeam.id).length;

  // Target Operator baseline impact
  const opRounds = target?.opRounds ?? 0;
  const opKills = target?.opKills ?? 0;
  const opDeaths = target?.opDeaths ?? 0;
  const opFirstBloods = target?.firstBloods ?? 0;
  const vulnScore = target?.tradeVulnerability?.score ?? 50;
  const glassCannonRate = target?.economy?.glassCannonRate ?? 0;

  // Count rounds won by opponent while target held an Operator
  const targetOpRoundNums = new Set();
  if (target) {
    for (const wp of parsedMatch.weaponPurchases || []) {
      if (wp.playerId === target.playerId && wp.isOperator) {
        targetOpRoundNums.add(wp.roundNumber);
      }
    }
    for (const k of parsedMatch.kills || []) {
      if (k.killerId === target.playerId && String(k.weapon || '').toLowerCase().includes('operator')) {
        targetOpRoundNums.add(k.roundNumber);
      }
    }
  }
  const opImpactRounds = rounds.filter(
    (r) => r.winningTeamId === opponentTeam.id && targetOpRoundNums.has(r.roundNumber)
  ).length;

  // Opponent economy baseline (incorporates src/economy.js output when provided)
  const econTeamSummary = options.economyReport?.games?.[0]?.teams?.find(
    (t) => String(t.teamId) === String(opponentTeam.id)
  );
  const oppPurchases = (parsedMatch.weaponPurchases || []).filter(
    (w) => w.teamId === opponentTeam.id
  );
  const oppAvgBank =
    oppPurchases.length > 0
      ? Math.round(
          oppPurchases.reduce((sum, w) => sum + (Number(w.creditsBeforeBuy) || 0), 0) /
            oppPurchases.length
        )
      : 4200;

  let observedPostLossRounds = 0;
  let observedForceRounds = 0;
  for (let i = 1; i < rounds.length; i++) {
    const prev = rounds[i - 1];
    const curr = rounds[i];
    if (curr.roundNumber === 13 || curr.roundNumber >= 25) continue;
    if (prev.winningTeamId === ourTeam.id) {
      observedPostLossRounds += 1;
      const oppRoundBuys = (curr.weaponPurchases || []).filter(
        (w) => w.teamId === opponentTeam.id
      );
      const avgRoundBank =
        oppRoundBuys.length > 0
          ? oppRoundBuys.reduce((s, w) => s + (Number(w.creditsBeforeBuy) || 0), 0) /
            oppRoundBuys.length
          : 4000;
      const hasGlassOp = oppRoundBuys.some((w) => w.isOperator && w.isGlassCannon);
      if (avgRoundBank < 3900 || hasGlassOp) {
        observedForceRounds += 1;
      }
    }
  }
  const observedForceRate =
    econTeamSummary && econTeamSummary.forceBuyRate !== null
      ? econTeamSummary.forceBuyRate
      : observedPostLossRounds > 0
        ? round1((observedForceRounds / observedPostLossRounds) * 100)
        : 0;

  // Baseline map & BO3 series win probabilities
  const baselineMapWinProb = computeMapWinProbability(baselineWinRate);
  const baselineSeriesWinProb = computeBo3SeriesWinProbability(baselineMapWinProb);

  // Check strict zero-adjustment baseline invariant
  const isZeroAdjustment =
    controls.opDenialPct === 0 &&
    controls.economyPressurePct === 0 &&
    !controls.protocols.smokeOff &&
    !controls.protocols.flashTrade &&
    !controls.protocols.economyBreak;

  const denialFactor = controls.opDenialPct / 100;
  const econFactor = controls.economyPressurePct / 100;
  const vulnMultiplier = 0.75 + (vulnScore / 100) * 0.55;
  const glassMultiplier = 0.85 + (glassCannonRate / 100) * 0.5;

  // Setup utility lift factor from highest-impact utility setup (if available)
  const topSetupDelta = utilityReport?.setupImpacts?.[0]?.winRateDelta ?? 10;
  const utilityContextWeight = clamp(0.85 + (Math.max(0, topSetupDelta) / 40) * 0.3, 0.85, 1.15);

  let effectiveOpDenial = 0;
  let opDuelsDenied = 0;
  let opFirstBloodsDenied = 0;
  let antiOpRoundsGained = 0;
  let ecoBreakRoundsGained = 0;
  let creditSwingPerHalf = 0;
  let roundsGained = 0;

  if (!isZeroAdjustment) {
    const protoDenialBoost =
      (controls.protocols.smokeOff ? 0.14 : 0) +
      (controls.protocols.flashTrade ? 0.12 * vulnMultiplier : 0);

    effectiveOpDenial = clamp(
      (denialFactor + protoDenialBoost) * (denialFactor > 0 ? 1 : 0.65),
      0,
      0.95
    );

    opDuelsDenied = round1(opKills * effectiveOpDenial);
    opFirstBloodsDenied = round1(opFirstBloods * effectiveOpDenial);

    const flippableOpRounds =
      opRounds > 0 ? Math.max(opImpactRounds, Math.round(opRounds * 0.45)) : 0;
    antiOpRoundsGained = round2(flippableOpRounds * effectiveOpDenial * 0.42 * vulnMultiplier);

    const effectiveEconPressure = clamp(
      econFactor +
        (controls.protocols.economyBreak ? 0.24 * glassMultiplier : 0) +
        effectiveOpDenial * 0.18,
      0,
      1.0
    );

    const horizonScale = totalRounds / 24;
    ecoBreakRoundsGained = round2(
      horizonScale *
        (1.85 * effectiveEconPressure * glassMultiplier +
          (controls.protocols.economyBreak ? 0.45 : 0) +
          antiOpRoundsGained * 0.28)
    );

    const halfScale = HALF_ROUNDS / totalRounds;
    const opCreditSwingHalf = opDuelsDenied * (OP_FULL_COST * 0.72) * halfScale;
    const econCreditSwingHalf =
      ecoBreakRoundsGained * 3900 * halfScale + effectiveEconPressure * 4200;
    creditSwingPerHalf = Math.round((opCreditSwingHalf + econCreditSwingHalf) / 50) * 50;

    const tacticalProtocolLift =
      ((controls.protocols.smokeOff ? 0.35 : 0) +
        (controls.protocols.flashTrade ? 0.4 * vulnMultiplier : 0) +
        (controls.protocols.economyBreak ? 0.25 : 0)) *
      utilityContextWeight;

    const rawGain = antiOpRoundsGained + ecoBreakRoundsGained * 0.68 + tacticalProtocolLift;
    const maxAdditional = Math.max(
      0,
      Math.min(baselineOppWins, round2(0.92 * totalRounds - baselineOurWins))
    );
    roundsGained = round2(Math.min(rawGain, maxAdditional));
  }

  const projectedOurWinsExact = round1(baselineOurWins + roundsGained);
  const projectedOppWinsExact = round1(Math.max(0, totalRounds - projectedOurWinsExact));
  const projectedWinRate = round1((projectedOurWinsExact / totalRounds) * 100);
  const winRateDelta = round1(projectedWinRate - baselineWinRate);

  const projectedScore = isZeroAdjustment
    ? { our: baselineOurWins, opp: baselineOppWins }
    : projectRegulationScore(projectedWinRate);

  const projectedHorizonOur = Math.min(totalRounds, Math.round(projectedOurWinsExact));
  const projectedHorizonOpp = Math.max(0, totalRounds - projectedHorizonOur);

  const projectedMapWinProb = isZeroAdjustment
    ? baselineMapWinProb
    : computeMapWinProbability(projectedWinRate);
  const projectedSeriesWinProb = isZeroAdjustment
    ? baselineSeriesWinProb
    : computeBo3SeriesWinProbability(projectedMapWinProb);
  const seriesWinProbDelta = round1(projectedSeriesWinProb - baselineSeriesWinProb);
  const mapWinProbDelta = round1(projectedMapWinProb - baselineMapWinProb);

  // Simulated Op metrics
  const projectedOpKills = round1(Math.max(0, opKills - opDuelsDenied));
  const projectedOpFirstBloods = round1(Math.max(0, opFirstBloods - opFirstBloodsDenied));
  const projectedOpKd = round2(
    projectedOpKills / Math.max(1, opDeaths + Math.round(opDuelsDenied * 0.45))
  );

  // Half-by-half split projection
  const h1Gain = round1(roundsGained * 0.52);
  const h2Gain = round1(roundsGained - h1Gain);
  const projectedH1Our = round1(Math.min(firstHalfRounds.length, baselineH1Our + h1Gain));
  const projectedH2Our = round1(Math.min(secondHalfRounds.length, baselineH2Our + h2Gain));

  const activeProtocols = [];
  if (controls.protocols.smokeOff) activeProtocols.push('Smoke-Off Sightlines');
  if (controls.protocols.flashTrade) activeProtocols.push('Flash-Trade Swing');
  if (controls.protocols.economyBreak) activeProtocols.push('Economy Break Chain');

  const targetLabel = target ? `${target.playerName} (${target.agent})` : opponentTeam.name;
  const verdict = isZeroAdjustment
    ? `Baseline lock: observing ${ourTeam.tag} ${baselineOurWins}-${baselineOppWins} ${opponentTeam.tag} (${baselineWinRate}% WR) with zero counter-strat intervention.`
    : `${controls.scenarioLabel} projects ${ourTeam.tag} ${projectedScore.our}-${projectedScore.opp} ${opponentTeam.tag} (${formatSignedDelta(winRateDelta, '% WR')}), neutralizing ${opDuelsDenied} ${targetLabel} Op picks and generating ${formatSignedCredits(creditSwingPerHalf)}/half across +${ecoBreakRoundsGained.toFixed(1)} eco-break rounds.`;

  return {
    match: {
      mapName: parsedMatch.meta.mapName,
      totalRounds,
      ourTeam: { id: ourTeam.id, name: ourTeam.name, tag: ourTeam.tag },
      opponentTeam: { id: opponentTeam.id, name: opponentTeam.name, tag: opponentTeam.tag },
      targetSniper: target
        ? {
            playerId: target.playerId,
            playerName: target.playerName,
            agent: target.agent,
            opRounds,
            vulnScore,
            glassCannonRate
          }
        : null
    },
    controls: {
      ...controls,
      activeProtocols
    },
    baseline: {
      ourWins: baselineOurWins,
      oppWins: baselineOppWins,
      scoreline: `${baselineOurWins} - ${baselineOppWins}`,
      winRate: baselineWinRate,
      mapWinProb: baselineMapWinProb,
      seriesWinProb: baselineSeriesWinProb,
      opKills,
      opDeaths,
      opKd: target?.opKd ?? 0,
      opFirstBloods,
      opImpactRounds,
      oppAvgBank,
      observedForceRate,
      halfSplit: {
        h1Our: baselineH1Our,
        h1Total: firstHalfRounds.length,
        h2Our: baselineH2Our,
        h2Total: secondHalfRounds.length
      }
    },
    simulated: {
      projectedOurWinsExact,
      projectedOppWinsExact,
      horizonScoreline: `${projectedHorizonOur} - ${projectedHorizonOpp}`,
      regulationScore: projectedScore,
      regulationScoreline: `${projectedScore.our} - ${projectedScore.opp}`,
      winRate: projectedWinRate,
      mapWinProb: projectedMapWinProb,
      seriesWinProb: projectedSeriesWinProb,
      effectiveOpDenialPct: round1(effectiveOpDenial * 100),
      projectedOpKills,
      projectedOpFirstBloods,
      projectedOpKd,
      halfSplit: {
        h1Our: projectedH1Our,
        h1Total: firstHalfRounds.length,
        h2Our: projectedH2Our,
        h2Total: secondHalfRounds.length
      }
    },
    deltas: {
      roundsGained,
      antiOpRoundsGained,
      ecoBreakRoundsGained,
      winRateDelta,
      winRateDeltaLabel: formatSignedDelta(winRateDelta, '% WR'),
      mapWinProbDelta,
      seriesWinProbDelta,
      seriesWinProbDeltaLabel: formatSignedDelta(seriesWinProbDelta, '%'),
      creditSwingPerHalf,
      creditSwingPerHalfLabel: `${formatSignedCredits(creditSwingPerHalf)} / half`,
      creditSwingFullMatch: creditSwingPerHalf * 2,
      opDuelsDenied,
      opFirstBloodsDenied
    },
    verdict
  };
}
