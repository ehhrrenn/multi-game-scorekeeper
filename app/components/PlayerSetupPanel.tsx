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
      <h2 className="mb-2 ml-1 text-sm font-bold uppercase tracking-widest text-black/55">
        Saved Roster
      </h2>

      <div className="mb-2 flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
        {isLoading ? (
          <div className="whitespace-nowrap shrink-0 rounded-none border border-black/20 bg-white px-4 py-2.5 text-sm font-bold text-black/50">
            Loading roster...
          </div>
        ) : (
          rosterPlayers.map((player) => (
            <button
              key={player.id}
              onClick={() => onAddFromRoster(player)}
              className="whitespace-nowrap shrink-0 px-4 py-2.5 rounded-none text-sm font-bold bg-white text-black/80 border border-black/20 hover:border-black transition-all flex items-center gap-2 active:scale-95"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 overflow-hidden rounded-full">
                {player.isCloudUser && player.photoURL && !player.useCustomEmoji ? (
                  <img src={player.photoURL} alt={player.name} referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span>{player.emoji || '☞'}</span>
                )}
              </span>
              {formatName(player)}
              {player.isCloudUser && <span className="text-black/50 text-xs">◈</span>}
            </button>
          ))
        )}
        <button
          onClick={onNewPlayerClick}
          className="whitespace-nowrap shrink-0 px-4 py-2.5 rounded-none text-sm font-black uppercase tracking-[0.08em] text-white bg-black border border-black transition-colors hover:bg-white hover:text-black"
        >
          + New Player
        </button>
      </div>

      {createPlayerSlot}

      <div className="mb-2 ml-1 flex items-end justify-between mt-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-black/55">
          Active Players
        </h2>
      </div>

      <div className="space-y-3">
        {activePlayers.length === 0 ? (
          <div className="rounded-none border border-black/20 bg-[#fbfbf8] p-6 text-center text-black/55 font-medium">
            {emptyMessage}
          </div>
        ) : (
          activePlayers.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center gap-3 rounded-none border border-black/20 bg-[#fbfbf8] p-4"
            >
              <button
                onClick={() => onEmojiClick(player.id)}
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none border border-black/20 bg-white text-2xl"
              >
                {player.isCloudUser && player.photoURL && !player.useCustomEmoji ? (
                  <img src={player.photoURL} alt={player.name} referrerPolicy="no-referrer" className="h-full w-full object-cover rounded-none" />
                ) : (
                  <span>{player.emoji || '☞'}</span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-black text-black">
                  {formatName(player)}
                  {player.isCloudUser && <span className="ml-2 text-sm text-black/50">◈</span>}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-black/50">
                  Player {index + 1}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onMove(index, 'UP')}
                  disabled={index === 0}
                  className="h-10 w-10 rounded-none border border-black/20 bg-white font-black text-black/70 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => onMove(index, 'DOWN')}
                  disabled={index === activePlayers.length - 1}
                  className="h-10 w-10 rounded-none border border-black/20 bg-white font-black text-black/70 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  onClick={() => onRemove(player.id)}
                  className="h-10 w-10 rounded-none border border-black/20 bg-white font-black text-black"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {onClearSetup && activePlayers.length > 0 && (
        <button
          onClick={onClearSetup}
          className="mt-6 w-full border border-black/30 bg-black py-3.5 text-sm font-black uppercase tracking-[0.12em] text-white transition-colors active:bg-white active:text-black"
        >
          Clear Setup
        </button>
      )}
    </>
  );
}
