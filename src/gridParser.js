/**
 * C9 StratForge — Official GRID Esports Series State JSON Parser & Pro Presets
 * Supports GRID GraphQL `data.seriesState`, top-level `seriesState`, and direct match JSON.
 */

import { getMapSpec, normalizeCoordinate, resolveCallout } from './maps.js';

export const ABILITY_CATEGORIES = {
  smoke: {
    id: 'smoke',
    label: 'Smokes & Vision',
    color: '#00AEEF',
    keywords: [
      'smoke', 'dark cover', 'cloudburst', 'sky smoke', 'toxic screen', 'poison cloud',
      'nebula', 'ruse', 'high tide', 'cove', 'cosmic divide', 'fast lane', 'barrier orb'
    ]
  },
  flash: {
    id: 'flash',
    label: 'Flashes & Blinds',
    color: '#F5B700',
    keywords: [
      'flash', 'blind', 'paranoia', 'guiding light', 'flashpoint', 'curveball',
      'leer', 'dizzy', 'flash/drive', 'seize', 'fault line', 'rolling thunder'
    ]
  },
  recon: {
    id: 'recon',
    label: 'Recon & Info',
    color: '#2EE6A6',
    keywords: [
      'recon', 'dart', 'haunt', 'drone', 'owl drone', 'prowler', 'trailblazer',
      'zero/point', 'knife', 'spycam', 'trapwire', 'alarmbot', 'turret', 'wingman', 'seeker'
    ]
  },
  molotov: {
    id: 'molotov',
    label: 'Molotovs & Denial',
    color: '#FF4655',
    keywords: [
      'molo', 'nanoswarm', 'snake bite', 'incendiary', 'frag/ment', 'hot hands',
      'aftershock', 'paint shells', 'mosh pit', 'shock bolt', 'gravity well', 'slow orb'
    ]
  }
};

export function classifyAbility(abilityName, explicitCategory) {
  if (explicitCategory) {
    const clean = String(explicitCategory).toLowerCase().trim();
    if (ABILITY_CATEGORIES[clean]) return clean;
  }
  const lower = String(abilityName || '').toLowerCase();
  for (const [cat, spec] of Object.entries(ABILITY_CATEGORIES)) {
    if (spec.keywords.some((kw) => lower.includes(kw))) {
      return cat;
    }
  }
  return 'smoke';
}

