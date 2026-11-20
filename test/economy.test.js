import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRoundEconomy } from '../src/economy.js';
import { getRawPresetJson } from '../src/gridParser.js';

const teams = ['a', 'b'].map((id) => ({
  id,
  name: id.toUpperCase(),
  players: Array.from({ length: 5 }, (_, i) => ({ id: `${id}${i}` }))
}));

function purchases(teamId, bank, remaining) {
  return teams.find((team) => team.id === teamId).players.map((player) => ({
    playerId: player.id, teamId, creditsBeforeBuy: bank, creditsRemaining: remaining
  }));
}

function round(sequenceNumber, winningTeamId, aBank, aRemaining, bBank = 5000, bRemaining = 1000) {
  return {
    sequenceNumber,
    winningTeamId,
    weaponPurchases: [...purchases('a', aBank, aRemaining), ...purchases('b', bBank, bRemaining)]
  };
}

function payload(rounds) {
  return { data: { seriesState: { games: [{ id: 'g1', map: { name: 'Ascent' }, teams, rounds }] } } };
}

test('reports spending tiers and force-buy rates after qualifying losses', () => {
  const input = payload([
    round(1, 'b', 800, 100),
    round(2, 'a', 3000, 400),
    round(3, 'b', 5000, 1000),
    round(4, 'b', 3000, 2500)
  ]);
  const snapshot = structuredClone(input);
  const report = analyzeRoundEconomy(input);
  const game = report.games[0];
  const a = game.rounds.map((r) => r.teams[0]);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(analyzeRoundEconomy(JSON.stringify(input)), report);
  assert.equal(game.gameId, 'g1');
  assert.equal(game.mapName, 'Ascent');
  assert.equal(a[0].buyType, 'pistol');
  assert.equal(a[1].averageCreditsBeforeBuy, 3000);
  assert.equal(a[1].averageCreditsSpent, 2600);
  assert.equal(a[1].buyType, 'force');
  assert.equal(a[1].forceBuyOpportunity, true);
  assert.equal(a[1].forceBuy, true);
  assert.equal(a[2].buyType, 'full');
  assert.equal(a[2].forceBuyOpportunity, false);
  assert.equal(a[3].buyType, 'eco');
  assert.equal(a[3].forceBuy, false);
  assert.deepEqual(game.teams[0], {
    teamId: 'a', teamName: 'A', roundsWithEconomy: 4,
    forceBuyOpportunities: 2, forceBuys: 1, forceBuyRate: 50,
    forceBuyRoundsWithOutcome: 1, forceBuyWins: 1, forceBuyWinRate: 100
  });
});

test('unknown, invalid, partial and duplicate economy records never produce invented totals', () => {
  const missing = round(2, 'a', 3000, 500);
  delete missing.weaponPurchases[0].creditsRemaining;
  const invalid = round(3, 'b', 3000, 500);
  invalid.weaponPurchases[0].creditsBeforeBuy = null;
  invalid.weaponPurchases[1].creditsRemaining = 4000;
  const duplicate = round(4, 'a', 3000, 500);
  duplicate.weaponPurchases.push({ ...duplicate.weaponPurchases[0] });
  const incomplete = round(5, 'a', 3000, 500);
  incomplete.weaponPurchases.shift();
  const game = analyzeRoundEconomy(payload([round(1, 'b', 800, 100), missing, invalid, duplicate, incomplete])).games[0];
  const a = game.rounds.map((r) => r.teams[0]);
  assert.equal(a[1].averageCreditsBeforeBuy, 3000);
  assert.equal(a[1].averageCreditsSpent, null);
  assert.equal(a[1].forceBuyOpportunity, null);
  for (const entry of a.slice(2)) {
    assert.equal(entry.buyType, 'unknown');
    assert.equal(entry.averageCreditsSpent, null);
    assert.equal(entry.forceBuy, null);
  }
  assert.equal(a[3].averageCreditsBeforeBuy, null);
  assert.equal(a[4].averageCreditsBeforeBuy, null);
  assert.equal(game.teams[0].forceBuyOpportunities, 0);
  assert.equal(game.teams[0].forceBuyRate, null);
});

test('requires a consecutive known loss and excludes resets, overtime and unknown outcomes', () => {
  const rounds = [
    round(11, 'b', 4000, 2000), round(13, 'a', 800, 100),
    round(14, 'b', 3000, 500), round(16, 'b', 3000, 500),
    round(17, null, 3000, 500), round(18, 'a', 3000, 500),
    round(24, 'b', 3000, 500), round(25, 'b', 3000, 500),
    round(26, 'a', 3000, 500)
  ];
  const entries = analyzeRoundEconomy(payload(rounds)).games[0].rounds.map((r) => r.teams[0]);
  assert.equal(entries[1].buyType, 'pistol');
  assert.equal(entries[1].forceBuyOpportunity, false);
  assert.equal(entries[2].forceBuyOpportunity, false);
  assert.equal(entries[3].forceBuyOpportunity, null);
  assert.equal(entries[4].won, null);
  assert.equal(entries[4].forceBuy, true);
  assert.equal(entries[5].forceBuyOpportunity, null);
  assert.equal(entries[7].forceBuyOpportunity, false);
  assert.equal(entries[8].forceBuyOpportunity, false);
});

