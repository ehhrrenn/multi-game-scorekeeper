export type FarkleCombo = {
  id: string;
  label: string;
  points: number;
};

const QUICK_ADD_COMBOS: FarkleCombo[] = [
  { id: 'single-5', label: '+50', points: 50 },
  { id: 'single-1', label: '+100', points: 100 },
  { id: 'three-2', label: '3x2', points: 200 },
  { id: 'three-3', label: '3x3', points: 300 },
  { id: 'three-4', label: '3x4', points: 400 },
  { id: 'three-5', label: '3x5', points: 500 },
  { id: 'three-6', label: '3x6', points: 600 },
  { id: 'three-1', label: '3x1', points: 1000 },
  { id: 'three-pair', label: '3 Pair', points: 1500 },
  { id: 'four-kind', label: '4 Kind', points: 1000 },
  { id: 'four-kind-pair', label: '4K + Pair', points: 1500 },
  { id: 'straight', label: 'Straight', points: 1500 },
  { id: 'five-kind', label: '5 Kind', points: 2000 },
  { id: 'two-triplets', label: '2 Triplets', points: 2500 },
  { id: 'six-kind', label: '6 Kind', points: 3000 }
];

const VALID_FARKLE_SCORES = buildValidFarkleScores();

function cloneCounts(counts: number[]): number[] {
  return [...counts];
}

function serializeCounts(counts: number[]): string {
  return counts.join(',');
}

function isStraight(counts: number[]): boolean {
  return counts.every((count) => count === 1);
}

function isThreePairs(counts: number[]): boolean {
  return counts.filter((count) => count === 2).length === 3;
}

function isTwoTriplets(counts: number[]): boolean {
  return counts.filter((count) => count === 3).length === 2;
}

function isFourKindAndPair(counts: number[]): boolean {
  return counts.some((count) => count === 4) && counts.some((count) => count === 2);
}

function scoringMoves(counts: number[]): Array<{ score: number; next: number[] }> {
  const moves: Array<{ score: number; next: number[] }> = [];

  if (isStraight(counts)) {
    moves.push({ score: 1500, next: [0, 0, 0, 0, 0, 0] });
  }

  if (isThreePairs(counts)) {
    moves.push({ score: 1500, next: [0, 0, 0, 0, 0, 0] });
  }

  if (isTwoTriplets(counts)) {
    moves.push({ score: 2500, next: [0, 0, 0, 0, 0, 0] });
  }

  if (isFourKindAndPair(counts)) {
    moves.push({ score: 1500, next: [0, 0, 0, 0, 0, 0] });
  }

  counts.forEach((count, index) => {
    const face = index + 1;

    if (count >= 6) {
      const next = cloneCounts(counts);
      next[index] -= 6;
      moves.push({ score: 3000, next });
    }

    if (count >= 5) {
      const next = cloneCounts(counts);
      next[index] -= 5;
      moves.push({ score: 2000, next });
    }

    if (count >= 4) {
      const next = cloneCounts(counts);
      next[index] -= 4;
      moves.push({ score: 1000, next });
    }

    if (count >= 3) {
      const next = cloneCounts(counts);
      next[index] -= 3;
      moves.push({ score: face === 1 ? 1000 : face * 100, next });
    }

    if (face === 1 && count >= 1) {
      const next = cloneCounts(counts);
      next[index] -= 1;
      moves.push({ score: 100, next });
    }

    if (face === 5 && count >= 1) {
      const next = cloneCounts(counts);
      next[index] -= 1;
      moves.push({ score: 50, next });
    }
  });

  return moves;
}

function collectScores(counts: number[], cache: Map<string, Set<number>>): Set<number> {
  const key = serializeCounts(counts);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const scores = new Set<number>([0]);
  for (const move of scoringMoves(counts)) {
    const remainderScores = collectScores(move.next, cache);
    remainderScores.forEach((score) => {
      scores.add(move.score + score);
    });
  }

  cache.set(key, scores);
  return scores;
}

function enumerateDiceCounts(diceLeft: number, faceIndex: number, current: number[], results: number[][]): void {
  if (faceIndex === 5) {
    results.push([...current, diceLeft]);
    return;
  }

  for (let count = 0; count <= diceLeft; count += 1) {
    enumerateDiceCounts(diceLeft - count, faceIndex + 1, [...current, count], results);
  }
}

function buildValidFarkleScores(): Set<number> {
  const results: number[][] = [];
  enumerateDiceCounts(6, 0, [], results);
  const allScores = new Set<number>([0]);
  const cache = new Map<string, Set<number>>();

  for (const counts of results) {
    const possibleScores = collectScores(counts, cache);
    possibleScores.forEach((score) => {
      allScores.add(score);
    });
  }

  return allScores;
}

export function getQuickAddCombos(): FarkleCombo[] {
  return QUICK_ADD_COMBOS;
}

export function isValidFarkleScore(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && VALID_FARKLE_SCORES.has(score);
}

export function isValidFarkleTurnTotal(total: number, baseScore = 0): boolean {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(baseScore) || baseScore < 0) {
    return false;
  }

  if (total === 0) {
    return true;
  }

  if (total < baseScore) {
    return false;
  }

  return isValidFarkleScore(total - baseScore);
}

export function getFarkleValidationMessage(score: number): string | null {
  if (!Number.isInteger(score) || score < 0) {
    return 'Score must be a non-negative whole number.';
  }

  if (!VALID_FARKLE_SCORES.has(score)) {
    return `${score} is not a valid Farkle score with the current rules.`;
  }

  return null;
}

export function getFarkleTurnValidationMessage(total: number, baseScore = 0): string | null {
  if (!Number.isInteger(total) || total < 0) {
    return 'Score must be a non-negative whole number.';
  }

  if (total === 0) {
    return null;
  }

  if (total < baseScore) {
    return 'Turn total cannot be less than the accepted stolen score.';
  }

  if (!isValidFarkleScore(total - baseScore)) {
    return `${total - baseScore} is not a valid Farkle score combination.`;
  }

  return null;
}