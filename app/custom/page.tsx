// src/app/page.tsx
'use client';

import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState';

// --- Types & Random Emojis ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type ActiveCell = { roundId: number; playerId: string } | null;

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
      
      {/* HEADER: Add Player */}
      <div className="p-4 bg-white shadow-sm border-b">
        <h1 className="text-xl font-bold mb-4">Custom Game</h1>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Add player..." 
            className="border p-2 rounded flex-grow"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
          />
          <button onClick={addPlayer} className="bg-blue-600 text-white px-4 py-2 rounded font-semibold">
            + Add
          </button>
        </div>
      </div>

      {/* MATRIX GRID */}
      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse">
          {/* Sticky Roster Header */}
          <thead className="bg-slate-100 sticky top-0 border-b">
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
          
          {/* Rounds */}
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
                      className={`p-3 text-lg cursor-pointer ${isSelected ? 'bg-blue-100 border-2 border-blue-500 rounded' : ''}`}
                    >
                      {score !== undefined ? score : <span className="text-slate-300">-</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          
          {/* Sticky Totals Footer */}
          <tfoot className="bg-slate-800 text-white sticky bottom-0">
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

      {/* Add Round Button */}
      <div className="p-4 text-center">
         <button onClick={addRound} className="bg-slate-200 text-slate-800 px-6 py-3 rounded-full font-bold shadow-sm w-full max-w-sm active:bg-slate-300">
           + Next Round
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