test('handles all games, roster-based team IDs and unavailable fields without mutation', () => {
  const raw = getRawPresetJson();
  const game = structuredClone(raw.data.seriesState.games[0]);
  game.id = 'second';
  game.rounds[1].weaponPurchases[0].teamId = undefined;
  raw.data.seriesState.games.push(game);
  const report = analyzeRoundEconomy(raw);
  assert.equal(report.games.length, 2);
  assert.equal(report.games[1].gameId, 'second');
  assert.equal(report.games[1].rounds[1].teams[0].observedPlayers, 5);
  assert.equal(report.games[0].rounds.length, raw.data.seriesState.games[0].rounds.length);
  assert.throws(() => analyzeRoundEconomy({}), /seriesState\.games/);
  assert.throws(() => analyzeRoundEconomy('{'), /Invalid JSON/);
});

test('calculates preset economy from raw purchases and leaves incomplete spending unknown', () => {
  const raw = getRawPresetJson();
  const game = raw.data.seriesState.games[0];
  const teamId = game.teams[0].id;
  const purchases = game.rounds[1].weaponPurchases.filter((purchase) => purchase.teamId === teamId);
  assert.equal(purchases.length, 5);
  const expectedBank = purchases.reduce((sum, purchase) => sum + purchase.creditsBeforeBuy, 0) / 5;
  const expectedSpend = purchases.reduce((sum, purchase) => sum + purchase.creditsBeforeBuy - purchase.creditsRemaining, 0) / 5;
  const snapshot = structuredClone(raw);
  const report = analyzeRoundEconomy(raw).games[0];
  const observation = report.rounds[1].teams.find((team) => team.teamId === teamId);
  assert.equal(observation.averageCreditsBeforeBuy, expectedBank);
  assert.equal(observation.averageCreditsSpent, expectedSpend);
  assert.deepEqual(raw, snapshot);

  delete purchases[0].creditsRemaining;
  const incomplete = analyzeRoundEconomy(raw).games[0];
  const incompleteObservation = incomplete.rounds[1].teams.find((team) => team.teamId === teamId);
  assert.equal(incompleteObservation.averageCreditsBeforeBuy, expectedBank);
  assert.equal(incompleteObservation.averageCreditsSpent, null);
  assert.equal(incomplete.teams.find((team) => team.teamId === teamId).roundsWithEconomy,
    report.teams.find((team) => team.teamId === teamId).roundsWithEconomy - 1);
});

test('treats missing or malformed purchase containers as unobservable economy', () => {
  for (const value of [undefined, null, [], {}, 'invalid', [null, 1, 'invalid']]) {
    const current = round(2, 'a', 3000, 1000);
    current.weaponPurchases = value;
    const game = analyzeRoundEconomy(payload([round(1, 'b', 800, 100), current])).games[0];
    for (const team of game.rounds[1].teams) {
      assert.equal(team.observedPlayers, 0);
      assert.equal(team.averageCreditsBeforeBuy, null);
      assert.equal(team.averageCreditsSpent, null);
      assert.equal(team.buyType, 'unknown');
      assert.equal(team.forceBuyOpportunity, team.teamId === 'a' ? null : false);
      assert.equal(team.forceBuy, null);
    }
  }
});

test('does not replace an explicitly empty game team list with series teams', () => {
  const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
  const series = data.data.seriesState;
  series.teams = structuredClone(teams);
  series.games[0].teams = [];
  const snapshot = structuredClone(data);

  const game = analyzeRoundEconomy(data).games[0];
  assert.deepEqual(data, snapshot);
  assert.deepEqual(game.teams, []);
  assert.deepEqual(game.rounds.map((entry) => entry.teams), [[], []]);

  series.games[0].teams = { id: 'a' };
  assert.deepEqual(analyzeRoundEconomy(data).games[0].teams, []);
  series.games[0].teams = null;
  assert.equal(analyzeRoundEconomy(data).games[0].teams[0].forceBuyRate, 100);
  delete series.games[0].teams;
  assert.equal(analyzeRoundEconomy(data).games[0].teams[0].forceBuyRate, 100);
});

test('excludes duplicate team identifiers and does not infer their outcomes', () => {
  const data = payload([
    round(1, 'a', 800, 100, 800, 100),
    round(2, 'b', 3000, 1000, 3000, 1000)
  ]);
  const game = data.data.seriesState.games[0];
  game.teams = [structuredClone(teams[0]), structuredClone(teams[1]), structuredClone(teams[0])];
  const snapshot = structuredClone(data);

  const report = analyzeRoundEconomy(data).games[0];
  assert.deepEqual(data, snapshot);
  assert.deepEqual(report.teams.map((team) => team.teamId), ['b']);
  assert.equal(report.rounds[0].teams[0].won, null);
  assert.equal(report.rounds[1].teams[0].won, true);
  assert.equal(report.rounds[1].teams[0].forceBuyOpportunity, null);
  assert.equal(report.teams[0].forceBuyOpportunities, 0);
});

