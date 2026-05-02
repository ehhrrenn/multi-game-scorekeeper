// app/components/GameCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatFirstName } from '../../lib/cloudPlayers';

// --- Types ---
type PlayerSnapshot = {
  id: string;
  name: string;
  emoji: string;
  isCloudUser?: boolean;
  photoURL?: string;
  useCustomEmoji?: boolean;
};
type Round = { roundId: number; scores: Record<string, number> };
type YahtzeeScoreMap = Record<string, Record<string, (number | null)[]>>;
type GameSettings = { target: number; scoreDirection: 'UP' | 'DOWN' };
type FarkleMode = 'regular' | 'stealing';
type FarkleScoreMap = Record<string, Record<string, number | null>>;
type FarkleSettings = { targetScore: number; roundCount: number | null };
type StandingsPlayer = PlayerSnapshot & { score: number };

export type GameRecord = {
  gameId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds?: Round[];
  yahtzeeScores?: YahtzeeScoreMap;
  isTripleYahtzee?: boolean;
  farkleScores?: FarkleScoreMap;
  farkleMode?: FarkleMode;
  farkleSettings?: FarkleSettings;
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

type GameCardProps = {
  game: GameRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (gameId: string) => void;
};

export default function GameCard({ game, isExpanded, onToggle, onDelete }: GameCardProps) {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'STANDINGS' | 'GRID' | 'GRAPH'>('STANDINGS');

  const isCountDown = game.settings?.scoreDirection === 'DOWN';
  const standings = [...game.activePlayerIds]
        .map(pId => {
          // Find the player's snapshot, or provide a fallback with ALL expected fields
          const snapshot = game.playerSnapshots.find(p => p.id === pId) || {
            name: 'Unknown',
            emoji: '👤',
            isCloudUser: false,
            photoURL: undefined,
            useCustomEmoji: false
          };
          
          return {
            ...snapshot,                       // 1. Spread the snapshot first
            id: pId,                           // 2. Explicitly set the ID
            score: game.finalScores[pId] || 0, // 3. Set the score
          };
        })

  const displayPlayerName = (player: PlayerSnapshot) => player.isCloudUser ? formatFirstName(player.name) : player.name;

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isYahtzeeGame = game.gameName === 'Yahtzee' || game.gameName === 'Triple Yahtzee' || Boolean(game.yahtzeeScores);
    const isFarkleGame = game.gameName === 'Farkle' || game.gameName === 'Farkle Stealing' || Boolean(game.farkleScores) || Boolean(game.farkleMode);

    window.localStorage.setItem('scorekeeper_active_game_id', game.gameId);

    if (isYahtzeeGame) {
      const yahtzeePlayers = game.activePlayerIds
        .map((id) => game.playerSnapshots.find((player) => player.id === id))
        .filter((player): player is PlayerSnapshot => Boolean(player));

      window.localStorage.setItem('yahtzee_players', JSON.stringify(yahtzeePlayers));
      window.localStorage.setItem('yahtzee_scores_v2', JSON.stringify(game.yahtzeeScores || {}));
      window.localStorage.setItem('yahtzee_is_triple', JSON.stringify(Boolean(game.isTripleYahtzee || game.gameName === 'Triple Yahtzee')));
      router.push('/yahtzee');
      return;
    }

    if (isFarkleGame) {
      const farklePlayers = game.activePlayerIds
        .map((id) => game.playerSnapshots.find((player) => player.id === id))
        .filter((player): player is PlayerSnapshot => Boolean(player));

      const roundIndexes = game.savedRounds?.map((round) => round.roundId - 1) || [];
      const currentRoundIndex = roundIndexes.length > 0 ? Math.max(...roundIndexes) : 0;

      window.localStorage.setItem('farkle_players', JSON.stringify(farklePlayers));
      window.localStorage.setItem('farkle_scores', JSON.stringify(game.farkleScores || {}));
      window.localStorage.setItem('farkle_mode', JSON.stringify(game.farkleMode || 'regular'));
      window.localStorage.setItem('farkle_settings', JSON.stringify(game.farkleSettings || { targetScore: game.settings?.target || 10000, roundCount: null }));
      window.localStorage.setItem('farkle_phase', JSON.stringify('PLAYING'));
      window.localStorage.setItem('farkle_current_round', JSON.stringify(currentRoundIndex));
      window.localStorage.setItem('farkle_current_player', JSON.stringify(0));
      router.push('/farkle');
      return;
    }

    window.localStorage.setItem('scorekeeper_gameName', JSON.stringify(game.gameName));
    window.localStorage.setItem('scorekeeper_settings', JSON.stringify(game.settings || { target: 0, scoreDirection: 'UP' }));
    
    const activePlayers = game.activePlayerIds.map(id => game.playerSnapshots.find(p => p.id === id)).filter(Boolean);
    window.localStorage.setItem('scorekeeper_players', JSON.stringify(activePlayers));
    window.localStorage.setItem('scorekeeper_rounds', JSON.stringify(game.savedRounds || [{ roundId: 1, scores: {} }]));
    
    router.push('/custom');
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareText = `🏆 ${game.gameName} Results:\n` + 
      standings.map((s, i) => `${i + 1}. ${s.emoji} ${displayPlayerName(s)}: ${s.score}`).join('\n');

    if (navigator.share) {
      navigator.share({ title: `${game.gameName} Results`, text: shareText })
        .catch(err => console.log('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(shareText);
      alert('Leaderboard copied to clipboard!');
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(game.gameId);
    setShowDeleteConfirm(false);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const bestScore = standings[0]?.score;
  const winners = standings.filter(s => s.score === bestScore);
  const winnerNames = winners.map(w => `${w.emoji} ${displayPlayerName(w)}`).join(', ');

  const formattedDate = (() => {
    const parsed = new Date(game.date);
    return Number.isNaN(parsed.getTime())
      ? game.date
      : new Intl.DateTimeFormat('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(parsed);
  })();

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
      
      <div onClick={onToggle} className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex flex-col gap-3 relative group">
        <div className="absolute top-4 right-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors">
          {isExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          )}
        </div>

        <div className="flex justify-between items-start pr-8">
          <div>
            <h3 className="font-black text-slate-800 dark:text-white text-lg">{game.gameName}</h3>
            <p className="text-xs font-bold text-slate-400">{formattedDate}</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Winner</p>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
              {winnerNames || 'Draw'}
            </p>
          </div>
        </div>
        
        {/* ADDED PLAYER NAMES TO COLLAPSED PILLS */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2 overflow-x-auto scrollbar-hide">
          {standings.map(p => (
            <div key={p.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold whitespace-nowrap ${winners.some(w => w.id === p.id) ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
              <span className="text-sm w-5 h-5 flex items-center justify-center overflow-hidden">{p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
  <img src={p.photoURL} alt={p.name} className="w-full h-full object-cover rounded-full" />
) : (
  <span>{p.emoji || '👤'}</span>
)}</span>
              <span className="max-w-[70px] truncate">{displayPlayerName(p)}</span>
              <span className="opacity-40 ml-0.5">|</span>
              <span className="ml-0.5">{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-4 fade-in duration-300">
          
          <div className="flex gap-2 mb-5">
            {/* CHANGED RESUME TO EDIT */}
            <button onClick={handleResume} className="flex-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold py-2 rounded-xl text-sm transition-all active:scale-95">
              ✏️ Edit Game
            </button>
            <button onClick={handleShare} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-4 rounded-xl text-sm transition-all active:scale-95">
              📤 Share
            </button>

            {showDeleteConfirm ? (
              <div className="flex gap-1 animate-in fade-in slide-in-from-right-2">
                <button onClick={confirmDelete} className="bg-red-500 text-white font-bold px-3 rounded-xl text-xs transition-all active:scale-95 shadow-sm shadow-red-500/20">Delete</button>
                <button onClick={cancelDelete} className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold px-3 rounded-xl text-xs transition-all active:scale-95">Cancel</button>
              </div>
            ) : (
              <button onClick={handleDeleteClick} className="bg-red-50 dark:bg-red-900/20 text-red-500 font-bold px-4 rounded-xl text-sm transition-all active:scale-95">
                🗑️
              </button>
            )}
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
            <button onClick={() => setActiveTab('STANDINGS')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'STANDINGS' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>🏆 Standings</button>
            <button onClick={() => setActiveTab('GRID')} disabled={!game.savedRounds || game.savedRounds.length === 0} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'GRID' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-300'}`}>🧮 Grid</button>
            <button onClick={() => setActiveTab('GRAPH')} disabled={!game.savedRounds || game.savedRounds.length <= 1} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'GRAPH' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:text-slate-700 dark:hover:text-slate-300'}`}>📈 Graph</button>
          </div>

          {activeTab === 'STANDINGS' && (
            <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-3 animate-in fade-in">
              {standings.map((p, i) => (
                <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-0 border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className={`font-black w-4 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-300 dark:text-slate-600'}`}>{i + 1}</span>
                    <span className="text-xl w-7 h-7 flex items-center justify-center overflow-hidden">{p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
  <img src={p.photoURL} alt={p.name} className="w-full h-full object-cover rounded-full" />
) : (
  <span>{p.emoji || '👤'}</span>
)}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{displayPlayerName(p)}</span>
                  </div>
                  <span className="font-black text-lg">{p.score}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'GRID' && game.savedRounds && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-in fade-in">
              <table className="w-full text-center text-sm border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="p-2 w-12 text-slate-500 border-b border-slate-200 dark:border-slate-700 font-normal">Rnd</th>
                    {standings.map(p => (
                      <th key={p.id} className="p-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="text-lg w-7 h-7 flex items-center justify-center overflow-hidden mx-auto">{p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
  <img src={p.photoURL} alt={p.name} className="w-full h-full object-cover rounded-full" />
) : (
  <span>{p.emoji || '👤'}</span>
)}</div>
                        <div className="text-[10px] font-bold uppercase text-slate-500 truncate max-w-[60px] mx-auto">{displayPlayerName(p)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {game.savedRounds.map((round) => (
                    <tr key={round.roundId} className="border-b last:border-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="p-2 font-bold text-slate-400 border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30">{round.roundId}</td>
                      {standings.map(p => (
                        <td key={p.id} className="p-2 text-slate-700 dark:text-slate-300 font-medium border-l border-slate-50 dark:border-slate-800/50">
                          {round.scores[p.id] !== undefined ? round.scores[p.id] : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-950 border-t-2 border-slate-200 dark:border-slate-700 shadow-[0_-4px_6px_rgba(0,0,0,0.05)]">
                  <tr>
                    <td className="p-2 font-black text-slate-400 uppercase text-[10px] border-r border-slate-200 dark:border-slate-700">Tot</td>
                    {standings.map(p => (
                      <td key={p.id} className={`p-2 font-black text-lg ${p.score === bestScore ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                        {p.score}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {activeTab === 'GRAPH' && game.savedRounds && (
            <div className="bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl overflow-hidden animate-in fade-in">
              <svg viewBox="-40 -10 500 220" className="w-full h-auto overflow-visible">
                {(() => {
                  const pointsData = standings.map(p => {
                    let runningTotal = game.settings?.scoreDirection === 'DOWN' ? (game.settings.target || 0) : 0;
                    const points = [runningTotal];
                    game.savedRounds!.forEach(r => {
                      if (game.settings?.scoreDirection === 'DOWN') runningTotal -= (r.scores[p.id] || 0);
                      else runningTotal += (r.scores[p.id] || 0);
                      points.push(runningTotal);
                    });
                    return { emoji: p.emoji, name: p.name, isCloudUser: p.isCloudUser, finalScore: runningTotal, points };
                  });
                  
                  const allScores = pointsData.flatMap(d => d.points);
                  const max = Math.max(...allScores, 10);
                  const min = Math.min(...allScores, 0);
                  const range = max - min || 1;
                  const xStep = 400 / Math.max(game.savedRounds!.length, 1);
                  
                  const labelData = pointsData.map((d) => {
                    const finalY = 200 - ((d.finalScore - min) / range) * 200;
                    return { ...d, targetY: finalY };
                  }).sort((a, b) => a.targetY - b.targetY);
                  
                  for (let i = 1; i < labelData.length; i++) {
                    if (labelData[i].targetY - labelData[i - 1].targetY < 20) {
                      labelData[i].targetY = labelData[i - 1].targetY + 20;
                    }
                  }

                  const colors = ['#3b82f6', '#ec4899', '#22c55e', '#f97316', '#a855f7', '#8b5cf6', '#ef4444', '#06b6d4'];

                  return (
                    <>
                      {min < 0 && <line x1="0" y1={200 - ((0 - min) / range) * 200} x2="400" y2={200 - ((0 - min) / range) * 200} stroke="#cbd5e1" strokeDasharray="4" className="dark:stroke-slate-700" />}
                      {pointsData.map((d, i) => (
                        <polyline key={`line-${i}`} points={d.points.map((val, idx) => `${idx * xStep},${200 - ((val - min) / range) * 200}`).join(' ')} fill="none" stroke={colors[i % colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      ))}
                      {/* ADDED PLAYER NAMES TO GRAPH LABELS */}
                      {labelData.map((d, i) => (
                        <text key={`label-${i}`} x="408" y={d.targetY + 5} fontSize="12" fill={colors[i % colors.length]} className="font-bold drop-shadow-sm">
                          {d.finalScore} {d.emoji} {(d.isCloudUser ? formatFirstName(d.name) : d.name).substring(0,6)}
                        </text>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