function clampTime(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return 30;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function inferRoundPhase(timestampSec) {
  if (timestampSec <= 25) return 'early';
  if (timestampSec <= 55) return 'mid';
  if (timestampSec <= 75) return 'execute';
  return 'postplant';
}

/**
 * Deterministic PRNG (Mulberry32) used exclusively to build rich, reproducible
 * pro-match GRID Series State JSON fixtures for the 3 bundled scouting presets.
 */
function createSeededRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(rng, base, spread) {
  return Math.round(base + (rng() - 0.5) * 2 * spread);
}

/**
 * Generates an official GRID Series State JSON document for a pro match blueprint.
 */
function buildGridSeriesFixture(blueprint) {
  const rng = createSeededRng(blueprint.seed);
  const {
    seriesId,
    tournament,
    eventDate,
    mapName,
    teams,
    roundOutcomes, // array of 'teamA' | 'teamB' length 22..24
    utilityPlaybook,
    opAngles
  } = blueprint;

  const teamA = teams[0];
  const teamB = teams[1];
  const scoreA = roundOutcomes.filter((w) => w === teamA.id).length;
  const scoreB = roundOutcomes.filter((w) => w === teamB.id).length;

  const rounds = roundOutcomes.map((winnerId, idx) => {
    const roundNumber = idx + 1;
    const isSecondHalf = roundNumber > 12;
    const attackingTeamId = isSecondHalf ? teamB.id : teamA.id;
    const defendingTeamId = isSecondHalf ? teamA.id : teamB.id;
    const isPistol = roundNumber === 1 || roundNumber === 13;
    const isEcoOrBonus = roundNumber === 2 || roundNumber === 14;

    const weaponPurchases = [];
    const utilityEvents = [];
    const kills = [];

    // Generate economy & weapon purchases for both rosters
    for (const team of [teamA, teamB]) {
      const side = team.id === attackingTeamId ? 'attack' : 'defense';
      for (const player of team.players) {
        let bank = isPistol
          ? 800
          : isEcoOrBonus
            ? Math.round(2400 + rng() * 1400)
            : Math.round(3900 + rng() * 3400);

        let weapon = isPistol ? 'Ghost' : 'Vandal';
        let armor = isPistol ? 'Light Shields' : 'Heavy Shields';
        let weaponCost = isPistol ? 500 : 2900;

        // Primary and secondary Operator logic with realistic economy thresholds
        if (player.opProfile && !isPistol) {
          const prefersOpNow =
            (side === 'defense' && rng() < player.opProfile.defBuyRate) ||
            (side === 'attack' && rng() < player.opProfile.atkBuyRate);
          if (prefersOpNow) {
            const isGlassCannon = rng() < player.opProfile.glassCannonRate;
            if (isGlassCannon) {
              bank = Math.round(4700 + rng() * 350); // >=4700 bare minimum or light shield glass cannon
              if (rng() < 0.65) {
                bank = Math.round(4350 + rng() * 340); // hero/glass cannon under 4700 (team drop / no armor)
              }
              armor = 'None';
            } else {
              bank = Math.round(5200 + rng() * 2600);
              armor = 'Heavy Shields';
            }
            weapon = 'Operator';
            weaponCost = 4700;
          }
        }

        weaponPurchases.push({
          playerId: player.id,
          teamId: team.id,
          side,
          weapon,
          weaponCost,
          armor,
          creditsBeforeBuy: bank,
          creditsRemaining: Math.max(0, bank - weaponCost - (armor === 'Heavy Shields' ? 1000 : 0)),
          isGlassCannon: weapon === 'Operator' && (armor === 'None' || bank < 4700)
        });
      }
    }

    // Generate tactical utility events driven by playbook setups
    // Some setups strongly correlate with round victory so win-rate delta is authentic & meaningful
    const winningSide = winnerId === attackingTeamId ? 'attack' : 'defense';

    for (const setup of utilityPlaybook) {
      const setupTeamId = setup.side === 'attack' ? attackingTeamId : defendingTeamId;
      const teamObj = setupTeamId === teamA.id ? teamA : teamB;
      const didTeamWin = setupTeamId === winnerId;
      // Probability boosted when team won if setup.winBias > 0, creating realistic positive/negative WR deltas
      const triggerProb = Math.max(
        0.12,
        Math.min(0.92, setup.baseRate + (didTeamWin ? setup.winBias : -setup.winBias))
      );

      if (rng() < triggerProb) {
        for (const cast of setup.casts) {
          const caster =
            teamObj.players.find((p) => p.agent === cast.agent) ||
            teamObj.players[Math.floor(rng() * teamObj.players.length)];
          const castTime = clampTime(cast.time + (rng() - 0.5) * 6);
          utilityEvents.push({
            id: `u-r${roundNumber}-${utilityEvents.length + 1}`,
            roundNumber,
            timestampSec: castTime,
            teamId: teamObj.id,
            side: setup.side,
            playerId: caster.id,
            playerName: caster.name,
            agent: caster.agent,
            abilityName: cast.ability,
            category: classifyAbility(cast.ability, cast.category),
            setupId: setup.id,
            setupName: setup.name,
            coordinates: {
              x: Math.max(40, Math.min(960, jitter(rng, cast.x, cast.spread || 18))),
              y: Math.max(40, Math.min(960, jitter(rng, cast.y, cast.spread || 18)))
            }
          });
        }
      }
    }

    // Generate Operator engagements & key kills for every player holding an Operator this round
    const opHolders = weaponPurchases.filter((w) => w.weapon === 'Operator');
    let firstBloodAssigned = false;

    for (const holder of opHolders) {
      const teamObj = holder.teamId === teamA.id ? teamA : teamB;
      const oppTeam = holder.teamId === teamA.id ? teamB : teamA;
      const playerObj = teamObj.players.find((p) => p.id === holder.playerId);
      const sideAngles = opAngles.filter((a) => a.side === holder.side);
      const angle =
        sideAngles[Math.floor(rng() * sideAngles.length)] || opAngles[0];

      const peekTime = clampTime(
        (playerObj.opProfile?.avgPeekSec ?? 16) + (rng() - 0.45) * 14
      );
      const victim = oppTeam.players[Math.floor(rng() * oppTeam.players.length)];
      const wonDuel = rng() < (holder.teamId === winnerId ? 0.68 : 0.36);

      const origin = {
        x: Math.max(40, Math.min(960, jitter(rng, angle.origin.x, 14))),
        y: Math.max(40, Math.min(960, jitter(rng, angle.origin.y, 14)))
      };
      const target = {
        x: Math.max(40, Math.min(960, jitter(rng, angle.target.x, 16))),
        y: Math.max(40, Math.min(960, jitter(rng, angle.target.y, 16)))
      };

      const isFB = !firstBloodAssigned && peekTime <= 28;
      if (isFB) firstBloodAssigned = true;

      if (wonDuel) {
        kills.push({
          id: `k-r${roundNumber}-${kills.length + 1}`,
          roundNumber,
          timestampSec: peekTime,
          killerId: holder.playerId,
          killerName: playerObj.name,
          killerTeamId: holder.teamId,
          killerSide: holder.side,
          victimId: victim.id,
          victimName: victim.name,
          victimTeamId: oppTeam.id,
          weapon: 'Operator',
          firstBlood: isFB,
          traded: false,
          roleTag: angle.roleTag,
          angleName: angle.name,
          attackerPosition: origin,
          victimPosition: target
        });
      } else {
        // Sniper died holding the Operator — critical for trade-death vulnerability score
        const wasTraded = rng() < (playerObj.opProfile?.tradedRate ?? 0.35);
        kills.push({
          id: `k-r${roundNumber}-${kills.length + 1}`,
          roundNumber,
          timestampSec: peekTime,
          killerId: victim.id,
          killerName: victim.name,
          killerTeamId: oppTeam.id,
          killerSide: holder.side === 'attack' ? 'defense' : 'attack',
          victimId: holder.playerId,
          victimName: playerObj.name,
          victimTeamId: holder.teamId,
          victimWeapon: 'Operator',
          weapon: isPistol ? 'Ghost' : 'Vandal',
          firstBlood: isFB,
          traded: wasTraded,
          roleTag: angle.roleTag,
          angleName: angle.name,
          attackerPosition: target,
          victimPosition: origin
        });
      }
    }

    // Add rifle follow-up kills for realistic round completeness
    const rifleKillCount = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < rifleKillCount; k++) {
      const winnerTeamObj = winnerId === teamA.id ? teamA : teamB;
      const loserTeamObj = winnerId === teamA.id ? teamB : teamA;
      const killer = winnerTeamObj.players[Math.floor(rng() * winnerTeamObj.players.length)];
      const victim = loserTeamObj.players[Math.floor(rng() * loserTeamObj.players.length)];
      const timeSec = clampTime(32 + rng() * 52);
      kills.push({
        id: `k-r${roundNumber}-${kills.length + 1}`,
        roundNumber,
        timestampSec: timeSec,
        killerId: killer.id,
        killerName: killer.name,
        killerTeamId: winnerTeamObj.id,
        killerSide: winningSide,
        victimId: victim.id,
        victimName: victim.name,
        victimTeamId: loserTeamObj.id,
        weapon: isPistol ? 'Classic' : rng() < 0.6 ? 'Vandal' : 'Phantom',
        firstBlood: !firstBloodAssigned && k === 0,
        traded: rng() < 0.45,
        attackerPosition: {
          x: Math.round(200 + rng() * 600),
          y: Math.round(220 + rng() * 520)
        },
        victimPosition: {
          x: Math.round(200 + rng() * 600),
          y: Math.round(220 + rng() * 520)
        }
      });
      if (!firstBloodAssigned && k === 0) firstBloodAssigned = true;
    }

    return {
      id: `${seriesId}-g1-r${roundNumber}`,
      sequenceNumber: roundNumber,
      attackingTeamId,
      defendingTeamId,
      winningTeamId: winnerId,
      winCondition: rng() < 0.62 ? 'elimination' : rng() < 0.85 ? 'spike_detonated' : 'spike_defused',
      plantSite: blueprint.sites[Math.floor(rng() * blueprint.sites.length)],
      weaponPurchases,
      utilityEvents,
      kills
    };
  });

  // Official GRID Esports Series State JSON Schema wrapper
  return {
    data: {
      seriesState: {
        id: seriesId,
        schemaVersion: 'grid-series-state-v3.2',
        startedAt: eventDate,
        title: { name: 'VALORANT' },
        tournament: { name: tournament },
        format: 'bo3',
        teams: [
          { id: teamA.id, name: teamA.name, tag: teamA.tag, score: scoreA, color: teamA.color },
          { id: teamB.id, name: teamB.name, tag: teamB.tag, score: scoreB, color: teamB.color }
        ],
        games: [
          {
            id: `${seriesId}-game-1`,
            sequenceNumber: 1,
            finished: true,
            map: { name: mapName },
            teams: [
              {
                id: teamA.id,
                name: teamA.name,
                tag: teamA.tag,
                score: scoreA,
                players: teamA.players.map((p) => ({
                  id: p.id,
                  name: p.name,
                  character: { name: p.agent },
                  role: p.role
                }))
              },
              {
                id: teamB.id,
                name: teamB.name,
                tag: teamB.tag,
                score: scoreB,
                players: teamB.players.map((p) => ({
                  id: p.id,
                  name: p.name,
                  character: { name: p.agent },
                  role: p.role
                }))
              }
            ],
            rounds
          }
        ]
      }
    }
  };
}