test('duplicate series team identities still contribute to player conflicts', () => {
  const data = payload([round(1, 'a', 800, 100, 800, 100), round(2, 'b', 3000, 1000, 3000, 1000)]);
  const series = data.data.seriesState;
  series.teams = structuredClone(teams);
  series.teams[0].id = 1;
  const duplicate = structuredClone(series.teams[0]);
  duplicate.id = '1';
  duplicate.players[0].id = 'b0';
  series.teams.push(duplicate);
  delete series.games[0].teams;
  series.games[0].rounds[0].winningTeamId = 1;

  const report = analyzeRoundEconomy(data).games[0];
  assert.deepEqual(report.teams.map((team) => team.teamId), ['b']);
  assert.equal(report.rounds[0].teams[0].won, null);
  assert.equal(report.rounds[1].teams[0].observedPlayers, 4);
  assert.equal(report.rounds[1].teams[0].averageCreditsSpent, null);
});

test('uses series rosters only when game team rosters are unavailable', () => {
  const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
  const series = data.data.seriesState;
  series.teams = structuredClone(teams);
  const game = series.games[0];
  game.teams = structuredClone(teams);
  delete game.teams[0].players;
  for (const entry of game.rounds) {
    entry.weaponPurchases.forEach((purchase) => delete purchase.teamId);
  }
  const snapshot = structuredClone(data);
  const report = analyzeRoundEconomy(data).games[0];
  assert.deepEqual(data, snapshot);
  assert.equal(report.rounds[1].teams[0].averageCreditsSpent, 2000);
  assert.equal(report.rounds[1].teams[0].forceBuy, true);
  assert.equal(report.teams[0].forceBuyOpportunities, 1);

  // An explicitly empty game roster must not inherit potentially stale series players.
  game.teams[0].players = [];
  const emptyRoster = analyzeRoundEconomy(data).games[0];
  assert.equal(emptyRoster.rounds[1].teams[0].observedPlayers, 0);
  assert.equal(emptyRoster.rounds[1].teams[0].averageCreditsSpent, null);
});

test('excludes conflicting or ambiguous series roster fallbacks', () => {
  const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
  const series = data.data.seriesState;
  series.teams = structuredClone(teams);
  const game = series.games[0];
  game.teams = structuredClone(teams);
  game.teams[0].players = null;
  game.teams[1].players[0].id = 'a0';
  const conflicting = analyzeRoundEconomy(data).games[0];
  assert.equal(conflicting.rounds[1].teams[0].observedPlayers, 4);
  assert.equal(conflicting.rounds[1].teams[0].averageCreditsSpent, null);

  game.teams[1] = structuredClone(teams[1]);
  series.teams.push(structuredClone(series.teams[0]));
  for (const entry of game.rounds) {
    entry.weaponPurchases.forEach((purchase) => delete purchase.teamId);
  }
  const duplicateTeam = analyzeRoundEconomy(data).games[0];
  assert.equal(duplicateTeam.rounds[1].teams[0].observedPlayers, 0);
  assert.equal(duplicateTeam.rounds[1].teams[0].forceBuyOpportunity, null);
});

test('uses exact spending thresholds and excludes unobservable round sequences', () => {
  const noNumber = round(3, 'b', 3000, 1000);
  delete noNumber.sequenceNumber;
  const data = payload([
    round(1, 'b', 800, 100),
    round(2, 'b', 3000, 1000),
    noNumber,
    round(4, 'b', 3900, 0),
    round(5, 'b', 3899, 1900),
    round(6, 'a', 3899, 1899)
  ]);
  data.data.seriesState.teams = teams;
  delete data.data.seriesState.games[0].teams;
  const game = analyzeRoundEconomy(data).games[0];
  const a = game.rounds.map((r) => r.teams[0]);
  assert.equal(a[1].forceBuy, true);
  assert.equal(a[1].averageCreditsSpent, 2000);
  assert.equal(game.rounds[2].roundNumber, null);
  assert.equal(a[2].forceBuyOpportunity, null);
  assert.equal(a[3].buyType, 'full');
  assert.equal(a[3].forceBuyOpportunity, false);
  assert.equal(a[4].buyType, 'eco');
  assert.equal(a[4].forceBuy, false);
  assert.equal(a[5].buyType, 'force');
  assert.equal(game.teams[0].forceBuyOpportunities, 3);
  assert.equal(game.teams[0].forceBuyRate, 66.7);
});

