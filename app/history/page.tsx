// app/history/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';
import Link from 'next/link';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[]; 
  savedRounds: Round[]; 
};

// Graph Colors
const LINE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function HistoryPage() {
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [players] = useGameState<Player[]>('scorekeeper_players', []);
  const [, setRounds] = useGameState<Round[]>('scorekeeper_rounds', []); 
  
  // Track which card has which view open: { matchId: string, view: 'MATRIX' | 'GRAPH' | null }
  const [expandedView, setExpandedView] = useState<{ matchId: string, view: 'MATRIX' | 'GRAPH' } | null>(null);

  const router = useRouter();

  // --- Actions ---
  const resumeMatch = (matchId: string) => {
    const matchToResume = matchHistory.find(m => m.matchId === matchId);
    if (!matchToResume) return;
    setRounds(matchToResume.savedRounds);
    setMatchHistory(matchHistory.filter(m => m.matchId !== matchId));
    router.push('/custom');
  };

  const deleteMatch = (matchId: string) => {
    if (window.confirm("Are you sure you want to delete this game record?")) {
      setMatchHistory(matchHistory.filter(m => m.matchId !== matchId));
    }
  };

  const toggleView = (matchId: string, view: 'MATRIX' | 'GRAPH') => {
    if (expandedView?.matchId === matchId && expandedView.view === view) {
      setExpandedView(null); // Close if already open
    } else {
      setExpandedView({ matchId, view }); // Open new view
    }
  };

  // --- Sub-Components ---
  
  // 1. The Read-Only Matrix Grid
  const renderMatrix = (match: MatchRecord) => {
    const matchPlayers = players.filter(p => match.activePlayerIds.includes(p.id));
    return (
      <div className="mt-4 border-t border-slate-100 pt-4 animate-in slide-in-from-top-2 fade-in">
        <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">Score Grid</h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-center text-sm border-collapse">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-2 w-12 text-slate-400 font-normal">Rnd</th>
                {matchPlayers.map(p => (
                  <th key={p.id} className="p-2 font-semibold min-w-[60px] border-l">
                    <div>{p.emoji}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {match.savedRounds.map(round => (
                <tr key={round.roundId} className="border-b bg-white">
                  <td className="p-2 text-slate-400">{round.roundId}</td>
                  {matchPlayers.map(p => (
                    <td key={p.id} className="p-2 border-l">{round.scores[p.id] || '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 2. The Custom SVG Line Graph
  const renderGraph = (match: MatchRecord) => {
    const matchPlayers = players.filter(p => match.activePlayerIds.includes(p.id));
    
    // Calculate cumulative scores per round for each player
    const chartData = matchPlayers.map((p, index) => {
      let runningTotal = 0;
      const points = match.savedRounds.map(r => {
        runningTotal += (r.scores[p.id] || 0);
        return runningTotal;
      });
      return { 
        id: p.id, 
        emoji: p.emoji, 
        color: LINE_COLORS[index % LINE_COLORS.length],
        points: [0, ...points] // Start at 0 for Round 0
      };
    });

    // Find Max and Min to scale the SVG properly
    const allScores = chartData.flatMap(d => d.points);
    const maxScore = Math.max(...allScores, 10);
    const minScore = Math.min(...allScores, 0);
    const range = maxScore - minScore || 1;
    const totalRounds = match.savedRounds.length;

    // SVG Viewbox dimensions
    const width = 400;
    const height = 200;

    return (
      <div className="mt-4 border-t border-slate-100 pt-4 animate-in slide-in-from-top-2 fade-in">
         <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase tracking-wide">Performance Timeline</h4>
         
         {/* Graph Legend */}
         <div className="flex flex-wrap gap-3 mb-4 text-xs font-semibold">
           {chartData.map(d => (
             <div key={d.id} className="flex items-center gap-1">
               <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
               <span>{d.emoji}</span>
             </div>
           ))}
         </div>

         {/* The SVG Chart */}
         <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
           <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
             {/* Zero Line */}
             {minScore < 0 && (
               <line 
                 x1="0" y1={height - ((0 - minScore) / range) * height} 
                 x2={width} y2={height - ((0 - minScore) / range) * height} 
                 stroke="#cbd5e1" strokeDasharray="4" strokeWidth="1" 
               />
             )}
             
             {/* Player Lines */}
             {chartData.map(d => {
               const polylinePoints = d.points.map((score, roundIndex) => {
                 const x = (roundIndex / totalRounds) * width;
                 const y = height - ((score - minScore) / range) * height;
                 return `${x},${y}`;
               }).join(' ');

               return (
                 <polyline 
                   key={d.id}
                   points={polylinePoints}
                   fill="none"
                   stroke={d.color}
                   strokeWidth="3"
                   strokeLinecap="round"
                   strokeLinejoin="round"
                   className="drop-shadow-sm transition-all duration-500"
                 />
               );
             })}
           </svg>
           <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-bold px-1">
             <span>Start</span>
             <span>Round {totalRounds}</span>
           </div>
         </div>
      </div>
    );
  };

  // --- Main Render ---
  return (
    <main className="min-h-screen p-6 pb-32">
      <header className="mb-8 mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800">History</h1>
          <p className="text-slate-500 mt-1">Your past games and scores.</p>
        </div>
      </header>

      {matchHistory.length === 0 ? (
        <div className="bg-slate-100 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center mt-10">
          <div className="text-5xl mb-4 opacity-50">📭</div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">No games yet</h3>
          <Link href="/" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-md inline-block">Start a Game</Link>
        </div>
      ) : (
        <div className="grid gap-5">
          {matchHistory.map(match => {
            const winner = players.find(p => p.id === match.winnerId);
            const winnerScore = match.winnerId ? match.finalScores[match.winnerId] : 0;
            
            const sortedScores = Object.entries(match.finalScores)
              .sort(([, scoreA], [, scoreB]) => scoreB - scoreA);

            const isMatrixOpen = expandedView?.matchId === match.matchId && expandedView.view === 'MATRIX';
            const isGraphOpen = expandedView?.matchId === match.matchId && expandedView.view === 'GRAPH';
            
            return (
              <div key={match.matchId} className="bg-white p-5 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-slate-100">
                
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="inline-block px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-lg mb-2">
                      {match.date}
                    </span>
                    <h2 className="text-2xl font-black text-slate-800 leading-none">{match.gameName}</h2>
                  </div>
                  <button onClick={() => deleteMatch(match.matchId)} className="text-slate-300 hover:text-red-500 p-2 -mr-2 -mt-2 transition-colors text-xl font-bold">✕</button>
                </div>
                
                {/* NEW: Winner Banner with Score */}
                <div className="flex items-center gap-3 bg-gradient-to-r from-yellow-50 to-orange-50 p-3 rounded-xl border border-yellow-100 mb-4">
                  <div className="bg-white shadow-sm w-12 h-12 rounded-full flex items-center justify-center text-2xl">🏆</div>
                  <div className="flex-grow">
                    <p className="text-xs text-yellow-800 font-bold uppercase tracking-wide opacity-80 mb-0.5">Winner</p>
                    <p className="font-bold text-yellow-900 leading-none text-lg">
                      {winner ? `${winner.emoji} ${winner.name}` : 'Unknown'}
                    </p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-yellow-100 text-center">
                    <p className="text-[10px] text-yellow-600 font-bold uppercase mb-1">Score</p>
                    <p className="text-xl font-black text-yellow-700 leading-none">{winnerScore}</p>
                  </div>
                </div>
                
                {/* UPGRADED: Mini Leaderboard with Names */}
                <div className="flex gap-3 overflow-x-auto pb-2 mb-2 scrollbar-hide">
                  {sortedScores.map(([playerId, score], index) => {
                    const player = players.find(p => p.id === playerId);
                    return (
                      <div key={playerId} className="flex-shrink-0 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 flex flex-col items-center min-w-[70px]">
                        <span className="text-xs font-bold text-slate-400 mb-1">#{index + 1}</span>
                        <div className="flex items-center gap-1 mb-1">
                          <span>{player?.emoji}</span> 
                          <span className="text-sm font-semibold truncate max-w-[60px]">{player?.name}</span>
                        </div>
                        <span className="font-black text-slate-800">{score}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Expanded Views */}
                {isMatrixOpen && renderMatrix(match)}
                {isGraphOpen && renderGraph(match)}

                {/* NEW: Action Buttons */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                  <button 
                    onClick={() => toggleView(match.matchId, 'MATRIX')}
                    className={`text-sm font-bold px-4 py-2 rounded-lg transition-colors flex-grow sm:flex-grow-0 text-center ${isMatrixOpen ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}
                  >
                    🧮 Grid
                  </button>
                  <button 
                    onClick={() => toggleView(match.matchId, 'GRAPH')}
                    className={`text-sm font-bold px-4 py-2 rounded-lg transition-colors flex-grow sm:flex-grow-0 text-center ${isGraphOpen ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}
                  >
                    📈 Graph
                  </button>
                  <button 
                    onClick={() => resumeMatch(match.matchId)}
                    className="text-sm text-blue-600 font-bold bg-blue-50 px-4 py-2 rounded-lg active:bg-blue-100 transition-colors flex-grow sm:flex-grow-0 text-center"
                  >
                    ↺ Resume
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}