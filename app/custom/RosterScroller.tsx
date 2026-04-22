'use client';

import { useState } from 'react';

type Player = { id: string; name: string; emoji: string };

type Props = {
  roster: Player[];
  activeIds: string[];
  onToggle: (playerId: string) => void;

  newName: string;
  setNewName: (val: string) => void;
  onAddNew: () => void;

  className?: string;
};

export default function RosterScroller({
  roster,
  activeIds,
  onToggle,
  newName,
  setNewName,
  onAddNew,
  className = '',
}: Props) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">
          Active Roster
        </h2>

        <button
          type="button"
          onClick={() => setShowAdd(v => !v)}
          className="text-sm font-bold bg-slate-100 text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-200 active:scale-95 transition"
        >
          + Add New
        </button>
      </div>

      {/* Scrollable roster */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3">
        {roster.length === 0 ? (
          <div className="p-4 text-center text-slate-400">
            No players in your roster yet. Tap “Add New” to create one.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {roster.map(p => {
              const selected = activeIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggle(p.id)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl border text-left transition active:scale-[0.98]
                    ${selected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}
                  `}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.emoji}</span>
                    <span className="font-bold text-sm max-w-[120px] truncate">{p.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Add new player input */}
      {showAdd && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New player name..."
            className="border-2 border-slate-200 p-3 rounded-xl flex-grow focus:outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => {
              onAddNew();
              setShowAdd(false);
            }}
            className="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition"
          >
            Add
          </button>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-2 ml-1">
        Tap a player to select/unselect them for this game.
      </p>
    </div>
  );
}