test('classifies fractional average spending at force and full-buy boundaries', () => {
  const cases = [
    { bank: 3000, spend: 2000, adjustment: -1, expected: 1999.8, type: 'eco', force: false },
    { bank: 3000, spend: 2000, adjustment: 0, expected: 2000, type: 'force', force: true },
    { bank: 3000, spend: 2000, adjustment: 1, expected: 2000.2, type: 'force', force: true },
    { bank: 5000, spend: 3900, adjustment: -1, expected: 3899.8, type: 'partial', force: null },
    { bank: 5000, spend: 3900, adjustment: 0, expected: 3900, type: 'full', force: null },
    { bank: 5000, spend: 3900, adjustment: 1, expected: 3900.2, type: 'full', force: null }
  ];
  for (const { bank, spend, adjustment, expected, type, force } of cases) {
    const current = round(2, 'a', bank, bank - spend);
    current.weaponPurchases[0].creditsRemaining -= adjustment;
    const entry = analyzeRoundEconomy(payload([round(1, 'b', 800, 100), current])).games[0].rounds[1].teams[0];
    assert.equal(entry.averageCreditsSpent, expected);
    assert.equal(entry.buyType, type);
    assert.equal(entry.forceBuy, force);
  }
});

test('excludes unknown outcomes from force-buy win rate and rejects malformed credit values', () => {
  const invalid = round(4, 'b', 3000, 1000);
  invalid.weaponPurchases[0].creditsBeforeBuy = -1;
  const game = analyzeRoundEconomy(payload([
    round(1, 'b', 800, 100),
    round(2, null, 3000, 1000),
    round(3, 'b', 3000, 1000),
    invalid,
    round(5, 'a', 3000, 1000)
  ])).games[0];
  assert.equal(game.rounds[3].teams[0].averageCreditsBeforeBuy, null);
  assert.equal(game.teams[0].forceBuyOpportunities, 2);
  assert.equal(game.teams[0].forceBuys, 2);
  assert.equal(game.teams[0].forceBuyRoundsWithOutcome, 1);
  assert.equal(game.teams[0].forceBuyWinRate, 100);
});

test('calculates force-buy win rates using only known outcomes', () => {
  const game = analyzeRoundEconomy(payload([
    round(1, 'b', 800, 100), round(2, 'b', 3000, 1000),
    round(3, 'a', 3000, 1000), round(4, 'b', 3000, 1000),
    round(5, null, 3000, 1000), round(6, 'b', 3000, 1000),
    round(7, 'b', 3000, 1000)
  ])).games[0];
  assert.equal(game.teams[0].forceBuyOpportunities, 4);
  assert.equal(game.teams[0].forceBuys, 4);
  assert.equal(game.teams[0].forceBuyRoundsWithOutcome, 3);
  assert.equal(game.teams[0].forceBuyWins, 1);
  assert.equal(game.teams[0].forceBuyWinRate, 33.3);

  const unknown = analyzeRoundEconomy(payload([
    round(1, 'b', 800, 100), round(2, null, 3000, 1000)
  ])).games[0].teams[0];
  assert.equal(unknown.forceBuys, 1);
  assert.equal(unknown.forceBuyRoundsWithOutcome, 0);
  assert.equal(unknown.forceBuyWinRate, null);
});

test('uses numbered rounds rather than array order for preceding outcomes', () => {
  const data = payload([
    round(3, 'a', 3000, 1000),
    round(1, 'b', 800, 100),
    round(2, 'b', 3000, 1000)
  ]);
  const snapshot = structuredClone(data);
  const game = analyzeRoundEconomy(data).games[0];
  assert.deepEqual(data, snapshot);
  assert.deepEqual(game.rounds.map((entry) => entry.roundNumber), [3, 1, 2]);
  assert.equal(game.rounds[0].teams[0].forceBuy, true);
  assert.equal(game.rounds[2].teams[0].forceBuy, true);
  assert.equal(game.teams[0].forceBuyOpportunities, 2);
});

test('does not infer force buys from ambiguous duplicate round numbers', () => {
  const game = analyzeRoundEconomy(payload([
    round(1, 'b', 800, 100),
    round(2, 'b', 3000, 1000),
    round(2, 'a', 3000, 1000),
    round(3, 'a', 3000, 1000)
  ])).games[0];
  for (const entry of game.rounds.slice(1)) {
    assert.equal(entry.teams[0].forceBuyOpportunity, null);
    assert.equal(entry.teams[0].forceBuy, null);
  }
  assert.equal(game.teams[0].forceBuyOpportunities, 0);
});

test('counts only uniquely numbered rounds in economy summaries', () => {
  const missingNumber = round(null, 'a', 3000, 1000);
  const game = analyzeRoundEconomy(payload([
    round(2, 'b', 3000, 1000),
    round(1, 'b', 800, 100),
    missingNumber,
    round(2, 'a', 3000, 1000),
    round(3, 'a', 3000, 1000)
  ])).games[0];

  assert.equal(game.rounds.length, 5);
  assert.equal(game.rounds[0].teams[0].averageCreditsSpent, 2000);
  assert.equal(game.rounds[2].teams[0].averageCreditsSpent, 2000);
  assert.equal(game.teams[0].roundsWithEconomy, 2);
  assert.equal(game.teams[1].roundsWithEconomy, 2);
});

