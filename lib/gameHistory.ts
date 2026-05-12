import { deleteDoc, doc, setDoc, type Firestore } from 'firebase/firestore';

export type PlayerSnapshot = {
  id: string;
  name: string;
  emoji: string;
  photoURL?: string;
  isCloudUser?: boolean;
  useCustomEmoji?: boolean;
};

export type Round = { roundId: number; scores: Record<string, number> };
export type GameSettings = { target: number; scoreDirection: 'UP' | 'DOWN'; endMode?: 'TARGET' | 'ROUNDS'; roundLimit?: number };
export type GameStatus = 'IN_PROGRESS' | 'COMPLETED';
export type CompletionReason = 'TARGET_REACHED' | 'ROUND_LIMIT_REACHED' | 'MANUAL_FINISH' | 'BUILT_IN_COMPLETE';
export type YahtzeeScoreMap = Record<string, Record<string, (number | null)[]>>;
export type YahtzeeScoreEntry = { playerId: string; categoryId: string; colIndex: number; score: number };
export type FarkleMode = 'regular' | 'stealing';
export type FarkleScoreMap = Record<string, Record<string, number | null>>;
export type FarkleSettings = { targetScore: number; roundCount: number | null };
export type GameRecord = {
  gameId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds?: Round[];
  yahtzeeScores?: YahtzeeScoreMap;
  yahtzeeScoreEntries?: YahtzeeScoreEntry[];
  isTripleYahtzee?: boolean;
  farkleScores?: FarkleScoreMap;
  farkleMode?: FarkleMode;
  farkleSettings?: FarkleSettings;
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
  winCondition?: 'HIGH' | 'LOW';
  status?: GameStatus;
  completedAt?: string;
  completedReason?: CompletionReason;
  winnerIds?: string[];
  hasBuiltInEndRule?: boolean;
};

type BuildGameRecordOptions = {
  markCompleted?: boolean;
  completedReason?: CompletionReason;
};

type GameRecordLike = Pick<GameRecord, 'gameName' | 'finalScores' | 'activePlayerIds'> & Partial<GameRecord>;

type CustomSessionState = {
  players: PlayerSnapshot[];
  rounds: Round[];
  activeGameName: string;
  settings?: GameSettings;
  activeGameId?: string | null;
  winCondition?: 'HIGH' | 'LOW';
};

type YahtzeeSessionState = {
  players: PlayerSnapshot[];
  scores: YahtzeeScoreMap;
  isTripleYahtzee: boolean;
  scoreEntries?: YahtzeeScoreEntry[];
};

type FarkleSessionState = {
  players: PlayerSnapshot[];
  scores: FarkleScoreMap;
  mode: FarkleMode;
  settings: FarkleSettings;
  activeGameId?: string | null;
};

const UPPER_CATEGORY_IDS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const LOWER_CATEGORY_IDS = ['3kind', '4kind', 'fullHouse', 'smStraight', 'lgStraight', 'yahtzee', 'chance', 'bonus'];

function isYahtzeeRecord(record: GameRecordLike): boolean {
  return Boolean(record.yahtzeeScores) || record.gameName === 'Yahtzee' || record.gameName === 'Triple Yahtzee';
}

function isFarkleRecord(record: GameRecordLike): boolean {
  return Boolean(record.farkleScores) || record.gameName === 'Farkle' || record.gameName === 'Farkle Stealing';
}

function countCompletedRounds(rounds: Round[], playerIds: string[]): number {
  if (!rounds.length || !playerIds.length) {
    return 0;
  }

  let completed = 0;
  for (const round of rounds) {
    const isCompleteRound = playerIds.every((playerId) => {
      const score = round.scores[playerId];
      return score !== undefined && score !== null;
    });

    if (!isCompleteRound) {
      break;
    }

    completed += 1;
  }

  return completed;
}

function getTargetReachedRoundIndex(rounds: Round[], playerIds: string[], target: number): number | null {
  if (target <= 0 || !rounds.length || !playerIds.length) {
    return null;
  }

  const runningTotals: Record<string, number> = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const round = rounds[roundIndex];
    for (const playerId of playerIds) {
      const score = round.scores[playerId];
      if (score === undefined || score === null) {
        continue;
      }

      runningTotals[playerId] += score;
      if (runningTotals[playerId] >= target) {
        return roundIndex;
      }
    }
  }

  return null;
}

