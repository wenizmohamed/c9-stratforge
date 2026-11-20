/**
 * Deterministic round spending and force-buy proxy for raw GRID Series State data.
 * See README.md for thresholds, eligibility and telemetry limitations.
 */

const TEAM_SIZE = 5;
const FULL_BUY_CREDITS = 3900;
const FORCE_SPEND_CREDITS = 2000;

function id(value) {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value))) return null;
  return String(value).trim() === '' ? null : String(value);
}

function credits(value) {
  if (typeof value === 'string') {
    value = value.trim();
    if (!/^[0-9]+$/.test(value)) return null;
  } else if (typeof value !== 'number') return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function roundIdentity(round) {
  const values = ['sequenceNumber', 'roundNumber']
    .filter((key) => Object.prototype.hasOwnProperty.call(round, key))
    .map((key) => round[key]);
  const parsed = values.map((value) => credits(value));
  const candidates = [...new Set(parsed.filter((number) => number !== null && number > 0))];
  const number = parsed.length && parsed.every((value) => value !== null && value > 0) && candidates.length === 1
    ? candidates[0] : null;
  return { number, candidates };
}

function roundWinner(round) {
  const values = round == null ? [] : ['winningTeamId', 'winnerTeamId']
    .filter((key) => Object.prototype.hasOwnProperty.call(round, key))
    .map((key) => round[key]);
  const winners = values.map(id);
  return winners.length && winners.every((winner) => winner !== null && winner === winners[0]) ? winners[0] : null;
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function averageCredits(values) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  const size = BigInt(TEAM_SIZE);
  return Number(total / size) + Number(total % size) / TEAM_SIZE;
}

function resolveRoundPlayerTeams(round, playerTeams) {
  const resolved = new Map(playerTeams);
  const records = Array.isArray(round.weaponPurchases) ? round.weaponPurchases : [];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const playerId = id(record.playerId);
    const teamId = id(record.teamId);
    if (!playerId) continue;
    if (!teamId) {
      if (record.teamId != null) {
        resolved.set(playerId, null);
      }
      continue;
    }
    const existing = resolved.get(playerId);
    resolved.set(playerId, existing === undefined || existing === teamId ? teamId : null);
  }
  return resolved;
}

function analyzeTeamRound(round, number, team, teamIds, playerTeams, previous) {
  const records = Array.isArray(round.weaponPurchases) ? round.weaponPurchases : [];
  const players = new Map();
  let duplicate = false;
  let invalidPlayer = false;

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const playerId = id(record.playerId);
    if (!playerId && id(record.teamId) === team.teamId) invalidPlayer = true;
    const rosterTeam = playerTeams.get(playerId);
    if (rosterTeam === null) {
      if (id(record.teamId) === team.teamId) invalidPlayer = true;
      continue;
    }
    const recordTeam = id(record.teamId) ?? rosterTeam;
    if (!playerId || recordTeam !== team.teamId || (rosterTeam && rosterTeam !== recordTeam)) continue;
    if (players.has(playerId)) duplicate = true;
    else players.set(playerId, record);
  }

  const complete = !duplicate && !invalidPlayer && players.size === TEAM_SIZE;
  const banks = [...players.values()].map((record) => credits(record.creditsBeforeBuy));
  const remaining = [...players.values()].map((record) => credits(record.creditsRemaining));
  const bankKnown = complete && banks.every((bank) => bank !== null);
  const spendKnown = bankKnown && remaining.every((amount, index) => amount !== null && amount <= banks[index]);
  const averageCreditsBeforeBuy = bankKnown ? averageCredits(banks) : null;
  const averageCreditsSpent = spendKnown
    ? averageCredits(banks.map((bank, index) => bank - remaining[index]))
    : null;

  const winner = roundWinner(round);
  const won = teamIds.has(winner) ? winner === team.teamId : null;
  const reset = number === 1 || number === 13 || (number !== null && number >= 25);
  let forceBuyOpportunity = null;
  if (reset || (averageCreditsBeforeBuy !== null && averageCreditsBeforeBuy >= FULL_BUY_CREDITS)) {
    forceBuyOpportunity = false;
  } else if (number !== null && previous && previous.roundNumber === number - 1 && previous.won !== null) {
    if (previous.won) forceBuyOpportunity = false;
    else if (averageCreditsBeforeBuy !== null && averageCreditsSpent !== null) forceBuyOpportunity = true;
  }
  const forceBuy = forceBuyOpportunity === true ? averageCreditsSpent >= FORCE_SPEND_CREDITS : null;

  let buyType = 'unknown';
  if (number === 1 || number === 13) buyType = 'pistol';
  else if (averageCreditsSpent !== null) {
    if (forceBuy) buyType = 'force';
    else if (averageCreditsSpent >= FULL_BUY_CREDITS) buyType = 'full';
    else if (averageCreditsSpent >= FORCE_SPEND_CREDITS) buyType = 'partial';
    else buyType = 'eco';
  }

  return {
    teamId: team.teamId,
    teamName: team.teamName,
    observedPlayers: players.size,
    averageCreditsBeforeBuy,
    averageCreditsSpent,
    buyType,
    won,
    forceBuyOpportunity,
    forceBuy
  };
}

