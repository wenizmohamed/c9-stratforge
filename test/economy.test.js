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