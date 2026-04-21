// app/custom/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '../../hooks/useGameState';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type ActiveCell = { roundId: number; playerId: string } | null;

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[]; 
  savedRounds: Round[]; 
};

// --- Helpers ---
const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙'];
const getRandomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

export default function CustomTracker() {
  // --- State ---
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  
  const [newPlayerName, setNewPlayerName] = useState('');
  const [gameName, setGameName] = useState('Custom Game');
  
  // Numpad State
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('0');

  const router = useRouter();

  // --- Core Game Logic ---
  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    const newPlayer = {
      id: Date.now().toString(),
      name: newPlayerName,
      emoji: getRandomEmoji(),
    };
    setPlayers([...players, newPlayer]);
    setNewPlayerName('');
  };

  const addRound = () => {
    const nextRoundId = rounds.length > 0 ? rounds[rounds.length - 1].roundId + 1 : 1;
    setRounds([...rounds, { roundId: nextRoundId, scores: {} }]);
  };

  const calculateTotal = (playerId: string) => {
    return rounds.reduce((total, round) => total + (round.scores[playerId] || 0), 0);
  };

  const finishGame = () => {
    if (players.length === 0 || rounds.length === 0) return;

    // 1. Calculate final scores for everyone
    const finalScores: Record<string, number> = {};
    players.forEach(p => {
      finalScores[p.id] = calculateTotal(p.id);
    });

    // 2. Determine the winner (Highest Score wins)
    let winnerId: string | null = null;
    let highestScore = -Infinity;
    
    Object.entries(finalScores).forEach(([playerId, score]) => {
      if (score > highestScore) {
        highestScore = score;
        winnerId = playerId;
      }
    });

    // 3. Create the Match Record
    const newMatch: MatchRecord = {
      matchId: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      gameName: gameName,
      winnerId: winnerId,
      finalScores: finalScores,
      activePlayerIds: players.map(p => p.id), 
      savedRounds: [...rounds], 
    };

    // 4. Save to Vault, Reset the Board, and Navigate
    setMatchHistory([newMatch, ...matchHistory]); 
    setRounds([{ roundId: 1, scores: {} }]); 
    setGameName('Custom Game');
    
    router.push('/history'); 
  };

  // --- Numpad Logic ---
  const handleCellTap = (roundId: number, playerId: string) => {
    setActiveCell({ roundId, playerId });
    const existingScore = rounds.find(r => r.roundId === roundId)?.scores[playerId];
    setInputValue(existingScore ? existingScore.toString() : '0');
  };

  const handleNumpadInput = (val: string) => {
    if (inputValue === '0' && val !== '0') setInputValue(val);
    else setInputValue(prev => prev + val);
  };

  const toggleNegative = () => {
    setInputValue(prev => prev.startsWith('-') ? prev.substring(1) : '-' + prev);
  };

  const submitScore = () => {
    if (!activeCell) return;
    
    const numericScore = parseInt(inputValue, 10) || 0;
    
    const updatedRounds = rounds.map(round => {
      if (round.roundId === activeCell.roundId) {
        return {
          ...round,
          scores: { ...round.scores, [activeCell.playerId]: numericScore }
        };
      }
      return round;
    });

    setRounds(updatedRounds);
    setActiveCell(null); 
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      
      {/* HEADER: Game Name & Add Player */}
      <div className="p-4 bg-white shadow-sm border-b">
        <input 
          type="text" 
          value={gameName}
          onChange={(e) => setGameName(e.target.value)}
          className="text-2xl font-black text-slate-800 border-b-2 border-transparent focus:border-blue-500 focus:outline-none w-full mb-4 bg-transparent placeholder-slate-300 transition-colors"
          placeholder="What are we playing?"
        />
        
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Add player..." 
            className="border border-slate-200 p-2 rounded-lg flex-grow shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
          />
          <button onClick={addPlayer} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold shadow-sm active:bg-blue-700">
            + Add
          </button>
        </div>
      </div>

      {/* MATRIX GRID */}
      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead className="bg-slate-100 sticky top-0 border-b z-10">
            <tr>
              <th className="p-3 w-16 text-slate-500 font-normal">Rnd</th>
              {players.map(p => (
                <th key={p.id} className="p-3 font-semibold min-w-[80px]">
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="text-sm truncate">{p.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody>
            {rounds.map(round => (
              <tr key={round.roundId} className="border-b bg-white">
                <td className="p-3 text-slate-400 border-r">{round.roundId}</td>
                {players.map(p => {
                  const score = round.scores[p.id];
                  const isSelected = activeCell?.roundId === round.roundId && activeCell?.playerId === p.id;
                  
                  return (
                    <td 
                      key={p.id} 
                      onClick={() => handleCellTap(round.roundId, p.id)}
                      className={`p-3 text-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 border-2 border-blue-500 rounded' : 'active:bg-slate-50'}`}
                    >
                      {score !== undefined ? score : <span className="text-slate-300">-</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          
          <tfoot className="bg-slate-800 text-white sticky bottom-0 z-10">
            <tr>
              <td className="p-4 font-bold border-r border-slate-700">Tot</td>
              {players.map(p => (
                <td key={p.id} className="p-4 font-bold text-xl">
                  {calculateTotal(p.id)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* FOOTER ACTION BUTTONS */}
      <div className="p-4 text-center flex flex-col gap-3">
         <button onClick={addRound} className="bg-white border-2 border-slate-200 text-slate-800 px-6 py-3 rounded-xl font-bold shadow-sm w-full max-w-sm active:bg-slate-50 mx-auto transition-colors">
           + Add Round
         </button>
         
         <button onClick={finishGame} className="bg-slate-900 text-white px-6 py-4 rounded-xl font-bold shadow-md w-full max-w-sm active:bg-slate-800 mx-auto mt-4 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]">
           <span>🏆</span> Finish & Save Game
         </button>
      </div>

      {/* CUSTOM NUMPAD (Bottom Sheet) */}
      {activeCell && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t-2 border-slate-100 rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom-full z-50">
          <div className="text-center text-5xl font-black mb-5 bg-slate-50 py-4 rounded-2xl border border-slate-100 shadow-inner">
            {inputValue}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handleNumpadInput(num.toString())} className="bg-slate-100 py-5 rounded-2xl text-2xl font-semibold active:bg-slate-200 active:scale-[0.95] transition-all">
                {num}
              </button>
            ))}
            <button onClick={toggleNegative} className="bg-slate-200 py-5 rounded-2xl text-xl font-bold active:bg-slate-300 active:scale-[0.95] transition-all">
              +/-
            </button>
            <button onClick={() => handleNumpadInput('0')} className="bg-slate-100 py-5 rounded-2xl text-2xl font-semibold active:bg-slate-200 active:scale-[0.95] transition-all">
              0
            </button>
            <button onClick={() => setInputValue(prev => prev.slice(0, -1) || '0')} className="bg-red-50 text-red-500 py-5 rounded-2xl text-2xl font-bold active:bg-red-100 active:scale-[0.95] transition-all">
              ⌫
            </button>
          </div>
          <button onClick={submitScore} className="w-full mt-4 bg-blue-600 text-white py-5 rounded-2xl text-xl font-bold shadow-lg shadow-blue-200 active:bg-blue-700 active:scale-[0.98] transition-all">
            Enter Score
          </button>
        </div>
      )}
      
    </main>
  );
}