test('does not assign a player listed on both team rosters', () => {
  for (const explicitTeamId of [true, false]) {
    const data = payload([round(1, 'a', 800, 100), round(2, 'a', 3000, 1000, 3000, 1000)]);
    const game = data.data.seriesState.games[0];
    game.teams = structuredClone(teams);
    game.teams[1].players[0].id = 'a0';
    for (const entry of game.rounds) {
      entry.weaponPurchases = entry.weaponPurchases.filter((purchase) => purchase.playerId !== 'a0');
      const sharedPurchase = entry.weaponPurchases.find((purchase) => purchase.playerId === 'b0');
      sharedPurchase.playerId = 'a0';
      if (!explicitTeamId) delete sharedPurchase.teamId;
    }

    const report = analyzeRoundEconomy(data).games[0];
    const b = report.rounds[1].teams[1];
    assert.equal(b.observedPlayers, 4);
    assert.equal(b.averageCreditsSpent, null);
    assert.equal(b.forceBuyOpportunity, null);
    assert.equal(report.teams[1].forceBuyOpportunities, 0);
  }
});

test('excludes players assigned to conflicting teams by purchase records', () => {
  for (const withRosters of [true, false]) {
    const data = payload([round(1, 'b', 800, 100), round(2, 'b', 3000, 1000, 3000, 1000)]);
    const game = data.data.seriesState.games[0];
    game.teams = structuredClone(teams);
    if (!withRosters) game.teams.forEach((team) => delete team.players);
    game.rounds[1].weaponPurchases[5].playerId = 'a0';

    const report = analyzeRoundEconomy(data).games[0];
    for (const entry of report.rounds[1].teams) {
      assert.equal(entry.observedPlayers, 4);
      assert.equal(entry.averageCreditsSpent, null);
    }
    assert.equal(report.teams[0].forceBuyOpportunities, 0);
    assert.equal(report.rounds[0].teams[0].averageCreditsSpent, 700);
  }
});

test('excludes players whose purchase records conflict with an unlisted team', () => {
  for (const withRosters of [true, false]) {
    for (const outsiderFirst of [true, false]) {
      const data = payload([round(1, 'b', 800, 100), round(2, 'b', 3000, 1000)]);
      const game = data.data.seriesState.games[0];
      game.teams = structuredClone(teams);
      if (!withRosters) game.teams.forEach((team) => delete team.players);
      const records = game.rounds[1].weaponPurchases;
      const conflicting = { ...records[0], teamId: 'outsider' };
      if (outsiderFirst) records.unshift(conflicting);
      else records.push(conflicting);

      const report = analyzeRoundEconomy(data).games[0];
      assert.equal(report.rounds[1].teams[0].observedPlayers, 4);
      assert.equal(report.rounds[1].teams[0].averageCreditsSpent, null);
      assert.equal(report.rounds[1].teams[0].forceBuyOpportunity, null);
      assert.equal(report.teams[0].forceBuyOpportunities, 0);
    }
  }
});

test('does not coerce malformed identifiers into teams, players, or winners', () => {
  const invalidWinner = payload([round(1, ['b'], 800, 100), round(2, 'a', 3000, 1000)]);
  const winnerReport = analyzeRoundEconomy(invalidWinner).games[0];
  assert.equal(winnerReport.rounds[0].teams[1].won, null);
  assert.equal(winnerReport.rounds[1].teams[0].forceBuyOpportunity, null);

  const invalidPlayer = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
  invalidPlayer.data.seriesState.games[0].rounds[1].weaponPurchases[0].playerId = ['a0'];
  const playerReport = analyzeRoundEconomy(invalidPlayer).games[0];
  assert.equal(playerReport.rounds[1].teams[0].observedPlayers, 4);
  assert.equal(playerReport.rounds[1].teams[0].averageCreditsSpent, null);

  const invalidTeam = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
  invalidTeam.data.seriesState.games[0].rounds[1].weaponPurchases[0].teamId = ['a'];
  const teamReport = analyzeRoundEconomy(invalidTeam).games[0];
  assert.equal(teamReport.rounds[1].teams[0].observedPlayers, 4);
  assert.equal(teamReport.rounds[1].teams[0].averageCreditsSpent, null);
});

