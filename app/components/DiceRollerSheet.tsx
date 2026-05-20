// app/components/DiceRollerSheet.tsx
'use client';

import React from 'react';
import FarkleDiceRoller from './FarkleDiceRoller';
import YahtzeeDiceRoller from './YahtzeeDiceRoller';

type Props = {
  open: boolean;
  onClose: () => void;
  gameType: 'farkle' | 'yahtzee';
  /** Yahtzee only: category IDs the active player has already scored. */
  usedCategoryIds?: string[];
};

export default function DiceRollerSheet({ open, onClose, gameType, usedCategoryIds }: Props) {
  if (!open) return null;

  const title = gameType === 'farkle' ? '🎲 Farkle Dice Roller' : '🎲 Yahtzee Dice Roller';

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[100] mx-auto max-w-screen-md rounded-t-2xl border-t-2 border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md animate-in slide-in-from-bottom-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-black text-slate-800 dark:text-white tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-lg transition active:scale-90"
            aria-label="Close dice roller"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="overflow-y-auto max-h-[80dvh] px-4 pb-24">
          {gameType === 'farkle' ? (
            <FarkleDiceRoller />
          ) : (
            <YahtzeeDiceRoller usedCategoryIds={usedCategoryIds} />
          )}
        </div>
      </div>
    </>
  );
}
