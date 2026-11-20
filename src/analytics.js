/**
 * C9 StratForge — Deterministic VALORANT Tactical Analytics Engine
 * (a) Utility Placement, Clustering, Win-Rate Delta & Counter-Utility Engine
 * (b) Operator Tendency, Economy Thresholds, Peek Histogram & Vulnerability Profiler
 * (c) Anti-Op Counter-Strat Dossier Generator (Markdown + JSON)
 */

import { getMapSpec } from './maps.js';
import { ABILITY_CATEGORIES } from './gridParser.js';

export const ROUND_PHASES = [
  { id: 'early', label: '0:00-0:25', title: 'Early Contact', min: 0, max: 25 },
  { id: 'mid', label: '0:25-0:55', title: 'Mid-Round Control', min: 25, max: 55 },
  { id: 'execute', label: '0:55-1:15', title: 'Execute & Hit', min: 55, max: 75 },
  { id: 'postplant', label: '1:15-1:40', title: 'Post-Plant', min: 75, max: 100 }
];

export const PEEK_BUCKETS = [
  { id: '0-10', label: '0:00-0:10', min: 0, max: 10 },
  { id: '10-20', label: '0:10-0:20', min: 10, max: 20 },
  { id: '20-30', label: '0:20-0:30', min: 20, max: 30 },
  { id: '30-40', label: '0:30-0:40', min: 30, max: 40 },
  { id: '40-50', label: '0:40-0:50', min: 40, max: 50 },
  { id: '50+', label: '0:50+', min: 50, max: 101 }
];

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export function formatSignedPct(value) {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded >= 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
}

/**
 * Deterministic spatial clustering (Euclidean centroid radius = 64 map units).
 */
