// app/components/CatanPlayerBoard.tsx
'use client';

import Image from 'next/image';
import {
  CATAN_RESOURCE_IDS,
  CATAN_RESOURCE_LABELS,
  computeBaseVP,
  type CatanBoard,
  type CatanBuildState,
  type CatanResourceId,
} from '../../lib/catanScoring';

type Player = {
  id: string;
  name: string;
  emoji: string;
  photoURL?: string;
  isCloudUser?: boolean;
  useCustomEmoji?: boolean;
};

type Props = {
  player: Player;
  displayName: string;
  build: CatanBuildState;
  board: CatanBoard;
  holdsRoadBonus: boolean;
  holdsArmyBonus: boolean;
  isCurrentTurn: boolean;
  onToggleSettlement: (resource: CatanResourceId) => void;
  onToggleCity: (resource: CatanResourceId) => void;
  onRoadsChange: (delta: number) => void;
  onKnightsChange: (delta: number) => void;
};

export default function CatanPlayerBoard({
  player,
  displayName,
  build,
  board,
  holdsRoadBonus,
  holdsArmyBonus,
  isCurrentTurn,
  onToggleSettlement,
  onToggleCity,
  onRoadsChange,
  onKnightsChange,
}: Props) {
  const baseVP = computeBaseVP(build);
  const bonusVP = (holdsRoadBonus ? 2 : 0) + (holdsArmyBonus ? 2 : 0);
  const totalVP = baseVP + bonusVP;
  const isIsland2 = board === 'island2';

  return (
    <div
      className={`border bg-[#fbfbf8] p-4 transition-colors ${
        isCurrentTurn ? 'border-black ring-2 ring-inset ring-black/10' : 'border-black/20'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white border border-black/20 flex items-center justify-center text-xl overflow-hidden shrink-0">
            {player.isCloudUser && player.photoURL && !player.useCustomEmoji ? (
              <Image src={player.photoURL} alt={player.name} width={40} height={40} unoptimized referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            ) : (
              <span>{player.emoji || '☞'}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black text-black uppercase tracking-wide truncate">{displayName}</div>
            {isCurrentTurn && <div className="text-[10px] font-bold uppercase tracking-widest text-black/55">Current Turn</div>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-black text-black leading-none">{totalVP}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-black/45">VP</div>
        </div>
      </div>

      {isIsland2 && (holdsRoadBonus || holdsArmyBonus) && (
        <div className="flex gap-2 mb-3">
          {holdsRoadBonus && (
            <span className="text-[10px] font-black uppercase tracking-wide bg-black text-white px-2 py-1">⚐ Longest Road +2</span>
          )}
          {holdsArmyBonus && (
            <span className="text-[10px] font-black uppercase tracking-wide bg-black text-white px-2 py-1">⚔ Largest Army +2</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {CATAN_RESOURCE_IDS.map((resource) => {
          const hasSettlement = build.settlements[resource];
          const hasCity = build.cities[resource];
          return (
            <div key={resource} className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-black/50 truncate w-full text-center">
                {CATAN_RESOURCE_LABELS[resource]}
              </span>
              <button
                onClick={() => onToggleSettlement(resource)}
                aria-pressed={hasSettlement}
                className={`w-full h-9 border text-[11px] font-black transition-colors active:scale-95 ${
                  hasSettlement ? 'bg-black text-white border-black' : 'bg-white text-black/40 border-black/20'
                }`}
                title="Settlement (1 VP)"
              >
                ▲
              </button>
              <button
                onClick={() => onToggleCity(resource)}
                disabled={!hasSettlement}
                aria-pressed={hasCity}
                className={`w-full h-9 border text-[11px] font-black transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
                  hasCity ? 'bg-black text-white border-black' : 'bg-white text-black/40 border-black/20'
                }`}
                title="City (+2 VP)"
              >
                ⬢
              </button>
            </div>
          );
        })}
      </div>

      {isIsland2 && (
        <div className="flex gap-3">
          <div className="flex-1 flex items-center justify-between border border-black/20 bg-white px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-black/55">Roads</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onRoadsChange(-1)} disabled={build.roads <= 0} className="w-6 h-6 text-sm font-black disabled:opacity-30">−</button>
              <span className="w-4 text-center text-sm font-black">{build.roads}</span>
              <button onClick={() => onRoadsChange(1)} className="w-6 h-6 text-sm font-black">+</button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-between border border-black/20 bg-white px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-black/55">Knights</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onKnightsChange(-1)} disabled={build.knights <= 0} className="w-6 h-6 text-sm font-black disabled:opacity-30">−</button>
              <span className="w-4 text-center text-sm font-black">{build.knights}</span>
              <button onClick={() => onKnightsChange(1)} className="w-6 h-6 text-sm font-black">+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
