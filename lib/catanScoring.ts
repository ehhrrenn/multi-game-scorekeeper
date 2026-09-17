// lib/catanScoring.ts
//
// Pure types + victory-point math for the Catan Dice Game (Island One /
// Island Two). This is a manual scorepad, not a dice simulator or rules
// engine: players roll their own physical dice and mark what they built,
// this module just computes VP from that state.

export type CatanResourceId = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore';

export const CATAN_RESOURCE_IDS: CatanResourceId[] = ['brick', 'lumber', 'wool', 'grain', 'ore'];

export const CATAN_RESOURCE_LABELS: Record<CatanResourceId, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};

export type CatanBuildState = {
  settlements: Record<CatanResourceId, boolean>;
  cities: Record<CatanResourceId, boolean>;
  roads: number;
  knights: number;
};

export type CatanScoreMap = Record<string, CatanBuildState>;

export type CatanBoard = 'island1' | 'island2';

const LONGEST_ROAD_THRESHOLD = 5;
const LARGEST_ARMY_THRESHOLD = 3;
const LONGEST_ROAD_BONUS_VP = 2;
const LARGEST_ARMY_BONUS_VP = 2;
export const ISLAND1_TURN_LIMIT = 15;
export const ISLAND2_TARGET_VP = 10;

export function emptyCatanBuildState(): CatanBuildState {
  const settlements = {} as Record<CatanResourceId, boolean>;
  const cities = {} as Record<CatanResourceId, boolean>;
  for (const resource of CATAN_RESOURCE_IDS) {
    settlements[resource] = false;
    cities[resource] = false;
  }
  return { settlements, cities, roads: 0, knights: 0 };
}

export function computeBaseVP(build: CatanBuildState | undefined): number {
  if (!build) return 0;
  let vp = 0;
  for (const resource of CATAN_RESOURCE_IDS) {
    if (build.settlements[resource]) vp += 1;
    if (build.cities[resource]) vp += 2;
  }
  return vp;
}

/** Strict-max holder for a given count getter; ties mean nobody holds it. */
function findStrictMaxHolder(
  scores: CatanScoreMap,
  playerIds: string[],
  threshold: number,
  getCount: (build: CatanBuildState) => number
): string | null {
  let bestId: string | null = null;
  let bestCount = threshold - 1;
  let tied = false;

  for (const playerId of playerIds) {
    const count = getCount(scores[playerId] || emptyCatanBuildState());
    if (count > bestCount) {
      bestCount = count;
      bestId = playerId;
      tied = false;
    } else if (count === bestCount && bestId !== null) {
      tied = true;
    }
  }

  if (bestCount < threshold || tied) return null;
  return bestId;
}

export function computeBonusHolders(
  scores: CatanScoreMap,
  playerIds: string[]
): { roadHolderId: string | null; armyHolderId: string | null } {
  return {
    roadHolderId: findStrictMaxHolder(scores, playerIds, LONGEST_ROAD_THRESHOLD, (b) => b.roads),
    armyHolderId: findStrictMaxHolder(scores, playerIds, LARGEST_ARMY_THRESHOLD, (b) => b.knights),
  };
}

export function computeCatanTotals(
  scores: CatanScoreMap,
  board: CatanBoard,
  playerIds: string[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  const { roadHolderId, armyHolderId } = board === 'island2'
    ? computeBonusHolders(scores, playerIds)
    : { roadHolderId: null, armyHolderId: null };

  for (const playerId of playerIds) {
    let vp = computeBaseVP(scores[playerId]);
    if (board === 'island2') {
      if (playerId === roadHolderId) vp += LONGEST_ROAD_BONUS_VP;
      if (playerId === armyHolderId) vp += LARGEST_ARMY_BONUS_VP;
    }
    totals[playerId] = vp;
  }
  return totals;
}