test('extra purchases with invalid player IDs invalidate only their explicitly assigned team', () => {
  for (const teamId of ['a', 'b']) {
    for (const playerId of [undefined, null, '', '  ', [], {}, true, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      for (const invalidFirst of [true, false]) {
        for (const withRosters of [true, false]) {
          const otherId = teamId === 'a' ? 'b' : 'a';
          const data = payload([round(1, otherId, 800, 100, 800, 100), round(2, teamId, 3000, 1000, 3000, 1000)]);
          const game = data.data.seriesState.games[0];
          game.teams = structuredClone(teams);
          if (!withRosters) game.teams.forEach((team) => delete team.players);
          const baseline = analyzeRoundEconomy(data).games[0];
          const extra = { playerId, teamId, creditsBeforeBuy: 3000, creditsRemaining: 1000 };
          if (invalidFirst) game.rounds[1].weaponPurchases.unshift(extra);
          else game.rounds[1].weaponPurchases.push(extra);
          const snapshot = structuredClone(data);
          const report = analyzeRoundEconomy(data).games[0];
          const entry = report.rounds[1].teams.find((team) => team.teamId === teamId);
          const summary = report.teams.find((team) => team.teamId === teamId);

          assert.deepEqual(data, snapshot);
          assert.equal(entry.observedPlayers, 5);
          assert.equal(entry.averageCreditsBeforeBuy, null);
          assert.equal(entry.averageCreditsSpent, null);
          assert.equal(entry.buyType, 'unknown');
          assert.equal(entry.forceBuyOpportunity, null);
          assert.equal(entry.forceBuy, null);
          assert.equal(summary.roundsWithEconomy, 1);
          assert.equal(summary.forceBuyOpportunities, 0);
          assert.equal(summary.forceBuys, 0);
          assert.deepEqual(report.rounds[1].teams.find((team) => team.teamId === otherId),
            baseline.rounds[1].teams.find((team) => team.teamId === otherId));
          assert.deepEqual(report.teams.find((team) => team.teamId === otherId),
            baseline.teams.find((team) => team.teamId === otherId));
        }
      }
    }
  }
});

test('extra purchases without an attributable listed team retain existing behavior', () => {
  for (const record of [null, 1, 'invalid', {}, { playerId: null },
    { playerId: null, teamId: null }, { playerId: [], teamId: ['a'] },
    { playerId: '', teamId: '' }, { playerId: null, teamId: 'outsider' }]) {
    const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
    const baseline = analyzeRoundEconomy(data);
    data.data.seriesState.games[0].rounds[1].weaponPurchases.push(record);
    assert.deepEqual(analyzeRoundEconomy(data), baseline);
  }
});

test('extra ambiguous players invalidate explicitly attributed teams even with five other players', () => {
  for (const reverse of [false, true]) {
    for (const otherTeam of ['b', 'outsider']) {
      for (const withRosters of [true, false]) {
        const data = payload([round(1, 'b', 800, 100, 800, 100), round(2, 'a', 3000, 1000, 3000, 1000)]);
        const rawGame = data.data.seriesState.games[0];
        rawGame.teams = structuredClone(teams);
        if (!withRosters) rawGame.teams.forEach((team) => delete team.players);
        const conflicting = [
          { playerId: 'extra', teamId: 'a', creditsBeforeBuy: 3000, creditsRemaining: 1000 },
          { playerId: 'extra', teamId: otherTeam, creditsBeforeBuy: 3000, creditsRemaining: 1000 }
        ];
        rawGame.rounds[1].weaponPurchases.push(...(reverse ? conflicting.reverse() : conflicting));
        const snapshot = structuredClone(data);
        const game = analyzeRoundEconomy(data).games[0];
        assert.deepEqual(data, snapshot);
        for (const entry of game.rounds[1].teams) {
          assert.equal(entry.observedPlayers, 5);
          const affected = entry.teamId === 'a' || otherTeam === 'b';
          assert.equal(entry.averageCreditsBeforeBuy, affected ? null : 3000);
          assert.equal(entry.averageCreditsSpent, affected ? null : 2000);
          assert.equal(entry.forceBuyOpportunity, entry.teamId === 'a' ? null : false);
        }
        for (const summary of game.teams) assert.equal(summary.forceBuyOpportunities, 0);
      }
    }
  }
});

test('invalid player IDs are attributed to normalized numeric team IDs without changing reset rules', () => {
  const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
  const game = data.data.seriesState.games[0];
  game.teams = structuredClone(teams);
  game.teams[0].id = 0;
  for (const entry of game.rounds) {
    if (entry.winningTeamId === 'a') entry.winningTeamId = 0;
    entry.weaponPurchases.filter((record) => record.teamId === 'a').forEach((record) => { record.teamId = '0'; });
    entry.weaponPurchases.push({ teamId: 0 });
  }
  const report = analyzeRoundEconomy(data).games[0];
  assert.equal(report.rounds[0].teams[0].averageCreditsSpent, null);
  assert.equal(report.rounds[0].teams[0].buyType, 'pistol');
  assert.equal(report.rounds[0].teams[0].forceBuyOpportunity, false);
  assert.equal(report.rounds[1].teams[0].averageCreditsSpent, null);
  assert.equal(report.rounds[1].teams[0].forceBuy, null);
  assert.equal(report.rounds[1].teams[1].averageCreditsSpent, 4000);
});

test('a malformed team assignment makes that player ambiguous even with another valid record', () => {
  for (const invalidId of [['a'], {}, true, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    for (const invalidFirst of [true, false]) {
      const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
      const records = data.data.seriesState.games[0].rounds[1].weaponPurchases;
      const invalid = { ...records[0], teamId: invalidId };
      if (invalidFirst) records.unshift(invalid);
      else records.push(invalid);
      const report = analyzeRoundEconomy(data).games[0];
      assert.equal(report.rounds[1].teams[0].observedPlayers, 4);
      assert.equal(report.rounds[1].teams[0].forceBuyOpportunity, null);
    }
  }
});

test('blank team assignments do not fall back to a roster or a valid duplicate', () => {
  for (const invalidId of ['', '  ']) {
    for (const duplicate of [false, true]) {
      const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
      const records = data.data.seriesState.games[0].rounds[1].weaponPurchases;
      if (duplicate) records.push({ ...records[0] });
      records[0].teamId = invalidId;
      const entry = analyzeRoundEconomy(data).games[0].rounds[1].teams[0];
      assert.equal(entry.observedPlayers, 4);
      assert.equal(entry.averageCreditsSpent, null);
      assert.equal(entry.forceBuyOpportunity, null);
    }
  }
});

test('accepts safe integer identifiers and absent team assignments', () => {
  const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
  const game = data.data.seriesState.games[0];
  game.teams = structuredClone(teams);
  const ids = { a: 0, b: 1 };
  for (const team of game.teams) {
    const teamId = ids[team.id];
    team.id = teamId;
    team.players.forEach((player, index) => { player.id = teamId * 5 + index; });
  }
  for (const entry of game.rounds) {
    entry.winningTeamId = ids[entry.winningTeamId];
    for (const record of entry.weaponPurchases) {
      const teamId = ids[record.teamId];
      record.playerId = teamId * 5 + Number(record.playerId.slice(1));
      record.teamId = teamId;
    }
    delete entry.weaponPurchases[0].teamId;
    entry.weaponPurchases[1].teamId = null;
  }
  const snapshot = structuredClone(data);
  const report = analyzeRoundEconomy(data).games[0];
  assert.deepEqual(data, snapshot);
  assert.equal(report.rounds[1].teams[0].averageCreditsSpent, 2000);
  assert.equal(report.rounds[1].teams[0].forceBuy, true);
  assert.equal(report.teams[0].teamId, '0');
});

test('averages safe integer credits without overflowing the intermediate total', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const input = payload([round(2, 'a', max, 0)]);
  const snapshot = structuredClone(input);
  const entry = analyzeRoundEconomy(input).games[0].rounds[0].teams[0];

  assert.deepEqual(input, snapshot);
  assert.equal(entry.averageCreditsBeforeBuy, max);
  assert.equal(entry.averageCreditsSpent, max);
});

test('averages varied credit values and preserves fractional results', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const large = round(2, 'a', max, 0);
  const fractional = round(3, 'a', 3000, 3000);
  [0, 1, 2, 3, 4].forEach((offset, index) => {
    large.weaponPurchases[index].creditsBeforeBuy -= offset;
  });
  [0, 1, 1, 2, 2].forEach((offset, index) => {
    fractional.weaponPurchases[index].creditsBeforeBuy += offset;
  });

  const rounds = analyzeRoundEconomy(payload([large, fractional])).games[0].rounds;
  assert.equal(rounds[0].teams[0].averageCreditsBeforeBuy, max - 2);
  assert.equal(rounds[0].teams[0].averageCreditsSpent, max - 2);
  assert.equal(rounds[1].teams[0].averageCreditsBeforeBuy, 3001.2);
  assert.equal(rounds[1].teams[0].averageCreditsSpent, 1.2);
});