const PRESET_BLUEPRINTS = {
  'c9-sen-ascent': {
    id: 'c9-sen-ascent',
    label: 'C9 vs Sentinels — Ascent',
    subtitle: 'VCT Americas Stage 1 • 24 Rounds • OXY vs zekken Op Duel',
    seed: 90210,
    seriesId: 'grid-vct-2026-c9-sen-ascent',
    tournament: 'VCT Americas 2026 — Stage 1 Week 4',
    eventDate: '2026-04-18T21:00:00Z',
    mapName: 'Ascent',
    sites: ['A', 'B'],
    teams: [
      {
        id: 'team-c9',
        name: 'Cloud9',
        tag: 'C9',
        color: '#00AEEF',
        players: [
          {
            id: 'c9-oxy',
            name: 'OXY',
            agent: 'Jett',
            role: 'Duelist / Primary Op',
            opProfile: { defBuyRate: 0.72, atkBuyRate: 0.28, glassCannonRate: 0.24, avgPeekSec: 12.5, tradedRate: 0.42 }
          },
          { id: 'c9-xeppaa', name: 'Xeppaa', agent: 'KAY/O', role: 'Flex Initiator' },
          { id: 'c9-vanity', name: 'vanity', agent: 'Omen', role: 'Controller / IGL' },
          { id: 'c9-runi', name: 'runi', agent: 'Sova', role: 'Info Initiator' },
          { id: 'c9-moose', name: 'moose', agent: 'Killjoy', role: 'Sentinel' }
        ]
      },
      {
        id: 'team-sen',
        name: 'Sentinels',
        tag: 'SEN',
        color: '#FF4655',
        players: [
          {
            id: 'sen-zekken',
            name: 'zekken',
            agent: 'Jett',
            role: 'Duelist / Primary Op',
            opProfile: { defBuyRate: 0.68, atkBuyRate: 0.22, glassCannonRate: 0.34, avgPeekSec: 10.8, tradedRate: 0.28 }
          },
          { id: 'sen-tenz', name: 'TenZ', agent: 'Omen', role: 'Controller' },
          { id: 'sen-johnqt', name: 'johnqt', agent: 'Killjoy', role: 'Sentinel / IGL' },
          { id: 'sen-zellsis', name: 'Zellsis', agent: 'KAY/O', role: 'Flex Initiator' },
          { id: 'sen-sacy', name: 'Sacy', agent: 'Sova', role: 'Info Initiator' }
        ]
      }
    ],
    roundOutcomes: [
      'team-c9', 'team-c9', 'team-sen', 'team-c9', 'team-sen', 'team-sen',
      'team-c9', 'team-sen', 'team-c9', 'team-c9', 'team-sen', 'team-c9',
      'team-sen', 'team-sen', 'team-c9', 'team-sen', 'team-c9', 'team-sen',
      'team-c9', 'team-sen', 'team-c9', 'team-sen', 'team-c9', 'team-c9'
    ],
    utilityPlaybook: [
      {
        id: 'asc-a-exec',
        name: 'A-Main Deep Recon + Heaven Smoke',
        side: 'attack',
        baseRate: 0.62,
        winBias: 0.24,
        casts: [
          { agent: 'Sova', ability: 'Recon Bolt', category: 'recon', x: 775, y: 295, time: 38, spread: 16 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 710, y: 240, time: 41, spread: 14 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 640, y: 395, time: 42, spread: 14 },
          { agent: 'KAY/O', ability: 'FLASH/drive', category: 'flash', x: 790, y: 495, time: 44, spread: 16 }
        ]
      },
      {
        id: 'asc-mid-split',
        name: 'Mid Catwalk Control + Market Smoke',
        side: 'attack',
        baseRate: 0.56,
        winBias: 0.19,
        casts: [
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 388, y: 395, time: 20, spread: 15 },
          { agent: 'Sova', ability: 'Owl Drone', category: 'recon', x: 545, y: 470, time: 18, spread: 18 },
          { agent: 'KAY/O', ability: 'ZERO/point', category: 'recon', x: 630, y: 385, time: 24, spread: 16 }
        ]
      },
      {
        id: 'asc-b-exec',
        name: 'B-Main Flood + Market & CT Smokes',
        side: 'attack',
        baseRate: 0.44,
        winBias: -0.09,
        casts: [
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 325, y: 370, time: 54, spread: 14 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 325, y: 215, time: 55, spread: 14 },
          { agent: 'KAY/O', ability: 'FRAG/ment', category: 'molotov', x: 185, y: 220, time: 58, spread: 15 },
          { agent: 'Killjoy', ability: 'Nanoswarm', category: 'molotov', x: 235, y: 345, time: 82, spread: 14 }
        ]
      },
      {
        id: 'asc-def-b-lock',
        name: 'B-Main Early Stall + Sova Info',
        side: 'defense',
        baseRate: 0.64,
        winBias: 0.21,
        casts: [
          { agent: 'Sova', ability: 'Recon Bolt', category: 'recon', x: 225, y: 585, time: 8, spread: 16 },
          { agent: 'Killjoy', ability: 'Nanoswarm', category: 'molotov', x: 215, y: 495, time: 26, spread: 14 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 215, y: 455, time: 28, spread: 12 },
          { agent: 'Omen', ability: 'Paranoia', category: 'flash', x: 220, y: 520, time: 33, spread: 15 }
        ]
      },
      {
        id: 'asc-def-a-retake',
        name: 'A-Main One-Way + KAY/O Suppression',
        side: 'defense',
        baseRate: 0.58,
        winBias: 0.16,
        casts: [
          { agent: 'KAY/O', ability: 'ZERO/point', category: 'recon', x: 805, y: 635, time: 10, spread: 18 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 805, y: 475, time: 29, spread: 12 },
          { agent: 'KAY/O', ability: 'FLASH/drive', category: 'flash', x: 755, y: 350, time: 67, spread: 16 },
          { agent: 'Killjoy', ability: 'Nanoswarm', category: 'molotov', x: 765, y: 340, time: 79, spread: 15 }
        ]
      }
    ],
    opAngles: [
      { name: 'A Main Jump-Peek', side: 'defense', roleTag: 'anchor', origin: { x: 760, y: 310 }, target: { x: 815, y: 555 } },
      { name: 'Mid Catwalk Cross', side: 'defense', roleTag: 'roam', origin: { x: 590, y: 410 }, target: { x: 475, y: 600 } },
      { name: 'Mid Market Arch', side: 'defense', roleTag: 'roam', origin: { x: 370, y: 385 }, target: { x: 475, y: 575 } },
      { name: 'B Lane Boathouse Hold', side: 'defense', roleTag: 'anchor', origin: { x: 185, y: 230 }, target: { x: 215, y: 505 } },
      { name: 'A Heaven Retake Line', side: 'defense', roleTag: 'retake', origin: { x: 715, y: 235 }, target: { x: 795, y: 425 } },
      { name: 'Mid Top Op Duel', side: 'attack', roleTag: 'roam', origin: { x: 470, y: 660 }, target: { x: 555, y: 455 } },
      { name: 'A Lobby Barrier Pick', side: 'attack', roleTag: 'anchor', origin: { x: 810, y: 670 }, target: { x: 775, y: 365 } }
    ]
  },

  'c9w-g2g-haven': {
    id: 'c9w-g2g-haven',
    label: 'C9 White (GC) vs G2 Gozen — Haven',
    subtitle: 'VCT Game Changers Championship • 23 Rounds • 3-Site Op Control',
    seed: 44123,
    seriesId: 'grid-gc-2026-c9w-g2g-haven',
    tournament: 'VCT Game Changers Championship 2026',
    eventDate: '2026-05-09T17:30:00Z',
    mapName: 'Haven',
    sites: ['A', 'B', 'C'],
    teams: [
      {
        id: 'team-c9w',
        name: 'Cloud9 White',
        tag: 'C9W',
        color: '#00AEEF',
        players: [
          {
            id: 'c9w-jazzy',
            name: 'jazzyk1ns',
            agent: 'Jett',
            role: 'Duelist / Primary Op',
            opProfile: { defBuyRate: 0.74, atkBuyRate: 0.30, glassCannonRate: 0.22, avgPeekSec: 13.0, tradedRate: 0.46 }
          },
          { id: 'c9w-mel', name: 'meL', agent: 'Killjoy', role: 'Sentinel / IGL' },
          { id: 'c9w-alexis', name: 'Alexis', agent: 'Breach', role: 'Flash Initiator' },
          { id: 'c9w-katsumi', name: 'katsumi', agent: 'Omen', role: 'Controller' },
          { id: 'c9w-bob', name: 'bob', agent: 'Sova', role: 'Info Initiator' }
        ]
      },
      {
        id: 'team-g2g',
        name: 'G2 Gozen',
        tag: 'G2G',
        color: '#FF4655',
        players: [
          {
            id: 'g2g-mary',
            name: 'Mary',
            agent: 'Jett',
            role: 'Duelist / Primary Op',
            opProfile: { defBuyRate: 0.78, atkBuyRate: 0.25, glassCannonRate: 0.38, avgPeekSec: 9.6, tradedRate: 0.24 }
          },
          { id: 'g2g-mimi', name: 'Mimi', agent: 'Breach', role: 'Flash Initiator / IGL' },
          { id: 'g2g-petra', name: 'Petra', agent: 'Sova', role: 'Info Initiator' },
          { id: 'g2g-glance', name: 'Glance', agent: 'Omen', role: 'Controller' },
          { id: 'g2g-juliano', name: 'juliano', agent: 'Killjoy', role: 'Sentinel' }
        ]
      }
    ],
    roundOutcomes: [
      'team-c9w', 'team-c9w', 'team-g2g', 'team-g2g', 'team-c9w', 'team-c9w',
      'team-g2g', 'team-c9w', 'team-g2g', 'team-c9w', 'team-g2g', 'team-c9w',
      'team-g2g', 'team-c9w', 'team-g2g', 'team-c9w', 'team-g2g', 'team-c9w',
      'team-g2g', 'team-c9w', 'team-g2g', 'team-c9w', 'team-c9w'
    ],
    utilityPlaybook: [
      {
        id: 'hav-c-split',
        name: 'C-Long + Garage Double-Door Crunch',
        side: 'attack',
        baseRate: 0.58,
        winBias: 0.23,
        casts: [
          { agent: 'Sova', ability: 'Recon Bolt', category: 'recon', x: 185, y: 280, time: 34, spread: 16 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 255, y: 235, time: 37, spread: 14 },
          { agent: 'Breach', ability: 'Fault Line', category: 'flash', x: 175, y: 335, time: 39, spread: 16 },
          { agent: 'Breach', ability: 'Aftershock', category: 'molotov', x: 325, y: 445, time: 31, spread: 14 }
        ]
      },
      {
        id: 'hav-a-hit',
        name: 'A-Long + Short Pinch with Heaven Smoke',
        side: 'attack',
        baseRate: 0.55,
        winBias: 0.18,
        casts: [
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 755, y: 235, time: 45, spread: 14 },
          { agent: 'Breach', ability: 'Flashpoint', category: 'flash', x: 845, y: 485, time: 47, spread: 15 },
          { agent: 'Sova', ability: 'Owl Drone', category: 'recon', x: 850, y: 540, time: 20, spread: 16 },
          { agent: 'Killjoy', ability: 'Nanoswarm', category: 'molotov', x: 810, y: 345, time: 84, spread: 15 }
        ]
      },
      {
        id: 'hav-def-a-reclear',
        name: 'A-Long Early Breach Stun + Recon',
        side: 'defense',
        baseRate: 0.62,
        winBias: 0.20,
        casts: [
          { agent: 'Breach', ability: 'Fault Line', category: 'flash', x: 855, y: 615, time: 9, spread: 16 },
          { agent: 'Sova', ability: 'Recon Bolt', category: 'recon', x: 830, y: 690, time: 11, spread: 18 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 855, y: 470, time: 29, spread: 12 }
        ]
      },
      {
        id: 'hav-def-garage',
        name: 'Garage Denial + Mid Window Smoke',
        side: 'defense',
        baseRate: 0.52,
        winBias: -0.07,
        casts: [
          { agent: 'Killjoy', ability: 'Nanoswarm', category: 'molotov', x: 330, y: 475, time: 28, spread: 15 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 465, y: 545, time: 22, spread: 14 },
          { agent: 'Omen', ability: 'Paranoia', category: 'flash', x: 330, y: 445, time: 42, spread: 15 }
        ]
      }
    ],
    opAngles: [
      { name: 'C Long Deep Sightline', side: 'defense', roleTag: 'anchor', origin: { x: 165, y: 290 }, target: { x: 155, y: 620 } },
      { name: 'A Long Sandbag Hold', side: 'defense', roleTag: 'anchor', origin: { x: 840, y: 385 }, target: { x: 855, y: 650 } },
      { name: 'Mid Window Aggressive Peek', side: 'defense', roleTag: 'roam', origin: { x: 475, y: 455 }, target: { x: 430, y: 650 } },
      { name: 'Garage Double-Door Line', side: 'defense', roleTag: 'roam', origin: { x: 325, y: 405 }, target: { x: 345, y: 560 } },
      { name: 'A Heaven Retake Cross', side: 'defense', roleTag: 'retake', origin: { x: 755, y: 235 }, target: { x: 830, y: 410 } },
      { name: 'C Long Barrier Pick', side: 'attack', roleTag: 'anchor', origin: { x: 165, y: 680 }, target: { x: 165, y: 335 } }
    ]
  },

  'vct-americas-split': {
    id: 'vct-americas-split',
    label: 'VCT Americas Playoff — Split',
    subtitle: 'Cloud9 vs LOUD • 22 Rounds • Mail / Vent & Ramp Executions',
    seed: 77889,
    seriesId: 'grid-vct-2026-playoff-c9-loud-split',
    tournament: 'VCT Americas 2026 Playoffs — Upper Semifinal',
    eventDate: '2026-06-02T22:15:00Z',
    mapName: 'Split',
    sites: ['A', 'B'],
    teams: [
      {
        id: 'team-c9',
        name: 'Cloud9',
        tag: 'C9',
        color: '#00AEEF',
        players: [
          {
            id: 'c9-oxy',
            name: 'OXY',
            agent: 'Jett',
            role: 'Duelist / Primary Op',
            opProfile: { defBuyRate: 0.70, atkBuyRate: 0.24, glassCannonRate: 0.20, avgPeekSec: 13.5, tradedRate: 0.48 }
          },
          { id: 'c9-xeppaa', name: 'Xeppaa', agent: 'Skye', role: 'Flash Initiator' },
          { id: 'c9-vanity', name: 'vanity', agent: 'Omen', role: 'Controller / IGL' },
          { id: 'c9-moose', name: 'moose', agent: 'Viper', role: 'Secondary Controller' },
          { id: 'c9-runi', name: 'runi', agent: 'Cypher', role: 'Sentinel' }
        ]
      },
      {
        id: 'team-loud',
        name: 'LOUD',
        tag: 'LOUD',
        color: '#FF4655',
        players: [
          {
            id: 'loud-qck',
            name: 'qck',
            agent: 'Jett',
            role: 'Duelist / Primary Op',
            opProfile: { defBuyRate: 0.65, atkBuyRate: 0.20, glassCannonRate: 0.36, avgPeekSec: 11.4, tradedRate: 0.26 }
          },
          { id: 'loud-less', name: 'Less', agent: 'Viper', role: 'Sentinel / Lurker' },
          { id: 'loud-saadhak', name: 'Saadhak', agent: 'Skye', role: 'Initiator / IGL' },
          { id: 'loud-tuyz', name: 'tuyz', agent: 'Omen', role: 'Controller' },
          { id: 'loud-cauanzin', name: 'cauanzin', agent: 'Cypher', role: 'Info Sentinel' }
        ]
      }
    ],
    roundOutcomes: [
      'team-c9', 'team-c9', 'team-loud', 'team-c9', 'team-c9', 'team-loud',
      'team-loud', 'team-c9', 'team-loud', 'team-c9', 'team-c9', 'team-loud',
      'team-loud', 'team-c9', 'team-c9', 'team-loud', 'team-c9', 'team-loud',
      'team-c9', 'team-loud', 'team-c9', 'team-c9'
    ],
    utilityPlaybook: [
      {
        id: 'spl-mid-b-split',
        name: 'Mid Mail Smoke + B-Heaven Flash Split',
        side: 'attack',
        baseRate: 0.64,
        winBias: 0.25,
        casts: [
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 405, y: 380, time: 18, spread: 14 },
          { agent: 'Skye', ability: 'Guiding Light', category: 'flash', x: 495, y: 500, time: 22, spread: 16 },
          { agent: 'Skye', ability: 'Trailblazer', category: 'recon', x: 350, y: 315, time: 30, spread: 16 },
          { agent: 'Viper', ability: 'Snake Bite', category: 'molotov', x: 320, y: 265, time: 48, spread: 14 }
        ]
      },
      {
        id: 'spl-a-ramp',
        name: 'A-Ramp Crunch + Screens Smoke & Post-Plant',
        side: 'attack',
        baseRate: 0.56,
        winBias: 0.17,
        casts: [
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 765, y: 315, time: 44, spread: 14 },
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 685, y: 265, time: 45, spread: 14 },
          { agent: 'Skye', ability: 'Guiding Light', category: 'flash', x: 705, y: 495, time: 47, spread: 15 },
          { agent: 'Viper', ability: 'Snake Bite', category: 'molotov', x: 800, y: 350, time: 81, spread: 14 }
        ]
      },
      {
        id: 'spl-def-mid-stall',
        name: 'Mid Bottom Viper Orb + Vent Info',
        side: 'defense',
        baseRate: 0.66,
        winBias: 0.22,
        casts: [
          { agent: 'Viper', ability: 'Poison Cloud', category: 'smoke', x: 495, y: 550, time: 9, spread: 14 },
          { agent: 'Viper', ability: 'Snake Bite', category: 'molotov', x: 495, y: 570, time: 20, spread: 15 },
          { agent: 'Cypher', ability: 'Spycam', category: 'recon', x: 585, y: 410, time: 12, spread: 16 },
          { agent: 'Omen', ability: 'Paranoia', category: 'flash', x: 440, y: 445, time: 34, spread: 15 }
        ]
      },
      {
        id: 'spl-def-b-garage',
        name: 'B-Main Garage One-Way + Cypher Lock',
        side: 'defense',
        baseRate: 0.50,
        winBias: -0.08,
        casts: [
          { agent: 'Omen', ability: 'Dark Cover', category: 'smoke', x: 200, y: 495, time: 25, spread: 12 },
          { agent: 'Cypher', ability: 'Trapwire', category: 'recon', x: 195, y: 445, time: 14, spread: 14 },
          { agent: 'Viper', ability: 'Snake Bite', category: 'molotov', x: 200, y: 530, time: 36, spread: 14 }
        ]
      }
    ],
    opAngles: [
      { name: 'A Ramp Top Angle', side: 'defense', roleTag: 'anchor', origin: { x: 695, y: 420 }, target: { x: 720, y: 585 } },
      { name: 'Mid Vent Off-Angle', side: 'defense', roleTag: 'roam', origin: { x: 575, y: 390 }, target: { x: 495, y: 590 } },
      { name: 'B Heaven Crossfire', side: 'defense', roleTag: 'anchor', origin: { x: 320, y: 265 }, target: { x: 200, y: 500 } },
      { name: 'Mid Mail Tight Line', side: 'defense', roleTag: 'roam', origin: { x: 410, y: 375 }, target: { x: 495, y: 585 } },
      { name: 'A Heaven Retake Peak', side: 'defense', roleTag: 'retake', origin: { x: 685, y: 255 }, target: { x: 810, y: 415 } },
      { name: 'Mid Bottom Op Counter', side: 'attack', roleTag: 'roam', origin: { x: 495, y: 650 }, target: { x: 415, y: 395 } }
    ]
  }
};