export function inferHasBuiltInEndRule(record: GameRecordLike): boolean {
  if (typeof record.hasBuiltInEndRule === 'boolean') {
    return record.hasBuiltInEndRule;
  }

  if (isYahtzeeRecord(record) || isFarkleRecord(record)) {
    return true;
  }

  return (record.settings?.target || 0) > 0;
}

export function isGameCompleted(record: GameRecordLike): boolean {
  if (record.status === 'COMPLETED') {
    return true;
  }

  if (record.status === 'IN_PROGRESS') {
    return false;
  }

  if (isYahtzeeRecord(record)) {
    const scoreMap = record.yahtzeeScores;
    if (!scoreMap) {
      return true;
    }

    const columnsPerPlayer = record.isTripleYahtzee ? 3 : 1;
    const categoryIds = [...UPPER_CATEGORY_IDS, ...LOWER_CATEGORY_IDS];

    return record.activePlayerIds.every((playerId) =>
      categoryIds.every((categoryId) => {
        const values = scoreMap[playerId]?.[categoryId] || [];
        return Array.from({ length: columnsPerPlayer }).every((_, index) => {
          const value = values[index];
          return value !== null && value !== undefined;
        });
      })
    );
  }

  if (isFarkleRecord(record)) {
    const rounds = record.savedRounds || [];
    const playerIds = record.activePlayerIds || [];
    const completedRounds = countCompletedRounds(rounds, playerIds);
    const roundCount = record.farkleSettings?.roundCount;

    if (roundCount !== null && roundCount !== undefined) {
      return completedRounds >= roundCount;
    }

    const targetScore = record.farkleSettings?.targetScore || record.settings?.target || 0;
    if (targetScore <= 0) {
      return false;
    }

    const reachedRoundIndex = getTargetReachedRoundIndex(rounds, playerIds, targetScore);
    return reachedRoundIndex !== null && completedRounds >= reachedRoundIndex + 1;
  }

  // Check for round limit first (custom games with roundLimit mode)
  const roundLimit = record.settings?.roundLimit;
  const rounds = record.savedRounds || [];
  const playerIds = record.activePlayerIds || [];
  if (roundLimit !== null && roundLimit !== undefined && roundLimit > 0) {
    const completedRounds = countCompletedRounds(rounds, playerIds);
    if (completedRounds >= roundLimit) {
      return true;
    }
  }

  const target = record.settings?.target || 0;
  if (target <= 0) {
    return false;
  }

  const direction = record.settings?.scoreDirection || 'UP';
  const scores = Object.values(record.finalScores || {});
  if (!scores.length) {
    return false;
  }

  if (direction === 'DOWN') {
    return scores.some((score) => score <= 0);
  }

  return scores.some((score) => score >= target);
}

export function getWinnerIdsForRecord(record: GameRecordLike, scoreDirectionOverride?: 'UP' | 'DOWN'): string[] {
  const candidateIds = record.activePlayerIds || Object.keys(record.finalScores || {});

  // Use stored winCondition if available (immutable per game)
  // Otherwise fall back to scoreDirection or default to 'HIGH' (highest wins)
  let isLowestWins = false;
  if (record.winCondition) {
    isLowestWins = record.winCondition === 'LOW';
  } else if (scoreDirectionOverride) {
    isLowestWins = scoreDirectionOverride === 'DOWN';
  } else {
    isLowestWins = (record.settings?.scoreDirection || 'UP') === 'DOWN';
  }

  let bestScore = isLowestWins ? Infinity : -Infinity;
  const winnerIds: string[] = [];

  for (const playerId of candidateIds) {
    const score = record.finalScores[playerId];
    if (score === undefined || score === null) {
      continue;
    }

    if (isLowestWins) {
      if (score < bestScore) {
        bestScore = score;
        winnerIds.length = 0;
        winnerIds.push(playerId);
      } else if (score === bestScore) {
        winnerIds.push(playerId);
      }
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      winnerIds.length = 0;
      winnerIds.push(playerId);
    } else if (score === bestScore) {
      winnerIds.push(playerId);
    }
  }

  return winnerIds;
}

