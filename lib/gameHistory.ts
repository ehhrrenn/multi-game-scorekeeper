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
export type GameSettings = { target: number; scoreDirection: 'UP' | 'DOWN' };
export type YahtzeeScoreMap = Record<string, Record<string, (number | null)[]>>;
export type GameRecord = {
  gameId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds?: Round[];
  yahtzeeScores?: YahtzeeScoreMap;
  isTripleYahtzee?: boolean;
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

type CustomSessionState = {
  players: PlayerSnapshot[];
  rounds: Round[];
  activeGameName: string;
  settings?: GameSettings;
  activeGameId?: string | null;
};

type YahtzeeSessionState = {
  players: PlayerSnapshot[];
  scores: YahtzeeScoreMap;
  isTripleYahtzee: boolean;
};

const UPPER_CATEGORY_IDS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const LOWER_CATEGORY_IDS = ['3kind', '4kind', 'fullHouse', 'smStraight', 'lgStraight', 'yahtzee', 'chance', 'bonus'];

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

export function buildCustomGameRecord(state: CustomSessionState, gameId?: string): GameRecord | null {
  if (!state.players.length || !state.rounds.length) {
    return null;
  }

  const settings = state.settings || { target: 0, scoreDirection: 'UP' as const };
  const finalScores: Record<string, number> = {};
  for (const player of state.players) {
    const sum = state.rounds.reduce((total, round) => total + (round.scores[player.id] || 0), 0);
    finalScores[player.id] = settings.scoreDirection === 'DOWN' ? settings.target - sum : sum;
  }

  return {
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
    settings
  };
}

function calcYahtzeeColumnTotal(scoreMap: YahtzeeScoreMap, playerId: string, columnIndex: number): number {
  const upperTotal = UPPER_CATEGORY_IDS.reduce((sum, categoryId) => sum + (scoreMap[playerId]?.[categoryId]?.[columnIndex] || 0), 0);
  const bonus = upperTotal >= 63 ? 35 : 0;
  const lowerTotal = LOWER_CATEGORY_IDS.reduce((sum, categoryId) => sum + (scoreMap[playerId]?.[categoryId]?.[columnIndex] || 0), 0);
  return upperTotal + bonus + lowerTotal;
}

export function buildYahtzeeGameRecord(state: YahtzeeSessionState, gameId?: string): GameRecord | null {
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

  return {
    gameId: gameId || `game_${Date.now()}`,
    date: new Date().toISOString(),
    gameName: state.isTripleYahtzee ? 'Triple Yahtzee' : 'Yahtzee',
    finalScores,
    activePlayerIds: state.players.map((player) => player.id),
    yahtzeeScores: JSON.parse(JSON.stringify(state.scores)),
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
}