export const PRESET_METADATA = Object.values(PRESET_BLUEPRINTS).map((p) => ({
  id: p.id,
  label: p.label,
  subtitle: p.subtitle,
  mapName: p.mapName,
  tournament: p.tournament
}));

const fixtureCache = new Map();

export function getRawPresetJson(presetId = 'c9-sen-ascent') {
  const key = PRESET_BLUEPRINTS[presetId] ? presetId : 'c9-sen-ascent';
  if (!fixtureCache.has(key)) {
    fixtureCache.set(key, buildGridSeriesFixture(PRESET_BLUEPRINTS[key]));
  }
  return structuredClone(fixtureCache.get(key));
}

export function getSampleGridJson(presetId = 'c9-sen-ascent') {
  return JSON.stringify(getRawPresetJson(presetId), null, 2);
}

/**
 * Parses official GRID Esports Series State JSON (or direct game state JSON)
 * into C9 StratForge's normalized match model.
 */
export function parseGridSeriesState(rawInput) {
  let payload = rawInput;
  if (typeof rawInput === 'string') {
    try {
      payload = JSON.parse(rawInput);
    } catch (err) {
      throw new Error(`Invalid JSON syntax: ${err.message}`);
    }
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('GRID Series State payload must be a JSON object.');
  }

  const seriesState =
    payload?.data?.seriesState ||
    payload?.seriesState ||
    payload;

  const games = Array.isArray(seriesState.games)
    ? seriesState.games
    : seriesState.map || seriesState.rounds || seriesState.segments
      ? [seriesState]
      : [];

  if (games.length === 0) {
    throw new Error('GRID payload missing `games` array (expected GRID Series State schema).');
  }

  const game = games[0];
  const mapName = getMapSpec(game?.map?.name || game?.mapName || 'Ascent').id;
  const rawTeams = Array.isArray(game.teams) && game.teams.length >= 2
    ? game.teams
    : Array.isArray(seriesState.teams) && seriesState.teams.length >= 2
      ? seriesState.teams
      : null;

  if (!rawTeams) {
    throw new Error('GRID payload must include at least two teams.');
  }

  const teams = rawTeams.slice(0, 2).map((t, idx) => ({
    id: String(t.id || `team-${idx + 1}`),
    name: String(t.name || `Team ${idx + 1}`),
    tag: String(t.tag || t.shortName || (t.name || `T${idx + 1}`).slice(0, 3).toUpperCase()),
    score: Number(t.score ?? 0),
    color: t.color || (idx === 0 ? '#00AEEF' : '#FF4655'),
    players: (Array.isArray(t.players) ? t.players : []).map((p, pIdx) => ({
      id: String(p.id || `${t.id || idx}-p${pIdx + 1}`),
      name: String(p.name || `Player ${pIdx + 1}`),
      teamId: String(t.id || `team-${idx + 1}`),
      teamTag: String(t.tag || (t.name || `T${idx + 1}`).slice(0, 3).toUpperCase()),
      agent: String(p.character?.name || p.agent || 'Unknown'),
      role: String(p.role || 'Flex')
    }))
  }));

  const playersById = new Map();
  for (const team of teams) {
    for (const p of team.players) {
      playersById.set(p.id, p);
    }
  }

  const rawRounds = Array.isArray(game.rounds)
    ? game.rounds
    : Array.isArray(game.segments)
      ? game.segments
      : [];

  if (rawRounds.length === 0) {
    throw new Error('GRID payload contains zero rounds/segments to analyze.');
  }

  const rounds = [];
  const allUtilityEvents = [];
  const allWeaponPurchases = [];
  const allKills = [];

  for (let i = 0; i < rawRounds.length; i++) {
    const r = rawRounds[i];
    const roundNumber = Number(r.sequenceNumber ?? r.roundNumber ?? i + 1);
    const attackingTeamId = String(r.attackingTeamId || (roundNumber <= 12 ? teams[0].id : teams[1].id));
    const defendingTeamId = String(r.defendingTeamId || (attackingTeamId === teams[0].id ? teams[1].id : teams[0].id));
    const winningTeamId = String(r.winningTeamId || r.winnerTeamId || teams[0].id);

    const purchases = (Array.isArray(r.weaponPurchases) ? r.weaponPurchases : Array.isArray(r.inventory) ? r.inventory : []).map((wp) => {
      const player = playersById.get(String(wp.playerId));
      const teamId = String(wp.teamId || player?.teamId || teams[0].id);
      const side = wp.side || (teamId === attackingTeamId ? 'attack' : 'defense');
      const creditsBeforeBuy = Number(wp.creditsBeforeBuy ?? wp.bank ?? wp.money ?? 4700);
      const weapon = String(wp.weapon || wp.weaponName || 'Vandal');
      const armor = String(wp.armor || 'Heavy Shields');
      const isOperator = weapon.toLowerCase().includes('operator');
      const isGlassCannon =
        typeof wp.isGlassCannon === 'boolean'
          ? wp.isGlassCannon
          : isOperator && (creditsBeforeBuy < 4700 || armor.toLowerCase() === 'none');
      const record = {
        roundNumber,
        playerId: String(wp.playerId || 'unknown'),
        playerName: player?.name || String(wp.playerName || wp.playerId || 'Unknown'),
        teamId,
        side,
        weapon,
        weaponCost: Number(wp.weaponCost ?? (isOperator ? 4700 : 2900)),
        armor,
        creditsBeforeBuy,
        isOperator,
        isGlassCannon
      };
      allWeaponPurchases.push(record);
      return record;
    });

    const utilities = (Array.isArray(r.utilityEvents) ? r.utilityEvents : Array.isArray(r.abilities) ? r.abilities : []).map((u, uIdx) => {
      const player = playersById.get(String(u.playerId));
      const teamId = String(u.teamId || player?.teamId || teams[0].id);
      const side = u.side || (teamId === attackingTeamId ? 'attack' : 'defense');
      const coord = normalizeCoordinate(mapName, u.coordinates || u.position || { x: u.x, y: u.y });
      const callout = resolveCallout(mapName, coord.x, coord.y);
      const timestampSec = clampTime(u.timestampSec ?? u.timeSec ?? u.clockSec ?? 30);
      const category = classifyAbility(u.abilityName || u.ability, u.category);
      const record = {
        id: String(u.id || `u-r${roundNumber}-${uIdx + 1}`),
        roundNumber,
        timestampSec,
        phase: inferRoundPhase(timestampSec),
        teamId,
        side,
        playerId: String(u.playerId || 'unknown'),
        playerName: String(u.playerName || player?.name || 'Unknown'),
        agent: String(u.agent || player?.agent || 'Unknown'),
        abilityName: String(u.abilityName || u.ability || 'Utility'),
        category,
        setupId: String(u.setupId || `${side}-${category}-${callout.id}`),
        setupName: String(u.setupName || `${callout.name} ${ABILITY_CATEGORIES[category].label.split(' ')[0]}`),
        x: coord.x,
        y: coord.y,
        callout: callout.name,
        calloutId: callout.id,
        site: callout.site,
        roundWon: teamId === winningTeamId
      };
      allUtilityEvents.push(record);
      return record;
    });

    const kills = (Array.isArray(r.kills) ? r.kills : []).map((k, kIdx) => {
      const killer = playersById.get(String(k.killerId));
      const victim = playersById.get(String(k.victimId));
      const killerTeamId = String(k.killerTeamId || killer?.teamId || teams[0].id);
      const victimTeamId = String(k.victimTeamId || victim?.teamId || teams[1].id);
      const attackerPos = normalizeCoordinate(mapName, k.attackerPosition || k.killerCoordinates || { x: 500, y: 500 });
      const victimPos = normalizeCoordinate(mapName, k.victimPosition || k.victimCoordinates || { x: 500, y: 500 });
      const callout = resolveCallout(mapName, attackerPos.x, attackerPos.y);
      const record = {
        id: String(k.id || `k-r${roundNumber}-${kIdx + 1}`),
        roundNumber,
        timestampSec: clampTime(k.timestampSec ?? k.timeSec ?? 25),
        killerId: String(k.killerId || 'unknown'),
        killerName: String(k.killerName || killer?.name || 'Unknown'),
        killerTeamId,
        killerSide: k.killerSide || (killerTeamId === attackingTeamId ? 'attack' : 'defense'),
        victimId: String(k.victimId || 'unknown'),
        victimName: String(k.victimName || victim?.name || 'Unknown'),
        victimTeamId,
        weapon: String(k.weapon || 'Vandal'),
        victimWeapon: k.victimWeapon ? String(k.victimWeapon) : null,
        firstBlood: Boolean(k.firstBlood),
        traded: Boolean(k.traded),
        roleTag: k.roleTag || (callout.role === 'roam' ? 'roam' : 'anchor'),
        angleName: String(k.angleName || `${callout.name} Sightline`),
        attackerPosition: attackerPos,
        victimPosition: victimPos,
        callout: callout.name
      };
      allKills.push(record);
      return record;
    });

    rounds.push({
      roundNumber,
      attackingTeamId,
      defendingTeamId,
      winningTeamId,
      winCondition: String(r.winCondition || 'elimination'),
      plantSite: String(r.plantSite || 'A'),
      weaponPurchases: purchases,
      utilityEvents: utilities,
      kills
    });
  }

  // Recompute accurate final scores from rounds if missing
  for (const team of teams) {
    const computedScore = rounds.filter((r) => r.winningTeamId === team.id).length;
    if (computedScore > 0) team.score = computedScore;
  }

  return {
    meta: {
      seriesId: String(seriesState.id || 'custom-grid-series'),
      schemaVersion: String(seriesState.schemaVersion || 'grid-series-state'),
      tournament: String(seriesState.tournament?.name || 'Custom GRID Import'),
      startedAt: String(seriesState.startedAt || new Date().toISOString()),
      mapName,
      totalRounds: rounds.length
    },
    teams,
    players: Array.from(playersById.values()),
    rounds,
    utilityEvents: allUtilityEvents,
    weaponPurchases: allWeaponPurchases,
    kills: allKills
  };
}

export function getPreset(presetId = 'c9-sen-ascent') {
  return parseGridSeriesState(getRawPresetJson(presetId));
}