export function withGameLifecycle(
  record: GameRecord,
  options?: BuildGameRecordOptions
): GameRecord {
  const completed = options?.markCompleted ?? isGameCompleted(record);
  const status: GameStatus = completed ? 'COMPLETED' : 'IN_PROGRESS';
  const winnerIds = completed ? getWinnerIdsForRecord(record) : [];

  return {
    ...record,
    status,
    completedAt: completed ? (record.completedAt || new Date().toISOString()) : undefined,
    completedReason: completed ? (options?.completedReason || record.completedReason || 'BUILT_IN_COMPLETE') : undefined,
    winnerIds,
    hasBuiltInEndRule: inferHasBuiltInEndRule(record)
  };
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === 'object') {
    const cleanedEntries = Object.entries(value)
      .map(([key, entryValue]) => [key, stripUndefinedDeep(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined);

    return Object.fromEntries(cleanedEntries) as T;
  }

  return value;
}

export function upsertGameRecord(records: GameRecord[], record: GameRecord): GameRecord[] {
  const existingIndex = records.findIndex((item) => item.gameId === record.gameId);
  if (existingIndex === -1) {
    return [record, ...records];
  }

  return records.map((item) => (item.gameId === record.gameId ? record : item));
}

export async function saveGameRecordToCloud(db: Firestore, record: GameRecord): Promise<void> {
  const sanitizedRecord = stripUndefinedDeep(record);
  await setDoc(doc(db, 'Games', record.gameId), sanitizedRecord, { merge: true });
}

export async function deleteGameRecordFromCloud(db: Firestore, gameId: string): Promise<void> {
  await deleteDoc(doc(db, 'Games', gameId));
}

export function buildCustomGameRecord(state: CustomSessionState, gameId?: string, options?: BuildGameRecordOptions): GameRecord | null {
  if (!state.players.length || !state.rounds.length) {
    return null;
  }

  const settings = state.settings || { target: 0, scoreDirection: 'UP' as const };
  const finalScores: Record<string, number> = {};
  for (const player of state.players) {
    const sum = state.rounds.reduce((total, round) => total + (round.scores[player.id] || 0), 0);
    finalScores[player.id] = settings.scoreDirection === 'DOWN' ? settings.target - sum : sum;
  }

  const baseRecord: GameRecord = {
    gameId: gameId || state.activeGameId || `game_${Date.now()}`,
    date: new Date().toISOString(),
    gameName: state.activeGameName || 'Custom Game',
    finalScores,
    activePlayerIds: state.players.map((player) => player.id),
    savedRounds: JSON.parse(JSON.stringify(state.rounds)),
    playerSnapshots: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      emoji: player.emoji,
      photoURL: player.photoURL,
      isCloudUser: player.isCloudUser,
      useCustomEmoji: player.useCustomEmoji
    })),
    settings,
    winCondition: state.winCondition
  };

  const target = settings.target || 0;
  const targetReached = target > 0 && Object.values(finalScores).some((score) =>
    settings.scoreDirection === 'DOWN' ? score <= 0 : score >= target
  );

  return withGameLifecycle(baseRecord, {
    markCompleted: options?.markCompleted ?? targetReached,
    completedReason: options?.completedReason ?? (targetReached ? 'TARGET_REACHED' : undefined)
  });
}

function calcYahtzeeColumnTotal(scoreMap: YahtzeeScoreMap, playerId: string, columnIndex: number): number {
  const upperTotal = UPPER_CATEGORY_IDS.reduce((sum, categoryId) => sum + (scoreMap[playerId]?.[categoryId]?.[columnIndex] || 0), 0);
  const bonus = upperTotal >= 63 ? 35 : 0;
  const lowerTotal = LOWER_CATEGORY_IDS.reduce((sum, categoryId) => sum + (scoreMap[playerId]?.[categoryId]?.[columnIndex] || 0), 0);
  return upperTotal + bonus + lowerTotal;
}

function calcYahtzeeGrandTotal(scoreMap: YahtzeeScoreMap, playerId: string, isTripleYahtzee: boolean): number {
  const columnsPerPlayer = isTripleYahtzee ? 3 : 1;
  let total = 0;

  for (let columnIndex = 0; columnIndex < columnsPerPlayer; columnIndex += 1) {
    const columnTotal = calcYahtzeeColumnTotal(scoreMap, playerId, columnIndex);
    total += columnTotal * (isTripleYahtzee ? columnIndex + 1 : 1);
  }

  return total;
}

type YahtzeeGraphSeriesPoint = {
  id: string;
  emoji: string;
  name: string;
  isCloudUser?: boolean;
  points: number[];
  finalScore: number;
};

