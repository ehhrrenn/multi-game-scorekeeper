// src/app/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // NEW
import { useGameState } from '../../hooks/useGameState'; // Path adjusted for new folder

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type ActiveCell = { roundId: number; playerId: string } | null;

// NEW: The shape of our saved history
type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  winnerId: string | null;
  finalScores: Record<string, number>;
  activePlayerIds: string[]; 
  savedRounds: Round[]; 
};

const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙'];
const getRandomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

export default function CustomTracker() {
  // --- State ---
  const [players, setPlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [rounds, setRounds] = useGameState<Round[]>('scorekeeper_rounds', [{ roundId: 1, scores: {} }]);
  const [newPlayerName, setNewPlayerName] = useState('');
  
  // Numpad State
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [inputValue, setInputValue] = useState('0');

  // --- New State ---
  const [matchHistory, setMatchHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameName, setGameName] = useState('Custom Game');
  const router = useRouter(); // Allows us to change pages via code

  // ... (Keep your existing addPlayer, addRound, calculateTotal, etc. here) ...

  // NEW: The Save Function
  const finishGame = () => {
    if (players.length === 0 || rounds.length === 0) return;

    // 1. Calculate final scores for everyone
    const finalScores: Record<string, number> = {};
    players.forEach(p => {
      finalScores[p.id] = calculateTotal(p.id);
    });

    // 2. Determine the winner (Highest Score wins for now)
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
      activePlayerIds: players.map(p => p.id), // Save exactly who was playing
      savedRounds: [...rounds], // Save the exact grid
    };

    // 4. Save to Vault, Reset the Board, and Navigate
    setMatchHistory([newMatch, ...matchHistory]); 
    setRounds([{ roundId: 1, scores: {} }]); 
    setGameName('Custom Game'); // Reset name for next time
    
    // Instantly jump to the History tab!
    router.push('/history'); 
  };

  // --- Logic Functions ---
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

  // --- Numpad Logic ---
  const handleCellTap = (roundId: number, playerId: string) => {
    setActiveCell({ roundId, playerId });
    // Find existing score to populate the keypad, or default to "0"
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
    setActiveCell(null); // Close keypad
  };

    return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      
      {/* HEADER: Game Name & Add Player */}
      <div className="p-4 bg-white shadow-sm border-b">
        {/* Game Name Input */}
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

      {/* ... (Keep your existing MATRIX GRID code exactly the same here) ... */}

      {/* FOOTER ACTION BUTTONS */}
      <div className="p-4 text-center flex flex-col gap-3">
         <button onClick={addRound} className="bg-white border-2 border-slate-200 text-slate-800 px-6 py-3 rounded-xl font-bold shadow-sm w-full max-w-sm active:bg-slate-50 mx-auto">
           + Add Round
         </button>
         
         {/* THE NEW FINISH BUTTON */}
         <button onClick={finishGame} className="bg-slate-900 text-white px-6 py-4 rounded-xl font-bold shadow-md w-full max-w-sm active:bg-slate-800 mx-auto mt-4 flex items-center justify-center gap-2">
           <span>🏆</span> Finish & Save Game
         </button>
      </div>

      {/* CUSTOM NUMPAD (Bottom Sheet) */}
      {activeCell && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-2xl border-t-2 border-slate-200 rounded-t-2xl p-4 animate-slide-up">
          <div className="text-center text-4xl font-bold mb-4 bg-slate-100 py-3 rounded-xl">
            {inputValue}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handleNumpadInput(num.toString())} className="bg-slate-50 py-4 rounded-xl text-2xl font-semibold active:bg-slate-200">
                {num}
              </button>
            ))}
            <button onClick={toggleNegative} className="bg-slate-200 py-4 rounded-xl text-xl font-bold active:bg-slate-300">
              +/-
            </button>
            <button onClick={() => handleNumpadInput('0')} className="bg-slate-50 py-4 rounded-xl text-2xl font-semibold active:bg-slate-200">
              0
            </button>
            <button onClick={() => setInputValue(prev => prev.slice(0, -1) || '0')} className="bg-red-100 text-red-600 py-4 rounded-xl text-xl font-bold active:bg-red-200">
              ⌫
            </button>
          </div>
          <button onClick={submitScore} className="w-full mt-2 bg-blue-600 text-white py-4 rounded-xl text-xl font-bold shadow-lg active:bg-blue-700">
            Enter Score
          </button>
        </div>
      )}
    </main>
  );
}