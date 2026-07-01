// app/components/GameCard.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { formatFirstName } from '../../lib/cloudPlayers';
import { buildYahtzeeGraphSeries, type YahtzeeScoreEntry } from '../../lib/gameHistory';

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
type GameSettings = { target: number; scoreDirection: 'UP' | 'DOWN'; endMode?: 'TARGET' | 'ROUNDS'; roundLimit?: number };
type FarkleMode = 'regular' | 'stealing';
type FarkleScoreMap = Record<string, Record<string, number | null>>;
type FarkleSettings = { targetScore: number; roundCount: number | null };

export type GameRecord = {
  gameId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds?: Round[];
  yahtzeeScores?: YahtzeeScoreMap;
  yahtzeeScoreEntries?: YahtzeeScoreEntry[];
  isTripleYahtzee?: boolean;
  farkleScores?: FarkleScoreMap;
  farkleMode?: FarkleMode;
  farkleSettings?: FarkleSettings;
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
  winCondition?: 'HIGH' | 'LOW';
};

type GameCardProps = {
  game: GameRecord;
  winnerIds: string[];
  isComplete: boolean;
  canFinish: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (gameId: string) => void;
  onFinish: () => void;
};

export default function GameCard({ game, winnerIds, isComplete, canFinish, isExpanded, onToggle, onDelete, onFinish }: GameCardProps) {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'STANDINGS' | 'GRID' | 'GRAPH'>('STANDINGS');

  // Determine sort order: use stored winCondition if available, else fall back to scoreDirection
  const isLowestWins = game.winCondition ? game.winCondition === 'LOW' : game.settings?.scoreDirection === 'DOWN';
  const standings = [...game.activePlayerIds]
        .map(pId => {
          // Find the player's snapshot, or provide a fallback with ALL expected fields
          const snapshot = game.playerSnapshots.find(p => p.id === pId) || {
            name: 'Unknown',
            emoji: '☞',
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
        .sort((a, b) => {
          if (isLowestWins) {
            return a.score - b.score;
          }

          return b.score - a.score;
        });

  const displayPlayerName = (player: PlayerSnapshot) => player.isCloudUser ? formatFirstName(player.name) : player.name;
  const yahtzeeFilledCellCount = game.yahtzeeScores
    ? Object.values(game.yahtzeeScores).reduce((playerCount, playerScores) => (
        playerCount + Object.values(playerScores).reduce((cellCount, values) => (
          cellCount + values.filter((value) => value !== null && value !== undefined).length
        ), 0)
      ), 0)
    : 0;
  const canShowRoundGraph = Boolean(game.savedRounds && game.savedRounds.length > 1);
  const canShowYahtzeeGraph = Boolean(game.yahtzeeScores) && Math.max(game.yahtzeeScoreEntries?.length || 0, yahtzeeFilledCellCount) > 1;

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
  window.localStorage.setItem('yahtzee_score_entries_v1', JSON.stringify(game.yahtzeeScoreEntries || []));
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

    // For custom games, include a direct handoff record so edit works even when local history hydrates late.
    window.localStorage.setItem('scorekeeper_edit_game_record', JSON.stringify(game));
    router.push(`/custom?gameId=${game.gameId}`);
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

  const winners = standings.filter((standing) => winnerIds.includes(standing.id));
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
    <div className="bg-[#fbfbf8] border border-black/20 rounded-none overflow-hidden transition-all duration-300">
      
      <div onClick={onToggle} className="p-4 cursor-pointer hover:bg-black/5 transition-colors flex flex-col gap-3 relative group">
        <div className="absolute top-4 right-4 text-black/35 group-hover:text-black/55 transition-colors">
          {isExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          )}
        </div>

        <div className="flex justify-between items-start pr-8">
          <div>
            <h3 className="font-black text-[#111] text-lg [font-family:Georgia,'Times_New_Roman',serif]">{game.gameName}</h3>
            <p className="text-xs font-bold text-black/55 uppercase tracking-[0.12em]">{formattedDate}</p>
          </div>
          {isComplete ? (
            <div className="bg-white px-3 py-1.5 rounded-none border border-black/10 text-right">
              <p className="text-[10px] font-bold text-black/55 uppercase tracking-widest mb-0.5">Winner</p>
              <p className="text-sm font-bold text-black truncate max-w-[120px]">
                {winnerNames || 'Draw'}
              </p>
            </div>
          ) : (
            <div className="bg-white px-3 py-1.5 rounded-none text-right border border-black/10">
              <p className="text-[10px] font-bold text-black/55 uppercase tracking-widest mb-0.5">Status</p>
              <p className="text-sm font-bold text-black">Incomplete</p>
            </div>
          )}
        </div>
        
        <div className="pt-3 border-t border-black/10 flex gap-2 overflow-x-auto scrollbar-hide">
          {standings.map(p => (
            <div key={p.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-none border text-xs font-bold whitespace-nowrap ${isComplete && winners.some(w => w.id === p.id) ? 'bg-white text-black border-black/20' : 'bg-white text-black/65 border-black/10'}`}>
              <span className="text-sm w-5 h-5 flex items-center justify-center overflow-hidden">{p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
  <Image src={p.photoURL} alt={p.name} width={20} height={20} unoptimized className="w-full h-full object-cover rounded-none" />
) : (
  <span>{p.emoji || '✤'}</span>
)}</span>
              <span className="max-w-[70px] truncate">{displayPlayerName(p)}</span>
              <span className="opacity-40 ml-0.5">|</span>
              <span className="ml-0.5">{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-black/10 animate-in slide-in-from-top-4 fade-in duration-300">
          
          <div className="flex gap-2 mb-5">
            {/* CHANGED RESUME TO EDIT */}
            <button onClick={handleResume} className="flex-1 bg-white text-black font-bold py-2 rounded-none text-sm border border-black/20 transition-all active:translate-y-px uppercase tracking-[0.08em]">
              ✎ Edit Game
            </button>
            {canFinish && (
              <button onClick={onFinish} className="bg-white text-black font-bold px-4 rounded-none text-sm border border-black/20 transition-all active:translate-y-px uppercase tracking-[0.08em]">
                ✓ Finish & Close
              </button>
            )}
            <button onClick={handleShare} className="bg-white text-black font-bold px-4 rounded-none text-sm border border-black/20 transition-all active:translate-y-px uppercase tracking-[0.08em]">
              ↗ Share
            </button>

            {showDeleteConfirm ? (
              <div className="flex gap-1 animate-in fade-in slide-in-from-right-2">
                <button onClick={confirmDelete} className="bg-black text-white font-bold px-3 rounded-none text-xs transition-all active:translate-y-px uppercase tracking-[0.08em] border border-black">Delete</button>
                <button onClick={cancelDelete} className="bg-white text-black font-bold px-3 rounded-none text-xs transition-all active:translate-y-px uppercase tracking-[0.08em] border border-black/20">Cancel</button>
              </div>
            ) : (
              <button onClick={handleDeleteClick} className="bg-white text-black font-bold px-4 rounded-none text-sm transition-all active:translate-y-px border border-black/20 uppercase tracking-[0.08em]">
                ✕
              </button>
            )}
          </div>

          <div className="flex bg-white p-1 rounded-none mb-4 border border-black/20">
            <button onClick={() => setActiveTab('STANDINGS')} className={`flex-1 py-1.5 rounded-none text-xs font-bold uppercase tracking-[0.08em] transition-all ${activeTab === 'STANDINGS' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'}`}>✪ Standings</button>
            <button onClick={() => setActiveTab('GRID')} disabled={!game.savedRounds || game.savedRounds.length === 0} className={`flex-1 py-1.5 rounded-none text-xs font-bold uppercase tracking-[0.08em] transition-all ${activeTab === 'GRID' ? 'bg-black text-white' : 'text-black/60 disabled:opacity-30 hover:bg-black/5'}`}>✚ Grid</button>
            <button onClick={() => setActiveTab('GRAPH')} disabled={!canShowRoundGraph && !canShowYahtzeeGraph} className={`flex-1 py-1.5 rounded-none text-xs font-bold uppercase tracking-[0.08em] transition-all ${activeTab === 'GRAPH' ? 'bg-black text-white' : 'text-black/60 disabled:opacity-30 hover:bg-black/5'}`}>✧ Graph</button>
          </div>

          {activeTab === 'STANDINGS' && (
            <div className="bg-white border border-black/20 rounded-none p-3 animate-in fade-in">
              {standings.map((p, i) => (
                <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-0 border-black/10">
                  <div className="flex items-center gap-3">
                    <span className={`font-black w-4 text-center ${i === 0 ? 'text-black' : i === 1 ? 'text-black/70' : i === 2 ? 'text-black/55' : 'text-black/40'}`}>{i + 1}</span>
                    <span className="text-xl w-7 h-7 flex items-center justify-center overflow-hidden">{p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
  <Image src={p.photoURL} alt={p.name} width={28} height={28} unoptimized className="w-full h-full object-cover rounded-none" />
) : (
  <span>{p.emoji || '☞'}</span>
)}</span>
                    <span className="font-bold text-black">{displayPlayerName(p)}</span>
                  </div>
                  <span className="font-black text-lg">{p.score}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'GRID' && game.savedRounds && (
              <div className="rounded-none border border-black/20 bg-white animate-in fade-in overflow-hidden">
                <div className="overflow-x-auto">
              <table className="w-full text-center text-sm border-collapse">
                  <thead className="bg-[#f6f6f2] sticky top-0 z-10">
                  <tr>
                    <th className="p-2 w-12 text-black/55 border-b border-black/20 font-normal">Rnd</th>
                    {standings.map(p => (
                      <th key={p.id} className="p-2 border-b border-black/20">
                        <div className="text-lg w-7 h-7 flex items-center justify-center overflow-hidden mx-auto">{p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
  <Image src={p.photoURL} alt={p.name} width={28} height={28} unoptimized className="w-full h-full object-cover rounded-none" />
) : (
  <span>{p.emoji || '☞'}</span>
)}</div>
                        <div className="text-[10px] font-bold uppercase text-black/55 truncate max-w-[60px] mx-auto">{displayPlayerName(p)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {game.savedRounds.map((round) => (
                    <tr key={round.roundId} className="border-b last:border-0 border-black/10 hover:bg-black/5">
                      <td className="p-2 font-bold text-black/55 border-r border-black/10 bg-[#f6f6f2]">{round.roundId}</td>
                      {standings.map(p => (
                        <td key={p.id} className="p-2 text-black font-medium border-l border-black/5">
                          {round.scores[p.id] !== undefined ? round.scores[p.id] : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#f6f6f2] border-t border-black/20">
                  <tr>
                    <td className="p-2 font-black text-black/55 uppercase text-[10px] border-r border-black/20">Tot</td>
                    {standings.map(p => (
                      <td key={p.id} className={`p-2 font-black text-lg ${isComplete && winners.some((winner) => winner.id === p.id) ? 'text-black' : 'text-black'}`}>
                        {p.score}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
                </div>
            </div>
          )}

          {activeTab === 'GRAPH' && (canShowRoundGraph || canShowYahtzeeGraph) && (
            <div className="bg-white border border-black/20 p-4 rounded-none overflow-hidden animate-in fade-in">
              <svg viewBox="-40 -10 500 220" className="w-full h-auto overflow-visible">
                {(() => {
                  const colors = ['#3b82f6', '#ec4899', '#22c55e', '#f97316', '#a855f7', '#8b5cf6', '#ef4444', '#06b6d4'];

                  if (game.yahtzeeScores) {
                    const pointsData = buildYahtzeeGraphSeries({
                      players: standings,
                      scores: game.yahtzeeScores,
                      isTripleYahtzee: Boolean(game.isTripleYahtzee || game.gameName === 'Triple Yahtzee'),
                      scoreEntries: game.yahtzeeScoreEntries,
                    });

                    const allScores = pointsData.flatMap((d) => d.points);
                    const max = Math.max(...allScores, 10);
                    const min = Math.min(...allScores, 0);
                    const range = max - min || 1;
                    const longestPath = Math.max(...pointsData.map((d) => d.points.length), 1);
                    const xStep = 400 / Math.max(longestPath - 1, 1);

                    const labelData = pointsData.map((d) => {
                      const finalY = 200 - ((d.finalScore - min) / range) * 200;
                      return { ...d, targetY: finalY };
                    }).sort((a, b) => a.targetY - b.targetY);

                    for (let i = 1; i < labelData.length; i += 1) {
                      if (labelData[i].targetY - labelData[i - 1].targetY < 20) {
                        labelData[i].targetY = labelData[i - 1].targetY + 20;
                      }
                    }

                    return (
                      <>
                        {min < 0 && <line x1="0" y1={200 - ((0 - min) / range) * 200} x2="400" y2={200 - ((0 - min) / range) * 200} stroke="#cbd5e1" strokeDasharray="4" className="dark:stroke-slate-700" />}
                        {pointsData.map((d, i) => (
                          <polyline key={`line-${i}`} points={d.points.map((val, idx) => `${idx * xStep},${200 - ((val - min) / range) * 200}`).join(' ')} fill="none" stroke={colors[i % colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        ))}
                        {labelData.map((d, i) => (
                          <text key={`label-${i}`} x="408" y={d.targetY + 5} fontSize="12" fill={colors[i % colors.length]} className="font-bold">
                            {d.finalScore} {d.emoji} {(d.isCloudUser ? formatFirstName(d.name) : d.name).substring(0,6)}
                          </text>
                        ))}
                      </>
                    );
                  }

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

                  return (
                    <>
                      {min < 0 && <line x1="0" y1={200 - ((0 - min) / range) * 200} x2="400" y2={200 - ((0 - min) / range) * 200} stroke="#cbd5e1" strokeDasharray="4" className="dark:stroke-slate-700" />}
                      {pointsData.map((d, i) => (
                        <polyline key={`line-${i}`} points={d.points.map((val, idx) => `${idx * xStep},${200 - ((val - min) / range) * 200}`).join(' ')} fill="none" stroke={colors[i % colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      ))}
                      {/* ADDED PLAYER NAMES TO GRAPH LABELS */}
                      {labelData.map((d, i) => (
                        <text key={`label-${i}`} x="408" y={d.targetY + 5} fontSize="12" fill={colors[i % colors.length]} className="font-bold">
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