type BuildYahtzeeGraphSeriesArgs = {
  players: PlayerSnapshot[];
  scores: YahtzeeScoreMap;
  isTripleYahtzee: boolean;
  scoreEntries?: YahtzeeScoreEntry[];
};

export function buildYahtzeeGraphSeries({ players, scores, isTripleYahtzee, scoreEntries }: BuildYahtzeeGraphSeriesArgs): YahtzeeGraphSeriesPoint[] {
  const columnsPerPlayer = isTripleYahtzee ? 3 : 1;
  const validCategoryIds = new Set([...UPPER_CATEGORY_IDS, ...LOWER_CATEGORY_IDS]);
  const validPlayerIds = new Set(players.map((player) => player.id));
  const orderedEntries = scoreEntries?.filter((entry) => (
    typeof entry.playerId === 'string' &&
    entry.playerId.length > 0 &&
    validPlayerIds.has(entry.playerId) &&
    typeof entry.categoryId === 'string' &&
    validCategoryIds.has(entry.categoryId) &&
    Number.isInteger(entry.colIndex) &&
    entry.colIndex >= 0 &&
    entry.colIndex < columnsPerPlayer &&
    Number.isFinite(entry.score)
  )) || [];

  if (!orderedEntries.length) {
    const categoryOrder = [...UPPER_CATEGORY_IDS, ...LOWER_CATEGORY_IDS];

    return players.map((player) => {
      let runningTotal = 0;
      const points = [0];

      for (let colIdx = 0; colIdx < columnsPerPlayer; colIdx += 1) {
        const multiplier = isTripleYahtzee ? colIdx + 1 : 1;
        let upperTotal = 0;

        for (const categoryId of categoryOrder) {
          const value = scores[player.id]?.[categoryId]?.[colIdx] || 0;
          points.push(points[points.length - 1] + value * multiplier);
          runningTotal += value * multiplier;

          if (UPPER_CATEGORY_IDS.includes(categoryId)) {
            upperTotal += value;
          }
        }

        const bonus = (upperTotal >= 63 ? 35 : 0) * multiplier;
        if (bonus > 0) {
          points.push(points[points.length - 1] + bonus);
          runningTotal += bonus;
        }
      }

      return {
        id: player.id,
        emoji: player.emoji,
        name: player.name,
        isCloudUser: player.isCloudUser,
        points,
        finalScore: runningTotal,
      };
    });
  }

  const workingScores: YahtzeeScoreMap = {};
  const pointsByPlayer: Record<string, number[]> = {};
  const totalsByPlayer: Record<string, number> = {};

  for (const player of players) {
    pointsByPlayer[player.id] = [0];
    totalsByPlayer[player.id] = 0;
  }

  for (const entry of orderedEntries) {
    const playerScores = workingScores[entry.playerId] || (workingScores[entry.playerId] = {});
    const categoryScores = playerScores[entry.categoryId] || (playerScores[entry.categoryId] = Array(columnsPerPlayer).fill(null));
    categoryScores[entry.colIndex] = entry.score;

    totalsByPlayer[entry.playerId] = calcYahtzeeGrandTotal(workingScores, entry.playerId, isTripleYahtzee);

    for (const player of players) {
      pointsByPlayer[player.id].push(totalsByPlayer[player.id]);
    }
  }

  return players.map((player) => ({
    id: player.id,
    emoji: player.emoji,
    name: player.name,
    isCloudUser: player.isCloudUser,
    points: pointsByPlayer[player.id],
    finalScore: totalsByPlayer[player.id],
  }));
}