test('rejects non-integer and non-decimal credit strings before numeric conversion', () => {
  for (const invalid of ['3899.9999999999999', '1e3', '0xBB8']) {
    const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
    data.data.seriesState.games[0].rounds[1].weaponPurchases[0].creditsBeforeBuy = invalid;
    const entry = analyzeRoundEconomy(data).games[0].rounds[1].teams[0];
    assert.equal(entry.averageCreditsBeforeBuy, null, invalid);
    assert.equal(entry.forceBuyOpportunity, null, invalid);
  }

  const data = payload([round(1, 'b', 800, 100), round(2, 'a', 3000, 1000)]);
  const records = data.data.seriesState.games[0].rounds[1].weaponPurchases;
  records[0].creditsRemaining = '1000.00000000000001';
  assert.equal(analyzeRoundEconomy(data).games[0].rounds[1].teams[0].averageCreditsSpent, null);
  records[0].creditsRemaining = ' 001000 ';
  records[0].creditsBeforeBuy = ' 003000 ';
  assert.equal(analyzeRoundEconomy(data).games[0].rounds[1].teams[0].averageCreditsSpent, 2000);
});

test('rejects non-finite, fractional and unsafe numeric credits', () => {
  for (const invalid of [NaN, Infinity, -Infinity, 3000.5, Number.MAX_SAFE_INTEGER + 1]) {
    for (const field of ['creditsBeforeBuy', 'creditsRemaining']) {
      const current = round(2, 'a', 3000, 1000);
      current.weaponPurchases[0][field] = invalid;
      const entry = analyzeRoundEconomy(payload([round(1, 'b', 800, 100), current])).games[0].rounds[1].teams[0];
      assert.equal(entry.averageCreditsSpent, null, `${field}: ${invalid}`);
      assert.equal(entry.forceBuyOpportunity, null, `${field}: ${invalid}`);
    }
  }
});

