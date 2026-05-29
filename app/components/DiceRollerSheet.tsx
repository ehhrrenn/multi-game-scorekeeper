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

  const title = gameType === 'farkle' ? '⚂ Farkle Dice Roller' : '⚂ Yahtzee Dice Roller';

  return (
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/45"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[100] mx-auto max-w-screen-md border-x border-t border-black/30 bg-[#f7f7f2] text-black shadow-[0_-10px_30px_rgba(0,0,0,0.22)] animate-in slide-in-from-bottom-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-black text-black tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border border-black/20 bg-white text-black/70 text-lg transition active:scale-90"
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