export function buildYahtzeeGameRecord(state: YahtzeeSessionState, gameId?: string, options?: BuildGameRecordOptions): GameRecord | null {
  if (!state.players.length || !Object.keys(state.scores).length) {
    return null;
  }

  const columnsPerPlayer = state.isTripleYahtzee ? 3 : 1;
  const finalScores: Record<string, number> = {};

  for (const player of state.players) {
    let total = 0;
    for (let columnIndex = 0; columnIndex < columnsPerPlayer; columnIndex += 1) {
      const columnTotal = calcYahtzeeColumnTotal(state.scores, player.id, columnIndex);
      total += columnTotal * (state.isTripleYahtzee ? columnIndex + 1 : 1);
    }
    finalScores[player.id] = total;
  }

  const baseRecord: GameRecord = {
    gameId: gameId || `game_${Date.now()}`,
    date: new Date().toISOString(),
    gameName: state.isTripleYahtzee ? 'Triple Yahtzee' : 'Yahtzee',
    finalScores,
    activePlayerIds: state.players.map((player) => player.id),
    yahtzeeScores: JSON.parse(JSON.stringify(state.scores)),
    yahtzeeScoreEntries: JSON.parse(JSON.stringify(state.scoreEntries || [])),
    isTripleYahtzee: state.isTripleYahtzee,
    playerSnapshots: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      emoji: player.emoji,
      photoURL: player.photoURL,
      isCloudUser: player.isCloudUser,
      useCustomEmoji: player.useCustomEmoji
    })),
    settings: { target: 0, scoreDirection: 'UP' }
  };

  const columnsToCheck = state.isTripleYahtzee ? 3 : 1;
  const categoryIds = [...UPPER_CATEGORY_IDS, ...LOWER_CATEGORY_IDS];
  const isComplete = state.players.every((player) =>
    categoryIds.every((categoryId) => {
      const values = state.scores[player.id]?.[categoryId] || [];
      return Array.from({ length: columnsToCheck }).every((_, index) => {
        const value = values[index];
        return value !== null && value !== undefined;
      });
    })
  );

  return withGameLifecycle(baseRecord, {
    markCompleted: options?.markCompleted ?? isComplete,
    completedReason: options?.completedReason ?? (isComplete ? 'BUILT_IN_COMPLETE' : undefined)
  });
}

export function buildFarkleGameRecord(state: FarkleSessionState, gameId?: string, options?: BuildGameRecordOptions): GameRecord | null {
  if (!state.players.length || !Object.keys(state.scores).length) {
    return null;
  }

  const finalScores: Record<string, number> = {};
  const roundIndexes = new Set<number>();

  for (const player of state.players) {
    const playerRounds = state.scores[player.id] || {};
    const total = Object.entries(playerRounds).reduce((sum, [roundIndex, value]) => {
      roundIndexes.add(Number(roundIndex));
      return sum + (value || 0);
    }, 0);
    finalScores[player.id] = total;
  }

  const sortedRoundIndexes = Array.from(roundIndexes).sort((a, b) => a - b);
  const savedRounds: Round[] = sortedRoundIndexes.map((roundIndex) => ({
    roundId: roundIndex + 1,
    scores: Object.fromEntries(
      state.players.map((player) => [player.id, state.scores[player.id]?.[String(roundIndex)] || 0])
    )
  }));

  const baseRecord: GameRecord = {
    gameId: gameId || state.activeGameId || `game_${Date.now()}`,
    date: new Date().toISOString(),
    gameName: state.mode === 'stealing' ? 'Farkle Stealing' : 'Farkle',
    finalScores,
    activePlayerIds: state.players.map((player) => player.id),
    savedRounds,
    farkleScores: JSON.parse(JSON.stringify(state.scores)),
    farkleMode: state.mode,
    farkleSettings: state.settings,
    playerSnapshots: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      emoji: player.emoji,
      photoURL: player.photoURL,
      isCloudUser: player.isCloudUser,
      useCustomEmoji: player.useCustomEmoji
    })),
    settings: { target: state.settings.targetScore, scoreDirection: 'UP' }
  };

  const completedRounds = countCompletedRounds(savedRounds, state.players.map((player) => player.id));
  const usesRoundLimit = state.settings.roundCount !== null;
  const roundLimitReached = usesRoundLimit && completedRounds >= (state.settings.roundCount || 0);
  const targetReachedRoundIndex = usesRoundLimit
    ? null
    : getTargetReachedRoundIndex(savedRounds, state.players.map((player) => player.id), state.settings.targetScore || 0);
  const targetReachedAndFinishedRound = !usesRoundLimit && targetReachedRoundIndex !== null && completedRounds >= targetReachedRoundIndex + 1;
  const isComplete = roundLimitReached || targetReachedAndFinishedRound;

  return withGameLifecycle(baseRecord, {
    markCompleted: options?.markCompleted ?? isComplete,
    completedReason: options?.completedReason ?? (
      roundLimitReached
        ? 'ROUND_LIMIT_REACHED'
        : targetReachedAndFinishedRound
          ? 'TARGET_REACHED'
          : undefined
    )
  });
}
