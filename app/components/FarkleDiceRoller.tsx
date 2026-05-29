// app/components/FarkleDiceRoller.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Die from './Die';
import { hasAnyScoringDice, scoreDice } from '../../lib/farkleScoring';

type DieState = { id: number; value: number; held: boolean };
type Phase = 'idle' | 'rolling' | 'scored' | 'farkled' | 'hot-dice';

function randomDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

const INITIAL_DICE: DieState[] = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  value: 1,
  held: false,
}));

const ROLL_DURATION_MS = 620;
const CYCLE_INTERVAL_MS = 80;

export default function FarkleDiceRoller() {
  const [dice, setDice] = useState<DieState[]>(INITIAL_DICE);
  const [phase, setPhase] = useState<Phase>('idle');
  const [lockedIds, setLockedIds] = useState<Set<number>>(new Set()); // held before this sub-roll
  const [turnTotal, setTurnTotal] = useState(0);
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

  const roll = useCallback(
    (diceToRoll: DieState[], currentLockedIds: Set<number>) => {
      setPhase('rolling');
      setIsAnimating(true);

      // Pre-compute final values
      const finalDice = diceToRoll.map((d) =>
        d.held ? d : { ...d, value: randomDie() }
      );
      settleFinalRef.current = finalDice;

      // Cycle non-held dice rapidly for visual effect
      cycleRef.current = setInterval(() => {
        setDice((prev) =>
          prev.map((d) => (d.held ? d : { ...d, value: randomDie() }))
        );
      }, CYCLE_INTERVAL_MS);

      setTimeout(() => {
        clearCycle();
        setIsAnimating(false);
        setDice(settleFinalRef.current);

        const newlyRolled = settleFinalRef.current.filter(
          (d) => !currentLockedIds.has(d.id)
        );
        const newlyRolledValues = newlyRolled.map((d) => d.value);

        if (!hasAnyScoringDice(newlyRolledValues)) {
          setPhase('farkled');
        } else {
          setPhase('scored');
        }
      }, ROLL_DURATION_MS);
    },
    [clearCycle]
  );

  const handleFirstRoll = useCallback(() => {
    setLockedIds(new Set());
    setTurnTotal(0);
    roll(INITIAL_DICE, new Set());
  }, [roll]);

  const handleToggleHold = useCallback(
    (id: number) => {
      if (phase !== 'scored') return;
      if (lockedIds.has(id)) return; // can't unhold dice from prev sub-rolls
      setDice((prev) =>
        prev.map((d) => (d.id === id ? { ...d, held: !d.held } : d))
      );
    },
    [lockedIds, phase]
  );

  const handleRollAgain = useCallback(() => {
    // Must have held at least one NEW die (not locked from prev rolls)
    const newlyHeld = dice.filter((d) => d.held && !lockedIds.has(d.id));
    if (newlyHeld.length === 0) return;

    const allHeld = dice.filter((d) => d.held);

    // Check hot dice: all 6 held
    if (allHeld.length === 6) {
      // Hot dice — reset all and roll fresh, carrying forward the score
      const hotScore = scoreDice(allHeld.map((d) => d.value));
      setTurnTotal(hotScore);
      const resetDice = INITIAL_DICE.map((d) => ({ ...d, value: d.value }));
      setLockedIds(new Set());
      setDice(resetDice.map((d) => ({ ...d, held: false })));
      setPhase('hot-dice');
      // Brief delay to show hot-dice state, then roll
      setTimeout(() => {
        roll(resetDice.map((d) => ({ ...d, held: false })), new Set());
      }, 700);
      return;
    }

    const newLockedIds = new Set(allHeld.map((d) => d.id));
    const currentTotal = scoreDice(allHeld.map((d) => d.value));
    setTurnTotal(currentTotal);
    setLockedIds(newLockedIds);
    roll(dice, newLockedIds);
  }, [dice, lockedIds, roll]);

  const handleReset = useCallback(() => {
    clearCycle();
    setDice(INITIAL_DICE);
    setPhase('idle');
    setLockedIds(new Set());
    setTurnTotal(0);
    setIsAnimating(false);
  }, [clearCycle]);

  // ── Derived UI values ──────────────────────────────────────────
  const heldDice = dice.filter((d) => d.held);
  const newlyHeld = dice.filter((d) => d.held && !lockedIds.has(d.id));
  const canRollAgain =
    phase === 'scored' && newlyHeld.length > 0 && heldDice.length < 6;
  const canBank = phase === 'scored' && heldDice.length > 0;
  const liveTotal = heldDice.length > 0 ? scoreDice(heldDice.map((d) => d.value)) : 0;
  const displayTotal = turnTotal > 0 && heldDice.length === 0 ? turnTotal : liveTotal;

  const phaseMessage = (() => {
    if (phase === 'idle') return 'Tap Roll to start your turn';
    if (phase === 'rolling') return 'Rolling…';
    if (phase === 'farkled') return 'Farkle! No scoring dice - turn over.';
    if (phase === 'hot-dice') return '⚅ Hot Dice! Rolling all six again...';
    if (phase === 'scored') {
      if (heldDice.length === 0) return 'Tap scoring dice to hold them';
      if (newlyHeld.length === 0) return 'Hold at least one new die to roll again';
      return 'Hold more dice or roll again';
    }
    return '';
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Turn total */}
      <div className="border border-black/20 bg-white py-3 text-center">
        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-black/55">
          Turn Total
        </p>
        <p className="text-3xl font-black text-black">
          {displayTotal > 0 ? displayTotal.toLocaleString() : '—'}
        </p>
      </div>

      {/* Dice tray */}
      <div className="flex justify-center gap-3 flex-wrap py-2">
        {dice.map((d) => {
          const isLocked = lockedIds.has(d.id);
          const canToggle = phase === 'scored' && !isLocked;
          return (
            <Die
              key={d.id}
              value={d.value}
              held={d.held}
              locked={isLocked}
              animating={isAnimating && !d.held}
              onClick={canToggle ? () => handleToggleHold(d.id) : undefined}
              disabled={!canToggle}
            />
          );
        })}
      </div>

      {/* Phase message */}
      <p
        className={`text-center text-sm font-semibold min-h-[1.25rem] ${
          phase === 'farkled'
            ? 'text-black'
            : phase === 'hot-dice'
            ? 'text-black/80'
            : 'text-black/55'
        }`}
      >
        {phaseMessage}
      </p>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {phase === 'idle' && (
          <button
            onClick={handleFirstRoll}
            className="w-full border border-black/30 bg-black py-3.5 text-lg font-black text-white transition active:scale-95"
          >
            ⚂ Roll Dice
          </button>
        )}

        {phase === 'scored' && (
          <>
            <button
              onClick={handleRollAgain}
              disabled={!canRollAgain}
              className="w-full border border-black/30 bg-black py-3 text-base font-black text-white transition active:scale-95 disabled:border-black/15 disabled:bg-[#d9d9d3] disabled:text-black/35"
            >
              ⚂ Roll Again ({6 - heldDice.length} dice)
            </button>
            {canBank && (
              <p className="text-center text-xs text-black/55">
                Bank {displayTotal.toLocaleString()} pts — enter your score manually above
              </p>
            )}
          </>
        )}

        {phase === 'farkled' && (
          <button
            onClick={handleReset}
            className="w-full border border-black/30 bg-black py-3 text-base font-black text-white transition active:scale-95"
          >
            Start New Turn
          </button>
        )}

        {(phase === 'scored' || phase === 'idle') && phase !== 'idle' && (
          <button
            onClick={handleReset}
            className="w-full border border-black/20 bg-white py-2.5 text-sm font-bold text-black/70 transition active:scale-95"
          >
            Reset Turn
          </button>
        )}
      </div>

      {/* Hint */}
      {phase === 'scored' && (
        <p className="text-center text-xs text-black/55">
          Tap a die to hold it • Gold dice are set aside
        </p>
      )}
    </div>
  );
}