test('requires decimal integer strings for round numbers', () => {
  const data = payload([round(' 001 ', 'b', 800, 100), round('2e0', 'a', 3000, 1000)]);
  const game = analyzeRoundEconomy(data).games[0];
  assert.equal(game.rounds[0].roundNumber, 1);
  assert.equal(game.rounds[1].roundNumber, null);
  assert.equal(game.rounds[1].teams[0].forceBuyOpportunity, null);
  assert.equal(game.teams[0].roundsWithEconomy, 1);
});

test('conflicting or malformed round aliases cannot hide ambiguous rounds', () => {
  for (const [sequenceNumber, roundNumber] of [[0, 2], [2, 3], [2, 'invalid']]) {
    const conflicting = round(sequenceNumber, 'a', 3000, 1000);
    conflicting.roundNumber = roundNumber;
    const data = payload([
      round(1, 'b', 800, 100), round(2, 'b', 3000, 1000),
      conflicting, round(3, 'a', 3000, 1000), round(4, 'a', 3000, 1000)
    ]);
    const snapshot = structuredClone(data);
    const game = analyzeRoundEconomy(data).games[0];
    assert.deepEqual(data, snapshot);
    assert.equal(game.rounds[2].roundNumber, null);
    assert.equal(game.rounds[3].teams[0].forceBuyOpportunity, null);
    assert.equal(game.teams[0].forceBuys, 0);
  }
});

test('winner aliases must agree and invalid aliases remain unknown', () => {
  for (const [winningTeamId, winnerTeamId] of [['b', 'a'], [[], 'b'], ['b', []]]) {
    const previous = round(1, winningTeamId, 800, 100);
    previous.winnerTeamId = winnerTeamId;
    const game = analyzeRoundEconomy(payload([previous, round(2, 'a', 3000, 1000)])).games[0];
    assert.equal(game.rounds[0].teams[0].won, null);
    assert.equal(game.rounds[1].teams[0].forceBuyOpportunity, null);
    assert.equal(game.teams[0].forceBuyOpportunities, 0);
  }
});

test('explicit null aliases cannot hide valid round or winner candidates', () => {
  for (const [sequenceNumber, roundNumber] of [[null, 2], [2, null]]) {
    const invalid = round(sequenceNumber, 'b', 3000, 1000);
    invalid.roundNumber = roundNumber;
    const game = analyzeRoundEconomy(payload([
      round(1, 'b', 800, 100), invalid, round(2, 'b', 3000, 1000), round(3, 'a', 3000, 1000)
    ])).games[0];
    assert.equal(game.rounds[1].roundNumber, null);
    assert.equal(game.rounds[3].teams[0].forceBuyOpportunity, null);
    assert.equal(game.teams[0].roundsWithEconomy, 2);
  }
  for (const [winningTeamId, winnerTeamId] of [[null, 'b'], ['b', null]]) {
    const previous = round(1, winningTeamId, 800, 100);
    previous.winnerTeamId = winnerTeamId;
    const game = analyzeRoundEconomy(payload([previous, round(2, 'a', 3000, 1000)])).games[0];
    assert.equal(game.rounds[0].teams[0].won, null);
    assert.equal(game.rounds[1].teams[0].forceBuyOpportunity, null);
  }
});

test('remaining credits above a valid bank make spending unknown', () => {
  const second = round(2, 'a', 3000, 1000);
  second.weaponPurchases[0].creditsRemaining = 3001;
  const entry = analyzeRoundEconomy(payload([round(1, 'b', 800, 100), second])).games[0].rounds[1].teams[0];
  assert.equal(entry.averageCreditsBeforeBuy, 3000);
  assert.equal(entry.averageCreditsSpent, null);
  assert.equal(entry.forceBuyOpportunity, null);
});

test('conflicting round candidates remain ambiguous regardless of input order', () => {
  const conflicting = round(2, 'b', 3000, 1000);
  conflicting.roundNumber = 3;
  const original = [round(1, 'b', 800, 100), conflicting, round(2, 'b', 3000, 1000),
    round(3, 'b', 3000, 1000), round(4, 'a', 3000, 1000)];
  for (const rounds of [original, [...original].reverse()]) {
    const game = analyzeRoundEconomy(payload(rounds)).games[0];
    assert.equal(game.rounds.find((entry) => entry.roundNumber === 4).teams[0].forceBuyOpportunity, null);
    assert.equal(game.teams[0].roundsWithEconomy, 2);
    assert.equal(game.teams[0].forceBuys, 0);
  }
});

test('valid matching and absent round and winner aliases remain supported', () => {
  const first = round(1, 'b', 800, 100);
  first.roundNumber = '1';
  first.winnerTeamId = 'b';
  const second = round(2, 'a', 3000, 1000);
  second.roundNumber = 2;
  second.winnerTeamId = 'a';
  delete second.sequenceNumber;
  delete second.winningTeamId;
  const game = analyzeRoundEconomy(payload([first, second])).games[0];
  assert.equal(game.rounds[1].roundNumber, 2);
  assert.equal(game.rounds[1].teams[0].won, true);
  assert.equal(game.rounds[1].teams[0].forceBuy, true);
});