export function clusterUtilityEvents(events, radius = 64) {
  const clusters = [];
  const sorted = [...events].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));

  for (const ev of sorted) {
    let bestCluster = null;
    let bestDist = Infinity;
    for (const c of clusters) {
      const dist = Math.hypot(ev.x - c.x, ev.y - c.y);
      if (dist <= radius && dist < bestDist) {
        bestDist = dist;
        bestCluster = c;
      }
    }

    if (bestCluster) {
      bestCluster.events.push(ev);
      const n = bestCluster.events.length;
      bestCluster.x = Math.round(bestCluster.events.reduce((s, e) => s + e.x, 0) / n);
      bestCluster.y = Math.round(bestCluster.events.reduce((s, e) => s + e.y, 0) / n);
    } else {
      clusters.push({
        id: `cluster-${clusters.length + 1}`,
        x: ev.x,
        y: ev.y,
        events: [ev]
      });
    }
  }

  const maxCount = Math.max(1, ...clusters.map((c) => c.events.length));

  return clusters
    .map((c) => {
      const catCounts = { smoke: 0, flash: 0, recon: 0, molotov: 0 };
      const abilityCounts = new Map();
      const calloutCounts = new Map();
      let wins = 0;
      let timeSum = 0;

      for (const e of c.events) {
        catCounts[e.category] = (catCounts[e.category] || 0) + 1;
        abilityCounts.set(e.abilityName, (abilityCounts.get(e.abilityName) || 0) + 1);
        calloutCounts.set(e.callout, (calloutCounts.get(e.callout) || 0) + 1);
        if (e.roundWon) wins += 1;
        timeSum += e.timestampSec;
      }

      const dominantCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];
      const dominantAbility = [...abilityCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const callout = [...calloutCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const count = c.events.length;
      const winRate = Math.round((wins / count) * 1000) / 10;
      const avgTimestampSec = Math.round((timeSum / count) * 10) / 10;

      return {
        id: c.id,
        x: c.x,
        y: c.y,
        count,
        radius: Math.round(24 + (count / maxCount) * 34),
        density: Math.round((count / maxCount) * 100),
        dominantCategory,
        dominantAbility,
        color: ABILITY_CATEGORIES[dominantCategory]?.color || '#00AEEF',
        callout,
        site: c.events[0].site,
        avgTimestampSec,
        avgClock: formatClock(avgTimestampSec),
        winRate,
        categoryBreakdown: catCounts,
        events: c.events
      };
    })
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function buildCounterRecommendation(setup, topCluster) {
  const cat = topCluster?.dominantCategory || setup.dominantCategory || 'smoke';
  const callout = topCluster?.callout || setup.primaryCallout;
  const startSec = Math.max(0, Math.round(setup.avgTimestampSec - 6));
  const endSec = Math.min(100, Math.round(setup.avgTimestampSec + 8));
  const windowLabel = `${formatClock(startSec)}-${formatClock(endSec)}`;

  const counterMap = {
    recon: {
      counterAbility: 'Pre-aim Break + Counter-Smoke / KAY/O ZERO/point',
      agentSuggestion: 'KAY/O or Omen',
      reasoning: `Enemy deploys info utility into ${callout} at ~${formatClock(setup.avgTimestampSec)} (${setup.winRateDeltaLabel}). Assign an anchor to pre-break the dart/drone and throw a counter-smoke to deny follow-up spam.`
    },
    smoke: {
      counterAbility: 'Anti-Flash Pop + Molotov Choke Delay',
      agentSuggestion: 'Killjoy / Viper + Flash Initiator',
      reasoning: `Recurring smoke wall at ${callout} drives ${setup.winRate.toFixed(1)}% round conversion. Drop a stall molotov behind the smoke lip at ${windowLabel} and counter-flash through the choke before entry duelist dashes.`
    },
    flash: {
      counterAbility: 'Anti-Flash Jiggle + Counter-Paranoia / Breach Stun',
      agentSuggestion: 'Omen or Breach',
      reasoning: `High-tempo flash sequence hits ${callout} around ${formatClock(setup.avgTimestampSec)}. Hold anti-flash off-angle, turn initial blind, and immediately counter-blind the choke to catch swingers mid-air.`
    },
    molotov: {
      counterAbility: 'Early Site Reclear + Smoke-Tap Bait / Utility Drain',
      agentSuggestion: 'Sova / Skye + Controller',
      reasoning: `Post-plant / choke molotov lineups concentrate on ${callout} (${setup.winRateDeltaLabel}). Clear lineup positions early with recon or double-swing the molotov thrower before ${windowLabel}.`
    }
  };

  const template = counterMap[cat] || counterMap.smoke;
  const priority =
    setup.winRateDelta >= 12 ? 'CRITICAL' : setup.winRateDelta >= 5 ? 'HIGH' : 'MEDIUM';

  return {
    id: `counter-${setup.setupId}`,
    priority,
    targetSetup: setup.setupName,
    side: setup.side,
    callout,
    window: windowLabel,
    winRateDelta: setup.winRateDelta,
    winRateDeltaLabel: setup.winRateDeltaLabel,
    counterAbility: template.counterAbility,
    agentSuggestion: template.agentSuggestion,
    reasoning: template.reasoning,
    expectedImpact: `Projects -${Math.max(6, Math.min(22, Math.round(Math.abs(setup.winRateDelta) * 0.72 + 5)))}% enemy round conversion`
  };
}

/**
 * (a) Utility Placement & Ability Analysis Engine
 */
export function analyzeUtility(parsedMatch, options = {}) {
  const {
    side = 'all',
    teamId = 'all',
    categories = ['smoke', 'flash', 'recon', 'molotov'],
    minTime = 0,
    maxTime = 100
  } = options;

  const allowedCats = new Set(categories);
  const filteredEvents = parsedMatch.utilityEvents.filter((ev) => {
    if (side !== 'all' && ev.side !== side) return false;
    if (teamId !== 'all' && ev.teamId !== teamId) return false;
    if (!allowedCats.has(ev.category)) return false;
    if (ev.timestampSec < minTime || ev.timestampSec > maxTime) return false;
    return true;
  });

  const clusters = clusterUtilityEvents(filteredEvents, 64);

  // Heatmap zones grouped by map callout
  const mapSpec = getMapSpec(parsedMatch.meta.mapName);
  const zoneMap = new Map();
  for (const z of mapSpec.zones) {
    zoneMap.set(z.id, {
      calloutId: z.id,
      callout: z.name,
      site: z.site,
      x: z.x,
      y: z.y,
      count: 0,
      byCategory: { smoke: 0, flash: 0, recon: 0, molotov: 0 },
      phases: { early: 0, mid: 0, execute: 0, postplant: 0 }
    });
  }

  for (const ev of filteredEvents) {
    const z = zoneMap.get(ev.calloutId);
    if (z) {
      z.count += 1;
      z.byCategory[ev.category] = (z.byCategory[ev.category] || 0) + 1;
      z.phases[ev.phase] = (z.phases[ev.phase] || 0) + 1;
    }
  }

  const maxZoneCount = Math.max(1, ...Array.from(zoneMap.values()).map((z) => z.count));
  const heatmapZones = Array.from(zoneMap.values())
    .filter((z) => z.count > 0)
    .map((z) => ({
      ...z,
      intensity: Math.round((z.count / maxZoneCount) * 100),
      dominantPhase: Object.entries(z.phases).sort((a, b) => b[1] - a[1])[0][0]
    }))
    .sort((a, b) => b.count - a.count);

  // Round-phase timing breakdown (0:00-1:40)
  const phaseTiming = ROUND_PHASES.map((phase) => {
    const count = filteredEvents.filter(
      (e) => e.timestampSec >= phase.min && e.timestampSec <= phase.max
    ).length;
    return {
      ...phase,
      count,
      pct: filteredEvents.length > 0 ? Math.round((count / filteredEvents.length) * 1000) / 10 : 0
    };
  });

  // Category totals
  const categoryTotals = { smoke: 0, flash: 0, recon: 0, molotov: 0 };
  for (const ev of filteredEvents) {
    categoryTotals[ev.category] = (categoryTotals[ev.category] || 0) + 1;
  }

  // Win-Rate Delta per Utility Setup (computed deterministically over all rounds of the side/team)
  const setupGroups = new Map();
  for (const ev of filteredEvents) {
    const key = `${ev.setupId}::${ev.side}`;
    if (!setupGroups.has(key)) {
      setupGroups.set(key, {
        setupId: ev.setupId,
        setupName: ev.setupName,
        side: ev.side,
        roundMap: new Map(), // roundNumber -> { won, teamId }
        events: []
      });
    }
    const g = setupGroups.get(key);
    g.events.push(ev);
    g.roundMap.set(`${ev.roundNumber}-${ev.teamId}`, {
      roundNumber: ev.roundNumber,
      teamId: ev.teamId,
      won: ev.roundWon
    });
  }

  // Baseline side win-rates across match rounds
  const allSideRoundKeys = new Map(); // side -> Array<{ key, won }>
  for (const r of parsedMatch.rounds) {
    const entries = [
      { side: 'attack', teamId: r.attackingTeamId, won: r.winningTeamId === r.attackingTeamId, roundNumber: r.roundNumber },
      { side: 'defense', teamId: r.defendingTeamId, won: r.winningTeamId === r.defendingTeamId, roundNumber: r.roundNumber }
    ];
    for (const ent of entries) {
      if (teamId !== 'all' && ent.teamId !== teamId) continue;
      if (!allSideRoundKeys.has(ent.side)) allSideRoundKeys.set(ent.side, []);
      allSideRoundKeys.get(ent.side).push({
        key: `${ent.roundNumber}-${ent.teamId}`,
        won: ent.won
      });
    }
  }

  const setupImpacts = Array.from(setupGroups.values())
    .map((g) => {
      const deployedRounds = Array.from(g.roundMap.values());
      const deployedCount = deployedRounds.length;
      const deployedWins = deployedRounds.filter((r) => r.won).length;
      const winRate = deployedCount > 0 ? (deployedWins / deployedCount) * 100 : 0;

      const sidePool = allSideRoundKeys.get(g.side) || [];
      const nonDeployed = sidePool.filter((r) => !g.roundMap.has(r.key));
      const nonDeployedWinRate =
        nonDeployed.length > 0
          ? (nonDeployed.filter((r) => r.won).length / nonDeployed.length) * 100
          : 50;

      const winRateDelta = Math.round((winRate - nonDeployedWinRate) * 10) / 10;
      const avgTimestampSec =
        Math.round((g.events.reduce((s, e) => s + e.timestampSec, 0) / g.events.length) * 10) / 10;

      const catCount = { smoke: 0, flash: 0, recon: 0, molotov: 0 };
      const calloutCount = new Map();
      for (const e of g.events) {
        catCount[e.category] = (catCount[e.category] || 0) + 1;
        calloutCount.set(e.callout, (calloutCount.get(e.callout) || 0) + 1);
      }
      const dominantCategory = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0][0];
      const primaryCallout = [...calloutCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

      return {
        setupId: g.setupId,
        setupName: g.setupName,
        side: g.side,
        roundsUsed: deployedCount,
        castsCount: g.events.length,
        winRate: Math.round(winRate * 10) / 10,
        baselineWinRate: Math.round(nonDeployedWinRate * 10) / 10,
        winRateDelta,
        winRateDeltaLabel: `${formatSignedPct(winRateDelta)} WR`,
        avgTimestampSec,
        avgClock: formatClock(avgTimestampSec),
        dominantCategory,
        primaryCallout
      };
    })
    .sort((a, b) => b.winRateDelta - a.winRateDelta || b.roundsUsed - a.roundsUsed);

  // Automatic Counter-Utility Recommendations
  const counterRecommendations = setupImpacts
    .filter((s) => s.roundsUsed >= 2)
    .slice(0, 5)
    .map((setup) => {
      const matchingCluster = clusters.find((c) => c.callout === setup.primaryCallout) || clusters[0];
      return buildCounterRecommendation(setup, matchingCluster);
    });

  return {
    totalEvents: filteredEvents.length,
    events: filteredEvents,
    clusters,
    heatmapZones,
    phaseTiming,
    categoryTotals,
    setupImpacts,
    counterRecommendations
  };
}

/**
 * (b) Operator Tendency & Sniper Profiler
 */
export function analyzeOperators(parsedMatch, options = {}) {
  const { side = 'all', teamId = 'all' } = options;
  const totalRounds = parsedMatch.rounds.length;
  const playersById = new Map(parsedMatch.players.map((p) => [p.id, p]));
  const teamsById = new Map(parsedMatch.teams.map((t) => [t.id, t]));

  // Identify every player who bought or engaged with an Operator
  const opPlayerIds = new Set();
  for (const wp of parsedMatch.weaponPurchases) {
    if (wp.isOperator) opPlayerIds.add(wp.playerId);
  }
  for (const k of parsedMatch.kills) {
    if (k.weapon.toLowerCase().includes('operator')) opPlayerIds.add(k.killerId);
    if (k.victimWeapon && k.victimWeapon.toLowerCase().includes('operator')) opPlayerIds.add(k.victimId);
  }

  const allSightlines = [];
  const profiles = [];

  for (const playerId of opPlayerIds) {
    const player = playersById.get(playerId) || {
      id: playerId,
      name: playerId,
      teamId: parsedMatch.teams[0].id,
      teamTag: parsedMatch.teams[0].tag,
      agent: 'Jett',
      role: 'Primary Op'
    };
    if (teamId !== 'all' && player.teamId !== teamId) continue;

    const opBuys = parsedMatch.weaponPurchases.filter(
      (wp) =>
        wp.playerId === playerId &&
        wp.isOperator &&
        (side === 'all' || wp.side === side)
    );

    const opKills = parsedMatch.kills.filter(
      (k) =>
        k.killerId === playerId &&
        k.weapon.toLowerCase().includes('operator') &&
        (side === 'all' || k.killerSide === side)
    );

    const opDeaths = parsedMatch.kills.filter((k) => {
      if (k.victimId !== playerId) return false;
      const heldOp =
        (k.victimWeapon && k.victimWeapon.toLowerCase().includes('operator')) ||
        opBuys.some((b) => b.roundNumber === k.roundNumber);
      if (!heldOp) return false;
      const victimSide = k.killerSide === 'attack' ? 'defense' : 'attack';
      return side === 'all' || victimSide === side;
    });

    const opRoundsSet = new Set([
      ...opBuys.map((b) => b.roundNumber),
      ...opKills.map((k) => k.roundNumber),
      ...opDeaths.map((d) => d.roundNumber)
    ]);
    const opRounds = opRoundsSet.size;
    if (opRounds === 0) continue;

    // Economy thresholds: >=4700 full buy vs glass cannon (<4700 or no armor)
    const fullBuyOps = opBuys.filter((b) => b.creditsBeforeBuy >= 4700 && !b.isGlassCannon).length;
    const glassCannonOps = opBuys.filter((b) => b.isGlassCannon || b.creditsBeforeBuy < 4700).length;
    const totalBuys = Math.max(1, opBuys.length);
    const glassCannonRate = Math.round((glassCannonOps / totalBuys) * 1000) / 10;
    const fullBuyRate = Math.round((fullBuyOps / totalBuys) * 1000) / 10;
    const avgBankOnOpBuy =
      opBuys.length > 0
        ? Math.round(opBuys.reduce((s, b) => s + b.creditsBeforeBuy, 0) / opBuys.length)
        : 4700;
    const minBankOnOpBuy =
      opBuys.length > 0 ? Math.min(...opBuys.map((b) => b.creditsBeforeBuy)) : 4700;

    // Combine engagements for angle frequency, peek histogram, and anchor vs roam split
    const engagements = [
      ...opKills.map((k) => ({
        id: k.id,
        roundNumber: k.roundNumber,
        timestampSec: k.timestampSec,
        angleName: k.angleName,
        callout: k.callout,
        origin: k.attackerPosition,
        target: k.victimPosition,
        wonDuel: true,
        firstBlood: k.firstBlood,
        traded: false,
        roleTag: k.roleTag,
        side: k.killerSide
      })),
      ...opDeaths.map((d) => ({
        id: d.id,
        roundNumber: d.roundNumber,
        timestampSec: d.timestampSec,
        angleName: d.angleName,
        callout: d.callout,
        origin: d.victimPosition,
        target: d.attackerPosition,
        wonDuel: false,
        firstBlood: d.firstBlood,
        traded: d.traded,
        roleTag: d.roleTag,
        side: d.killerSide === 'attack' ? 'defense' : 'attack'
      }))
    ].sort((a, b) => a.roundNumber - b.roundNumber || a.timestampSec - b.timestampSec);

    for (const eng of engagements) {
      allSightlines.push({
        ...eng,
        playerId: player.id,
        playerName: player.name,
        teamId: player.teamId,
        teamTag: player.teamTag,
        teamColor: teamsById.get(player.teamId)?.color || '#F5B700'
      });
    }

    // First-blood & Angle Frequency table
    const angleGroups = new Map();
    for (const eng of engagements) {
      const key = eng.angleName;
      if (!angleGroups.has(key)) {
        angleGroups.set(key, {
          angleName: eng.angleName,
          callout: eng.callout,
          roleTag: eng.roleTag,
          originSumX: 0,
          originSumY: 0,
          targetSumX: 0,
          targetSumY: 0,
          engagements: 0,
          picks: 0,
          deaths: 0,
          firstBloods: 0,
          timeSum: 0
        });
      }
      const g = angleGroups.get(key);
      g.engagements += 1;
      g.originSumX += eng.origin.x;
      g.originSumY += eng.origin.y;
      g.targetSumX += eng.target.x;
      g.targetSumY += eng.target.y;
      g.timeSum += eng.timestampSec;
      if (eng.wonDuel) g.picks += 1;
      else g.deaths += 1;
      if (eng.firstBlood && eng.wonDuel) g.firstBloods += 1;
    }

    const totalEng = Math.max(1, engagements.length);
    const angleFrequency = Array.from(angleGroups.values())
      .map((g) => ({
        angleName: g.angleName,
        callout: g.callout,
        roleTag: g.roleTag,
        origin: {
          x: Math.round(g.originSumX / g.engagements),
          y: Math.round(g.originSumY / g.engagements)
        },
        target: {
          x: Math.round(g.targetSumX / g.engagements),
          y: Math.round(g.targetSumY / g.engagements)
        },
        engagements: g.engagements,
        frequencyPct: Math.round((g.engagements / totalEng) * 1000) / 10,
        picks: g.picks,
        deaths: g.deaths,
        firstBloods: g.firstBloods,
        kd: Math.round((g.picks / Math.max(1, g.deaths)) * 100) / 100,
        avgPeekSec: Math.round((g.timeSum / g.engagements) * 10) / 10
      }))
      .sort((a, b) => b.engagements - a.engagements || b.firstBloods - a.firstBloods);

    // Early-Peek Timing Histogram
    const peekHistogram = PEEK_BUCKETS.map((bucket) => {
      const bucketEngs = engagements.filter(
        (e) => e.timestampSec >= bucket.min && e.timestampSec < bucket.max
      );
      return {
        ...bucket,
        count: bucketEngs.length,
        picks: bucketEngs.filter((e) => e.wonDuel).length,
        deaths: bucketEngs.filter((e) => !e.wonDuel).length,
        pct: engagements.length > 0 ? Math.round((bucketEngs.length / engagements.length) * 1000) / 10 : 0
      };
    });

    // Site-Anchor vs Roam Split
    const anchorCount = engagements.filter((e) => e.roleTag === 'anchor').length;
    const roamCount = engagements.filter((e) => e.roleTag === 'roam').length;
    const retakeCount = engagements.filter((e) => e.roleTag === 'retake').length;
    const anchorPct = Math.round((anchorCount / totalEng) * 1000) / 10;
    const roamPct = Math.round((roamCount / totalEng) * 1000) / 10;
    const retakePct = Math.max(0, Math.round((100 - anchorPct - roamPct) * 10) / 10);

    // Trade-Death Vulnerability Score (0-100)
    const untradedDeaths = opDeaths.filter((d) => !d.traded).length;
    const untradedDeathRatio = opDeaths.length > 0 ? untradedDeaths / opDeaths.length : 0.2;
    const earlyPeekDeaths = opDeaths.filter((d) => d.timestampSec <= 18).length;
    const earlyPeekDeathRatio = opDeaths.length > 0 ? earlyPeekDeaths / opDeaths.length : 0.15;
    const rawVuln =
      untradedDeathRatio * 45 +
      (glassCannonRate / 100) * 20 +
      earlyPeekDeathRatio * 20 +
      (roamPct / 100) * 15;
    const tradeVulnerabilityScore = Math.max(12, Math.min(98, Math.round(rawVuln)));
    const vulnerabilityTier =
      tradeVulnerabilityScore >= 68
        ? 'CRITICAL'
        : tradeVulnerabilityScore >= 50
          ? 'HIGH'
          : tradeVulnerabilityScore >= 34
            ? 'MODERATE'
            : 'LOW';

    const firstBloods = opKills.filter((k) => k.firstBlood).length;
    const firstDeaths = opDeaths.filter((d) => d.firstBlood).length;
    const duelWinRate = Math.round((opKills.length / totalEng) * 1000) / 10;
    const avgPeekSec =
      engagements.length > 0
        ? Math.round((engagements.reduce((s, e) => s + e.timestampSec, 0) / engagements.length) * 10) / 10
        : 15;

    // 6-Axis Tactical Radar metrics (normalized 0..100)
    const radar = {
      openingImpact: Math.min(100, Math.round((firstBloods / Math.max(1, opRounds)) * 180 + duelWinRate * 0.4)),
      economyAggression: Math.min(100, Math.round((opRounds / Math.max(1, totalRounds)) * 120 + glassCannonRate * 0.65)),
      mapMobility: Math.min(100, Math.round(roamPct * 1.35 + retakePct * 0.9)),
      angleDiversity: Math.min(100, Math.round((angleFrequency.length / 6) * 100)),
      tradeVulnerability: tradeVulnerabilityScore,
      duelWinRate: Math.round(duelWinRate)
    };

    profiles.push({
      playerId: player.id,
      playerName: player.name,
      teamId: player.teamId,
      teamTag: player.teamTag,
      teamName: teamsById.get(player.teamId)?.name || player.teamTag,
      teamColor: teamsById.get(player.teamId)?.color || '#00AEEF',
      agent: player.agent,
      role: player.role,
      opRounds,
      totalRounds,
      opUsageRate: Math.round((opRounds / Math.max(1, totalRounds)) * 1000) / 10,
      opKills: opKills.length,
      opDeaths: opDeaths.length,
      opKd: Math.round((opKills.length / Math.max(1, opDeaths.length)) * 100) / 100,
      firstBloods,
      firstDeaths,
      duelWinRate,
      avgPeekSec,
      avgPeekClock: formatClock(avgPeekSec),
      economy: {
        totalOpBuys: opBuys.length,
        fullBuyOps,
        fullBuyRate,
        glassCannonOps,
        glassCannonRate,
        avgBankOnOpBuy,
        minBankOnOpBuy,
        thresholdAlert:
          glassCannonRate >= 28
            ? `HIGH ALERT: Buys Glass-Cannon Operator (${glassCannonRate}% of Op rounds, min bank $${minBankOnOpBuy}) — expect surprise Op on 4300-4700cr force rounds.`
            : `Disciplined Op economy (${fullBuyRate}% >=4700cr full buys, avg bank $${avgBankOnOpBuy}) — track >=5700cr thresholds to predict Op activation.`
      },
      roleSplit: {
        anchorPct,
        roamPct,
        retakePct,
        anchorCount,
        roamCount,
        retakeCount
      },
      tradeVulnerability: {
        score: tradeVulnerabilityScore,
        tier: vulnerabilityTier,
        untradedDeaths,
        totalOpDeaths: opDeaths.length,
        untradedPct: opDeaths.length > 0 ? Math.round((untradedDeaths / opDeaths.length) * 1000) / 10 : 0,
        earlyPeekDeaths
      },
      angleFrequency,
      peekHistogram,
      radar,
      engagements
    });
  }

  profiles.sort((a, b) => b.opRounds - a.opRounds || b.opKills - a.opKills);

  return {
    profiles,
    sightlines: allSightlines,
    primaryTarget: profiles.find((p) => p.teamId !== parsedMatch.teams[0].id) || profiles[0] || null
  };
}

/**
 * (c) 1-Click Anti-Op Counter-Strat Dossier Export (Markdown + JSON)
 */
export function generateAntiOpDossier(
  parsedMatch,
  utilityReport,
  operatorReport,
  targetPlayerId,
  simulationResult = null
) {
  const target =
    operatorReport.profiles.find((p) => p.playerId === targetPlayerId) ||
    operatorReport.primaryTarget ||
    operatorReport.profiles[0];

  const opponentTeam = target
    ? parsedMatch.teams.find((t) => t.id === target.teamId)
    : parsedMatch.teams[1];
  const ourTeam = parsedMatch.teams.find((t) => t.id !== opponentTeam?.id) || parsedMatch.teams[0];

  const topAngles = target ? target.angleFrequency.slice(0, 3) : [];
  const peakBucket = target
    ? [...target.peekHistogram].sort((a, b) => b.count - a.count)[0]
    : null;
  const topCounters = utilityReport.counterRecommendations.slice(0, 4);
  const topSetups = utilityReport.setupImpacts.slice(0, 4);

  const antiOpProtocols = target
    ? [
        {
          phase: 'Pre-Round Economy Trigger',
          trigger: `Target bank >= $${Math.min(4700, target.economy.minBankOnOpBuy)} (${target.economy.glassCannonRate}% glass-cannon rate)`,
          action:
            target.economy.glassCannonRate >= 28
              ? `Call live Op alert even on light-buy rounds ($4,350-$4,700). Force ${target.playerName} off-angle with early drone/dog before dry-peeking.`
              : `Track ${target.playerName}'s $5,700 full-buy threshold. Expect standard rifling under $4,700 and immediate Op activation above $5,700.`
        },
        {
          phase: `Early Peek Denial (${peakBucket?.label || '0:00-0:20'})`,
          trigger: `${peakBucket?.pct ?? 0}% of Op duels occur in ${peakBucket?.label || '0:10-0:20'} (avg ${target.avgPeekClock})`,
          action: `Deploy jump-spot or Recon/Drone into ${topAngles[0]?.callout || 'primary choke'} at 0:04-0:08. Never dry-peek ${topAngles[0]?.angleName || 'primary sightline'} without flash or smoke displacement.`
        },
        {
          phase: 'Trade-Punish Protocol',
          trigger: `Trade-Death Vulnerability Score: ${target.tradeVulnerability.score}/100 (${target.tradeVulnerability.tier}) — ${target.tradeVulnerability.untradedPct}% untraded deaths`,
          action: `Double-swing with flash + dash after forcing ${target.playerName}'s first shot on ${topAngles[0]?.callout || 'site choke'}. ${target.roleSplit.roamPct >= 40 ? 'Punish Mid-roam isolation with pinch utility before rotate arrives.' : 'Overload anchor site with dual-lane split to strip escape dash.'}`
        }
      ]
    : [];

  const dossierJson = {
    schema: 'c9-stratforge-anti-op-dossier-v1',
    generatedAt: new Date().toISOString(),
    match: {
      seriesId: parsedMatch.meta.seriesId,
      tournament: parsedMatch.meta.tournament,
      mapName: parsedMatch.meta.mapName,
      scoreline: `${parsedMatch.teams[0].tag} ${parsedMatch.teams[0].score} - ${parsedMatch.teams[1].score} ${parsedMatch.teams[1].tag}`,
      scoutingFor: ourTeam?.name || 'Cloud9',
      scoutingTarget: opponentTeam?.name || 'Opponent'
    },
    targetSniper: target
      ? {
          playerName: target.playerName,
          teamTag: target.teamTag,
          agent: target.agent,
          opRounds: target.opRounds,
          opUsageRate: target.opUsageRate,
          opKd: target.opKd,
          firstBloods: target.firstBloods,
          avgPeekClock: target.avgPeekClock,
          economy: target.economy,
          roleSplit: target.roleSplit,
          tradeVulnerability: target.tradeVulnerability,
          topAngles
        }
      : null,
    antiOpProtocols,
    highImpactUtilitySetups: topSetups,
    counterUtilityPlan: topCounters,
    ...(simulationResult
      ? {
          seriesDeltaSimulation: {
            scenario: simulationResult.controls.scenarioLabel,
            activePreset: simulationResult.controls.activePreset,
            controls: {
              opDenialPct: simulationResult.controls.opDenialPct,
              economyPressurePct: simulationResult.controls.economyPressurePct,
              protocols: simulationResult.controls.protocols,
              activeProtocols: simulationResult.controls.activeProtocols
            },
            baseline: simulationResult.baseline,
            simulated: simulationResult.simulated,
            deltas: simulationResult.deltas,
            verdict: simulationResult.verdict
          }
        }
      : {})
  };

  const angleLines = topAngles
    .map(
      (a, idx) =>
        `${idx + 1}. **${a.angleName}** (${a.callout}) — ${a.engagements} duels (${a.frequencyPct}%), ${a.firstBloods} FB, ${a.kd} K/D, avg peek \`${formatClock(a.avgPeekSec)}\``
    )
    .join('\n');

  const setupLines = topSetups
    .map(
      (s) =>
        `- **${s.setupName}** (${s.side.toUpperCase()} • ${s.primaryCallout}) — Used ${s.roundsUsed} rds | **${s.winRate}% WR** (**${s.winRateDeltaLabel}**) | Avg timing \`${s.avgClock}\``
    )
    .join('\n');

  const counterLines = topCounters
    .map(
      (c) =>
        `- **[${c.priority}] ${c.callout} (${c.window})** vs *${c.targetSetup}* — Counter with **${c.counterAbility}** (${c.agentSuggestion}). ${c.reasoning} _(${c.expectedImpact})_`
    )
    .join('\n');

  const protocolLines = antiOpProtocols
    .map((p, idx) => `### ${idx + 1}. ${p.phase}\n- **Trigger:** ${p.trigger}\n- **Execution:** ${p.action}`)
    .join('\n\n');

  const simulationSection = simulationResult
    ? `
---

## 5. Series Delta & Win-Condition Simulation (${simulationResult.controls.scenarioLabel})

> **Coaching Controls:** Op Denial \`${simulationResult.controls.opDenialPct}%\` | Economy Pressure \`${simulationResult.controls.economyPressurePct}%\` | Active Protocols: ${simulationResult.controls.activeProtocols.length > 0 ? simulationResult.controls.activeProtocols.join(', ') : 'None (Observed Baseline)'}

| Metric | Baseline Observed | Simulated Counter-Plan | Delta |
| --- | --- | --- | --- |
| **Projected Map Score** | ${simulationResult.match.ourTeam.tag} ${simulationResult.baseline.scoreline} ${simulationResult.match.opponentTeam.tag} | ${simulationResult.match.ourTeam.tag} ${simulationResult.simulated.regulationScoreline} ${simulationResult.match.opponentTeam.tag} (${simulationResult.simulated.projectedOurWinsExact} exp rds) | +${simulationResult.deltas.roundsGained.toFixed(1)} rds |
| **Round Win Rate** | ${simulationResult.baseline.winRate}% | ${simulationResult.simulated.winRate}% | **${simulationResult.deltas.winRateDeltaLabel}** |
| **BO3 Series Win Prob** | ${simulationResult.baseline.seriesWinProb}% | ${simulationResult.simulated.seriesWinProb}% | **${simulationResult.deltas.seriesWinProbDeltaLabel}** |
| **Economy Swing / Half** | Avg opp bank $${simulationResult.baseline.oppAvgBank} | +${simulationResult.deltas.ecoBreakRoundsGained.toFixed(1)} eco-break rds gained | **${simulationResult.deltas.creditSwingPerHalfLabel}** |
| **Target Op Suppression** | ${simulationResult.baseline.opKills} Op kills (${simulationResult.baseline.opFirstBloods} FB) | ${simulationResult.simulated.projectedOpKills} Op kills (${simulationResult.simulated.projectedOpFirstBloods} FB) | -${simulationResult.deltas.opDuelsDenied} picks denied |

**Coaching Verdict:** ${simulationResult.verdict}
`
    : '';

  const markdown = `# C9 StratForge — Anti-Operator & Tactical Counter-Strat Dossier

> **Matchup:** ${parsedMatch.teams[0].name} (${parsedMatch.teams[0].score}) vs ${parsedMatch.teams[1].name} (${parsedMatch.teams[1].score})  
> **Map:** ${parsedMatch.meta.mapName} | **Event:** ${parsedMatch.meta.tournament}  
> **Series ID:** \`${parsedMatch.meta.seriesId}\` | **Prepared For:** ${ourTeam?.name || 'Cloud9'} Coaching Staff

---

## 1. Target Sniper Profile — ${target ? `${target.playerName} (${target.teamTag} • ${target.agent})` : 'No Operator Detected'}

${
  target
    ? `| Metric | Value | Tactical Read |
| --- | --- | --- |
| **Operator Usage** | ${target.opRounds}/${target.totalRounds} rds (${target.opUsageRate}%) | Primary sniper threat |
| **Op K/D & Opening Picks** | ${target.opKd} K/D (${target.opKills}K / ${target.opDeaths}D, ${target.firstBloods} FB) | ${target.duelWinRate}% Op duel win rate |
| **Economy Threshold** | ${target.economy.fullBuyRate}% >=$4,700 Full Buy / ${target.economy.glassCannonRate}% Glass Cannon | Avg Op bank $${target.economy.avgBankOnOpBuy} (min $${target.economy.minBankOnOpBuy}) |
| **Site-Anchor vs Roam Split** | ${target.roleSplit.anchorPct}% Anchor / ${target.roleSplit.roamPct}% Mid Roam / ${target.roleSplit.retakePct}% Retake | ${target.roleSplit.roamPct >= 40 ? 'Dynamic mid-roamer' : 'Structured site anchor'} |
| **Trade-Death Vulnerability** | **${target.tradeVulnerability.score}/100 (${target.tradeVulnerability.tier})** | ${target.tradeVulnerability.untradedPct}% untraded Op deaths (${target.tradeVulnerability.earlyPeekDeaths} early <0:18 deaths) |
| **Average Peek Timing** | \`${target.avgPeekClock}\` (Peak window: \`${peakBucket?.label || '0:10-0:20'}\`) | Front-loaded opening aggression |

### Priority First-Blood Angles to Deny
${angleLines || '_No repeated Op angles recorded._'}`
    : '_No Operator purchases recorded in the current dataset._'
}

---

## 2. Anti-Op Counter-Strat Protocols

${protocolLines || '_No Operator counter-protocols needed for this dataset._'}

---

## 3. High-Impact Utility Setups (Win-Rate Delta)

${setupLines || '_No utility setups matched current filters._'}

---

## 4. Automatic Counter-Utility Recommendations

${counterLines || '_No counter-utility rules triggered._'}
${simulationSection}
---
*Generated deterministically by **C9 StratForge** (Cloud9 x JetBrains Sky's The Limit Hackathon 2026) from official GRID Esports Series State telemetry.*
`;

  const slug = `${parsedMatch.meta.mapName}-${target?.playerName || 'match'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  return {
    json: dossierJson,
    markdown,
    filenameBase: `c9-stratforge-anti-op-${slug}`
  };
}