function summarizeTeam(team, rounds) {
  const entries = rounds.map((round) => round.teams.find((entry) => entry.teamId === team.teamId));
  const opportunities = entries.filter((entry) => entry.forceBuyOpportunity === true);
  const forceBuys = opportunities.filter((entry) => entry.forceBuy);
  const outcomes = forceBuys.filter((entry) => entry.won !== null);
  const wins = outcomes.filter((entry) => entry.won).length;
  return {
    ...team,
    roundsWithEconomy: entries.filter((entry) => entry.averageCreditsSpent !== null).length,
    forceBuyOpportunities: opportunities.length,
    forceBuys: forceBuys.length,
    forceBuyRate: percent(forceBuys.length, opportunities.length),
    forceBuyRoundsWithOutcome: outcomes.length,
    forceBuyWins: wins,
    forceBuyWinRate: percent(wins, outcomes.length)
  };
}

/** Analyze every game in an unmodified GRID GraphQL Series State JSON payload. */
export function analyzeRoundEconomy(rawInput) {
  let payload = rawInput;
  if (typeof rawInput === 'string') {
    try {
      payload = JSON.parse(rawInput);
    } catch (error) {
      throw new Error(`Invalid JSON syntax: ${error.message}`);
    }
  }
  const series = payload?.data?.seriesState;
  if (!Array.isArray(series?.games)) {
    throw new Error('GRID payload missing `data.seriesState.games` array.');
  }

  return {
    games: series.games.map((game) => {
      game = game || {};
      const rawTeams = game.teams == null ? series.teams : game.teams;
      const teamSource = Array.isArray(rawTeams) ? rawTeams.filter((team) => team && id(team.id)) : [];
      const teamCounts = new Map();
      for (const team of teamSource) {
        const teamId = id(team.id);
        teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
      }
      const teams = teamSource
        .filter((team) => teamCounts.get(id(team.id)) === 1)
        .map((team) => ({ teamId: id(team.id), teamName: String(team.name ?? team.id) }));
      const teamIds = new Set(teams.map((team) => team.teamId));
      const playerTeams = new Map();
      for (const team of teamSource) {
        const seriesTeams = Array.isArray(series.teams)
          ? series.teams.filter((candidate) => candidate && id(candidate.id) === id(team.id))
          : [];
        const roster = team.players == null && seriesTeams.length === 1 ? seriesTeams[0].players : team.players;
        for (const player of Array.isArray(roster) ? roster : []) {
          const playerId = id(player?.id);
          const teamId = id(team.id);
          if (playerId) {
            const existing = playerTeams.get(playerId);
            playerTeams.set(playerId, existing === undefined || existing === teamId ? teamId : null);
          }
        }
      }

      const rawRounds = Array.isArray(game.rounds) ? game.rounds : [];
      const roundsByNumber = new Map();
      const identities = rawRounds.map((round) => roundIdentity(round || {}));
      for (const [index, identity] of identities.entries()) {
        for (const candidate of identity.candidates) {
          const unique = identity.number !== null && !roundsByNumber.has(candidate);
          roundsByNumber.set(candidate, unique ? rawRounds[index] : null);
        }
      }
      const rounds = rawRounds.map((rawRound, index) => {
        const round = rawRound || {};
        const number = identities[index].number;
        const preceding = number !== null && roundsByNumber.get(number) ? roundsByNumber.get(number - 1) : null;
        const winner = roundWinner(preceding);
        const roundPlayerTeams = resolveRoundPlayerTeams(round, playerTeams);
        const entries = teams.map((team) => analyzeTeamRound(round, number, team, teamIds, roundPlayerTeams, preceding && {
          roundNumber: number - 1,
          won: teamIds.has(winner) ? winner === team.teamId : null
        }));
        return { roundNumber: number, teams: entries };
      });
      const summaryRounds = rounds.filter((round) => round.roundNumber !== null && roundsByNumber.get(round.roundNumber));

      return {
        gameId: id(game.id),
        mapName: game.map?.name ?? game.mapName ?? null,
        rounds,
        teams: teams.map((team) => summarizeTeam(team, summaryRounds))
      };
    })
  };
}