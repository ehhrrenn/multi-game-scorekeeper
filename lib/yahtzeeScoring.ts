/** Calculates the score for a specific Yahtzee category given 5 dice values. */
export function calculateCategoryScore(dice: number[], categoryId: string): number {
  if (dice.length !== 5) return 0;

  const sorted = [...dice].sort((a, b) => a - b);
  const counts: Record<number, number> = {};
  for (const d of dice) counts[d] = (counts[d] ?? 0) + 1;
  const countValues = Object.values(counts).sort((a, b) => b - a);
  const sum = dice.reduce((a, b) => a + b, 0);

  switch (categoryId) {
    case 'ones':   return dice.filter((d) => d === 1).reduce((a, b) => a + b, 0);
    case 'twos':   return dice.filter((d) => d === 2).reduce((a, b) => a + b, 0);
    case 'threes': return dice.filter((d) => d === 3).reduce((a, b) => a + b, 0);
    case 'fours':  return dice.filter((d) => d === 4).reduce((a, b) => a + b, 0);
    case 'fives':  return dice.filter((d) => d === 5).reduce((a, b) => a + b, 0);
    case 'sixes':  return dice.filter((d) => d === 6).reduce((a, b) => a + b, 0);

    case '3kind':
      return countValues[0] >= 3 ? sum : 0;

    case '4kind':
      return countValues[0] >= 4 ? sum : 0;

    case 'fullHouse':
      return (countValues[0] === 3 && countValues[1] === 2) ? 25 : 0;

    case 'smStraight': {
      const unique = [...new Set(sorted)];
      const has = (n: number) => unique.includes(n);
      if (
        (has(1) && has(2) && has(3) && has(4)) ||
        (has(2) && has(3) && has(4) && has(5)) ||
        (has(3) && has(4) && has(5) && has(6))
      ) return 30;
      return 0;
    }

    case 'lgStraight': {
      const unique = [...new Set(sorted)];
      if (unique.length === 5 && (unique[0] === 1 || unique[0] === 2)) return 40;
      return 0;
    }

    case 'yahtzee':
      return countValues[0] === 5 ? 50 : 0;

    case 'chance':
      return sum;

    case 'bonus':
      return countValues[0] === 5 ? 100 : 0;

    default:
      return 0;
  }
}

export const YAHTZEE_UPPER_CATEGORIES = [
  { id: 'ones', name: 'Ones' },
  { id: 'twos', name: 'Twos' },
  { id: 'threes', name: 'Threes' },
  { id: 'fours', name: 'Fours' },
  { id: 'fives', name: 'Fives' },
  { id: 'sixes', name: 'Sixes' },
];

export const YAHTZEE_LOWER_CATEGORIES = [
  { id: '3kind', name: '3 of a Kind' },
  { id: '4kind', name: '4 of a Kind' },
  { id: 'fullHouse', name: 'Full House' },
  { id: 'smStraight', name: 'Sm. Straight' },
  { id: 'lgStraight', name: 'Lg. Straight' },
  { id: 'yahtzee', name: 'YAHTZEE' },
  { id: 'chance', name: 'Chance' },
  { id: 'bonus', name: 'Yahtzee Bonus' },
];

/** Returns score for every Yahtzee category given 5 dice values. */
export function getAllCategoryScores(dice: number[]): Record<string, number> {
  const all = [...YAHTZEE_UPPER_CATEGORIES, ...YAHTZEE_LOWER_CATEGORIES];
  const result: Record<string, number> = {};
  for (const cat of all) {
    result[cat.id] = calculateCategoryScore(dice, cat.id);
  }
  return result;
}
