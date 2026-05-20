// app/components/YahtzeeDiceRoller.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Die from './Die';
import {
  getAllCategoryScores,
  YAHTZEE_LOWER_CATEGORIES,
  YAHTZEE_UPPER_CATEGORIES,
} from '../../lib/yahtzeeScoring';

type DieState = { id: number; value: number; kept: boolean };

function randomDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

const INITIAL_DICE: DieState[] = Array.from({ length: 5 }, (_, i) => ({
  id: i,
  value: 1,
  kept: false,
}));

const ROLL_DURATION_MS = 620;
const CYCLE_INTERVAL_MS = 80;

type Props = {
  /** Category IDs already scored by the current player (dimmed in suggestions). */
  usedCategoryIds?: string[];
};

export default function YahtzeeDiceRoller({ usedCategoryIds = [] }: Props) {
  const [dice, setDice] = useState<DieState[]>(INITIAL_DICE);
  const [rollCount, setRollCount] = useState(0); // 0 = haven't rolled yet
  const [isAnimating, setIsAnimating] = useState(false);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleFinalRef = useRef<DieState[]>([]);

  const clearCycle = useCallback(() => {
    if (cycleRef.current) {
      clearInterval(cycleRef.current);
      cycleRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCycle(), [clearCycle]);

  const doRoll = useCallback(() => {
    if (rollCount >= 3) return;

    setIsAnimating(true);

    const nextDice = dice.map((d) =>
      d.kept ? d : { ...d, value: randomDie() }
    );
    settleFinalRef.current = nextDice;

    cycleRef.current = setInterval(() => {
      setDice((prev) =>
        prev.map((d) => (d.kept ? d : { ...d, value: randomDie() }))
      );
    }, CYCLE_INTERVAL_MS);

    setTimeout(() => {
      clearCycle();
      setIsAnimating(false);
      setDice(settleFinalRef.current);
      setRollCount((c) => c + 1);
    }, ROLL_DURATION_MS);
  }, [clearCycle, dice, rollCount]);

  const handleToggleKeep = useCallback(
    (id: number) => {
      if (rollCount === 0) return; // must roll first
      setDice((prev) =>
        prev.map((d) => (d.id === id ? { ...d, kept: !d.kept } : d))
      );
    },
    [rollCount]
  );

  const handleReset = useCallback(() => {
    clearCycle();
    setDice(INITIAL_DICE);
    setRollCount(0);
    setIsAnimating(false);
  }, [clearCycle]);

  // ── Category suggestions ────────────────────────────────────────
  const diceValues = dice.map((d) => d.value);
  const categoryScores =
    rollCount > 0 ? getAllCategoryScores(diceValues) : null;

  const canRoll = rollCount < 3 && !isAnimating;
  const rollLabel =
    rollCount === 0
      ? '🎲 Roll Dice'
      : rollCount < 3
      ? `🎲 Re-roll (${3 - rollCount} left)`
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Roll counter */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black border-2 transition-all ${
              rollCount >= n
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
            }`}
          >
            {n}
          </div>
        ))}
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 ml-1">
          {rollCount === 0
            ? 'Roll up to 3 times'
            : rollCount === 3
            ? 'Max rolls reached'
            : `Roll ${rollCount} of 3`}
        </span>
      </div>

      {/* Dice tray */}
      <div className="flex justify-center gap-3 flex-wrap py-2">
        {dice.map((d) => (
          <Die
            key={d.id}
            value={d.value}
            held={d.kept}
            animating={isAnimating && !d.kept}
            onClick={rollCount > 0 && !isAnimating ? () => handleToggleKeep(d.id) : undefined}
            disabled={rollCount === 0 || isAnimating}
          />
        ))}
      </div>

      {/* Hint */}
      {rollCount > 0 && rollCount < 3 && !isAnimating && (
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Tap a die to keep it between rolls • Gold dice are held
        </p>
      )}

      {/* Roll button */}
      {canRoll && (
        <button
          onClick={doRoll}
          className="w-full rounded-xl bg-blue-600 py-3.5 text-lg font-bold text-white shadow-md shadow-blue-500/20 transition active:scale-95"
        >
          {rollLabel}
        </button>
      )}

      {/* Reset */}
      {rollCount > 0 && (
        <button
          onClick={handleReset}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 transition active:scale-95"
        >
          Reset Turn
        </button>
      )}

      {/* Category suggestions */}
      {categoryScores && rollCount > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Category Scores
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <SuggestionSection
              title="Upper"
              categories={YAHTZEE_UPPER_CATEGORIES}
              scores={categoryScores}
              usedIds={usedCategoryIds}
            />
            <SuggestionSection
              title="Lower"
              categories={YAHTZEE_LOWER_CATEGORIES}
              scores={categoryScores}
              usedIds={usedCategoryIds}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionSection({
  title,
  categories,
  scores,
  usedIds,
}: {
  title: string;
  categories: { id: string; name: string }[];
  scores: Record<string, number>;
  usedIds: string[];
}) {
  return (
    <div>
      <div className="px-3 py-1 bg-slate-50 dark:bg-slate-900/50">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          {title}
        </p>
      </div>
      <div className="grid grid-cols-2">
        {categories.map((cat) => {
          const score = scores[cat.id] ?? 0;
          const used = usedIds.includes(cat.id);
          const isGood = score > 0;
          return (
            <div
              key={cat.id}
              className={`flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${
                used ? 'opacity-35' : ''
              }`}
            >
              <span
                className={`text-xs font-semibold truncate pr-1 ${
                  isGood && !used
                    ? 'text-slate-700 dark:text-slate-200'
                    : 'text-slate-400 dark:text-slate-600'
                }`}
              >
                {cat.name}
              </span>
              <span
                className={`text-sm font-black shrink-0 ${
                  isGood && !used
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
