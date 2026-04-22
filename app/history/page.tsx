// app/history/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';

// --- Types ---
type Round = { roundId: number; scores: Record<string, number> };
type PlayerSnapshot = { id: string; name: string; emoji: string };

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots: PlayerSnapshot[];
};

// --- Helpers ---
const LINE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function HistoryPage() {
  const router = useRouter();
  
  // --- State ---
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [activeFilter, setActiveFilter] = useState<string>('All');
  
  // Accordion & Inner View State
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedView, setExpandedView] = useState<'STANDINGS' | 'GRID' | 'GRAPH'>('STANDINGS');

  // --- 1. Filter Logic ---
  const gameTypes = useMemo(() => {
    const types = new Set(matchHistory.map(m => m.gameName));
    return ['All', ...Array.from(types)];
  }, [matchHistory]);

  const filteredMatches = useMemo(() => {
    if (activeFilter === 'All') return matchHistory;
    return matchHistory.filter(m => m.gameName === activeFilter);
  }, [matchHistory, activeFilter]);

  // --- 2. Analytics Engine ---
  const { leaderboard, highScore } = useMemo(() => {
    const wins: Record<string, { name: string; emoji: string; count: number }> = {};
    let top = { score: -Infinity, name: '', emoji: '', date: '' };

    filteredMatches.forEach(match => {
      // Tally Wins
      if (match.winnerId) {
        const winner = match.playerSnapshots.find(p => p.id === match.winnerId);
        if (winner) {
          if (!wins[winner.id]) wins[winner.id] = { name: winner.name, emoji: winner.emoji, count: 0 };
          wins[winner.id].count += 1;
        }
      }

      // Find High Score
      Object.entries(match.finalScores).forEach(([pId, score]) => {
        if (score > top.score) {
          const player = match.playerSnapshots.find(p => p.id === pId);
          top = { score, name: player?.name || 'Unknown', emoji: player?.emoji || '👤', date: match.date };
        }
      });
    });

    return {
      leaderboard: Object.values(wins).sort((a, b) => b.count - a.count),
      highScore: top.score === -Infinity ? null : top
    };
  }, [filteredMatches]);

  // --- Actions ---
  const toggleAccordion = (matchId: string) => {
    const isExpanding = expandedId !== matchId;
    setExpandedId(isExpanding ? matchId : null);
    if (isExpanding) setExpandedView('STANDINGS'); // Reset to standings when opening a new card
  };

  const deleteMatch = (matchId: string) => {
    setMatchHistory(matchHistory.filter(m => m.matchId !== matchId));
    setExpandedId(null);
  };

  const resumeMatch = (match: MatchRecord) => {
    window.localStorage.setItem('scorekeeper_players', JSON.stringify(match.playerSnapshots));
    window.localStorage.setItem('scorekeeper_rounds', JSON.stringify(match.savedRounds));
    window.localStorage.setItem('scorekeeper_gameName', JSON.stringify(match.gameName));
    
    deleteMatch(match.matchId);
    router.push('/custom');
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      
      {/* HEADER & FILTER BAR */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="p-6 pb-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">History Vault</h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">Analyze your past games.</p>
        </div>
        
        <div className="flex gap-2 overflow-x-auto px-6 pb-4 scrollbar-hide">
          {gameTypes.map(type => (
            <button
              key={type}
              onClick={() => { setActiveFilter(type); setExpandedId(null); }}
              className={`whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all border ${
                activeFilter === type 
                ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </header>

      <div className="p-6">
        {matchHistory.length === 0 ? (
          <div className="text-center p-10 bg-slate-100 rounded-3xl border-2 border-dashed border-slate-200 mt-10">
            <div className="text-4xl mb-3 opacity-50">📭</div>
            <h2 className="text-xl font-bold text-slate-700">No History Yet</h2>
            <p className="text-slate-500 text-sm mt-2">Finish a game to see your stats here.</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* ANALYTICS DASHBOARD */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Matches</p>
                <div className="text-4xl font-black text-slate-800">{filteredMatches.length}</div>
              </div>

              <div className="bg-blue-600 p-5 rounded-3xl shadow-md text-white relative overflow-hidden">
                <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">High Score</p>
                {highScore ? (
                  <>
                    <div className="text-4xl font-black leading-none">{highScore.score}</div>
                    <div className="text-sm font-bold text-blue-100 mt-1 truncate">{highScore.emoji} {highScore.name}</div>
                  </>
                ) : (
                  <div className="text-xl font-bold text-blue-200 mt-2">-</div>
                )}
                <div className="absolute -bottom-4 -right-2 text-6xl opacity-20">🏆</div>
              </div>
            </div>

            {leaderboard.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 mb-8">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Win Leaderboard</h3>
                <div className="flex flex-col gap-3">
                  {leaderboard.slice(0, 3).map((player, index) => (
                    <div key={player.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 text-center font-black text-slate-400">{index === 0 ? '👑' : `#${index + 1}`}</div>
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-xl shadow-sm border border-slate-100">{player.emoji}</div>
                        <span className="font-bold text-slate-700">{player.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-lg text-slate-800">{player.count}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Wins</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MATCH VAULT */}
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">Match Logs</h3>
            <div className="flex flex-col gap-3">
              {filteredMatches.length === 0 ? (
                <div className="text-center p-6 text-slate-400 font-medium">No matches found for this filter.</div>
              ) : (
                filteredMatches.map(match => {
                  const isExpanded = expandedId === match.matchId;
                  const winner = match.winnerId ? match.playerSnapshots.find(p => p.id === match.winnerId) : null;
                  const sortedPlayers = [...match.playerSnapshots].sort((a, b) => (match.finalScores[b.id] || 0) - (match.finalScores[a.id] || 0));

                  return (
                    <div key={match.matchId} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300">
                      
                      {/* COLLAPSED HEADER */}
                      <div 
                        onClick={() => toggleAccordion(match.matchId)}
                        className="p-5 flex items-center justify-between cursor-pointer active:bg-slate-50 transition-colors"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-400 mb-1">{match.date}</div>
                          <div className="font-black text-slate-800 text-lg leading-tight truncate max-w-[140px]">{match.gameName}</div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          {winner ? (
                            <div className="text-right">
                              <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-0.5">Winner</div>
                              <div className="font-black text-slate-800 flex items-center gap-1.5 justify-end">
                                <span>{winner.emoji}</span> 
                                <span>{match.finalScores[winner.id]}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-400 text-sm font-bold">Unfinished</div>
                          )}
                          <div className={`text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</div>
                        </div>
                      </div>

                      {/* EXPANDED DETAILS */}
                      {isExpanded && (
                        <div className="bg-slate-50 border-t border-slate-100 p-4 animate-in slide-in-from-top-2">
                          
                          {/* Inner Tabs: Standings | Grid | Graph */}
                          <div className="flex bg-slate-200/50 p-1 rounded-xl mb-4">
                            <button onClick={() => setExpandedView('STANDINGS')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${expandedView === 'STANDINGS' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>🏆 Standings</button>
                            <button onClick={() => setExpandedView('GRID')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${expandedView === 'GRID' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>🧮 Grid</button>
                            <button onClick={() => setExpandedView('GRAPH')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${expandedView === 'GRAPH' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>📈 Graph</button>
                          </div>

                          {/* Content: Standings */}
                          {expandedView === 'STANDINGS' && (
                            <div className="flex flex-col gap-2 mb-6">
                              {sortedPlayers.map((player, idx) => (
                                <div key={player.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-400 w-4">{idx + 1}.</span>
                                    <span className="text-xl">{player.emoji}</span>
                                    <span className="font-bold text-slate-700">{player.name}</span>
                                  </div>
                                  <span className="font-black text-slate-800">{match.finalScores[player.id]} pts</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Content: Grid */}
                          {expandedView === 'GRID' && (
                            <div className="overflow-x-auto bg-white rounded-xl border border-slate-100 shadow-sm mb-6">
                              <table className="w-full text-center border-collapse text-sm">
                                <thead className="bg-slate-100 border-b">
                                  <tr>
                                    <th className="p-2 text-slate-500 font-normal text-xs w-10">Rnd</th>
                                    {match.playerSnapshots.map(p => (
                                      <th key={p.id} className="p-2 font-semibold min-w-[60px]">
                                        <div className="text-lg">{p.emoji}</div>
                                        <div className="text-[10px] truncate uppercase">{p.name}</div>
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {match.savedRounds.map(r => (
                                    <tr key={r.roundId} className="border-b">
                                      <td className="p-2 border-r bg-slate-50 text-slate-500 font-bold text-xs">{r.roundId}</td>
                                      {match.playerSnapshots.map(p => (
                                        <td key={p.id} className="p-2 font-medium">{r.scores[p.id] !== undefined ? r.scores[p.id] : '-'}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Content: Graph */}
                          {expandedView === 'GRAPH' && (
                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm mb-6">
                              <svg viewBox="0 0 400 200" className="w-full h-auto overflow-visible mb-4">
                                {(() => {
                                  const pointsData = match.playerSnapshots.map((p, i) => {
                                    let total = 0;
                                    return {
                                      color: LINE_COLORS[i % LINE_COLORS.length],
                                      points: [0, ...match.savedRounds.map(r => { total += (r.scores[p.id] || 0); return total; })]
                                    };
                                  });
                                  const allScores = pointsData.flatMap(d => d.points);
                                  const max = Math.max(...allScores, 10), min = Math.min(...allScores, 0), range = max - min || 1;
                                  return (
                                    <>
                                      {min < 0 && <line x1="0" y1={200 - ((0 - min) / range) * 200} x2="400" y2={200 - ((0 - min) / range) * 200} stroke="#cbd5e1" strokeDasharray="4" />}
                                      {pointsData.map((d, i) => (
                                        <polyline key={i} points={d.points.map((s, idx) => `${(idx / match.savedRounds.length) * 400},${200 - ((s - min) / range) * 200}`).join(' ')} fill="none" stroke={d.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                      ))}
                                    </>
                                  );
                                })()}
                              </svg>
                              <div className="flex flex-wrap gap-2 justify-center">
                                {match.playerSnapshots.map((p, i) => (
                                  <div key={p.id} className="flex items-center gap-1.5 text-[10px] font-bold">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}></div>
                                    <span>{p.emoji} {p.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ACTION BUTTONS */}
                          <div className="flex gap-2">
                            <button 
                              onClick={() => resumeMatch(match)}
                              className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md shadow-blue-100 active:scale-95 transition-all flex justify-center items-center gap-2"
                            >
                              ▶️ Resume Game
                            </button>
                            <button 
                              onClick={() => deleteMatch(match.matchId)}
                              className="w-14 bg-white border border-red-100 text-red-500 rounded-xl flex items-center justify-center text-xl active:bg-red-50 transition-colors shadow-sm"
                            >
                              🗑️
                            </button>
                          </div>

                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}