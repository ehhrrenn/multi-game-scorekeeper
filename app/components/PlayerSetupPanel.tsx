// app/components/PlayerSetupPanel.tsx
'use client';

import React from 'react';

export type SetupPlayer = {
  id: string;
  name: string;
  emoji: string;
  photoURL?: string;
  isCloudUser?: boolean;
  useCustomEmoji?: boolean;
};

type Props = {
  rosterPlayers: SetupPlayer[];
  activePlayers: SetupPlayer[];
  isLoading?: boolean;
  formatName: (player: SetupPlayer) => string;
  onAddFromRoster: (player: SetupPlayer) => void;
  onRemove: (playerId: string) => void;
  onMove: (index: number, direction: 'UP' | 'DOWN') => void;
  onEmojiClick: (playerId: string) => void;
  onNewPlayerClick: () => void;
  createPlayerSlot?: React.ReactNode;
  emptyMessage?: string;
  onClearSetup?: () => void;
};

export default function PlayerSetupPanel({
  rosterPlayers,
  activePlayers,
  isLoading,
  formatName,
  onAddFromRoster,
  onRemove,
  onMove,
  onEmojiClick,
  onNewPlayerClick,
  createPlayerSlot,
  emptyMessage = 'No players added yet. Select from the roster above.',
  onClearSetup,
}: Props) {
  return (
    <>
      <h2 className="mb-2 ml-1 text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        Saved Roster
      </h2>

      <div className="mb-2 flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
        {isLoading ? (
          <div className="whitespace-nowrap shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900">
            Loading roster...
          </div>
        ) : (
          rosterPlayers.map((player) => (
            <button
              key={player.id}
              onClick={() => onAddFromRoster(player)}
              className="whitespace-nowrap shrink-0 px-4 py-2.5 rounded-full text-sm font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm transition-all flex items-center gap-2 active:scale-95"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 overflow-hidden rounded-full">
                {player.isCloudUser && player.photoURL && !player.useCustomEmoji ? (
                  <img src={player.photoURL} alt={player.name} referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span>{player.emoji || '👤'}</span>
                )}
              </span>
              {formatName(player)}
              {player.isCloudUser && <span className="text-blue-500 text-xs">☁️</span>}
            </button>
          ))
        )}
        <button
          onClick={onNewPlayerClick}
          className="whitespace-nowrap shrink-0 px-4 py-2.5 rounded-full text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 transition-all"
        >
          + New Player
        </button>
      </div>

      {createPlayerSlot}

      <div className="mb-2 ml-1 flex items-end justify-between mt-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Active Players
        </h2>
        {onClearSetup && activePlayers.length > 0 && (
          <button onClick={onClearSetup} className="text-sm font-bold text-red-500">
            Clear Setup
          </button>
        )}
      </div>

      <div className="space-y-3">
        {activePlayers.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 font-medium shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {emptyMessage}
          </div>
        ) : (
          activePlayers.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                onClick={() => onEmojiClick(player.id)}
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-2xl shadow-sm dark:bg-slate-800"
              >
                {player.isCloudUser && player.photoURL && !player.useCustomEmoji ? (
                  <img src={player.photoURL} alt={player.name} referrerPolicy="no-referrer" className="h-full w-full object-cover rounded-full" />
                ) : (
                  <span>{player.emoji || '👤'}</span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-black text-slate-800 dark:text-white">
                  {formatName(player)}
                  {player.isCloudUser && <span className="ml-2 text-sm">☁️</span>}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Player {index + 1}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onMove(index, 'UP')}
                  disabled={index === 0}
                  className="h-10 w-10 rounded-xl bg-slate-100 font-black text-slate-600 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-300"
                >
                  ↑
                </button>
                <button
                  onClick={() => onMove(index, 'DOWN')}
                  disabled={index === activePlayers.length - 1}
                  className="h-10 w-10 rounded-xl bg-slate-100 font-black text-slate-600 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-300"
                >
                  ↓
                </button>
                <button
                  onClick={() => onRemove(player.id)}
                  className="h-10 w-10 rounded-xl bg-red-50 font-black text-red-500 dark:bg-red-900/20 dark:text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
