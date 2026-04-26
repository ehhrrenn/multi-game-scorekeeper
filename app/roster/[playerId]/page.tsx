// app/roster/[playerId]/page.tsx
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameState } from '../../../hooks/useGameState';

type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type PlayerSnapshot = { id: string; name: string; emoji: string };
type GameProfile = { name: string; winCondition: 'HIGH' | 'LOW'; scoreDirection: 'UP' | 'DOWN' };
type GameSettings = { target: number };

type GameRecord = {
  matchId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];

function rankInGame(game: GameRecord, playerId: string, isLowWin: boolean): number | null {
  const sorted = Object.entries(game.finalScores)
    .sort(([, a], [, b]) => isLowWin ? a - b : b - a)
    .map(([id]) => id);
  const index = sorted.indexOf(playerId);
  return index === -1 ? null : index + 1;
}

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const router = useRouter();

  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [activePlayers, setActivePlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [history, setHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  const [gameProfiles] = useGameState<GameProfile[]>('scorekeeper_game_profiles', []);

  const rosterPlayer = globalRoster.find(p => p.id === playerId);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [filterGame, setFilterGame] = useState<string | 'ALL'>('ALL');

  useEffect(() => {
    if (rosterPlayer && !isEditing) {
      setEditName(rosterPlayer.name);
      setEditEmoji(rosterPlayer.emoji);
    }
  }, [rosterPlayer, isEditing]);

  const allGames = useMemo(() => {
    return history
      .filter(game => game.activePlayerIds.includes(playerId as string))
      .map(game => {
        const profile = gameProfiles.find(p => p.name === game.gameName) || { winCondition: 'HIGH' };
        return {
          gameId: game.matchId,
          date: game.date,
          gameName: game.gameName,
          score: game.finalScores[playerId as string] || 0,
          rank: rankInGame(game, playerId as string, profile.winCondition === 'LOW'),
          totalPlayersInGame: Object.keys(game.finalScores).length
        };
      });
  }, [history, playerId, gameProfiles]);

  const uniqueGames = Array.from(new Set(allGames.map(g => g.gameName)));
  
  // --- UNIVERSAL FILTER ROUTING ---
  // This filtered array now drives the log, the stats, and the graph.
  const filteredGames = filterGame === 'ALL' ? allGames : allGames.filter(g => g.gameName === filterGame);

  const graphData = useMemo(() => [...filteredGames].reverse().map(g => g.score), [filteredGames]);
  
  const totalWins = filteredGames.filter(g => g.rank === 1).length;
  const lastPlaces = filteredGames.filter(g => g.rank !== null && g.rank === g.totalPlayersInGame && g.totalPlayersInGame > 1).length;

  const width = 400; const height = 120;
  const max = Math.max(...graphData, 10); const min = Math.min(...graphData, 0); const range = max - min || 1;

  const handleEditClick = () => {
    setEditName(rosterPlayer?.name || '');
    setEditEmoji(rosterPlayer?.emoji || '👤');
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmed = editName.trim() || 'Unknown';
    setGlobalRoster(globalRoster.map(p => p.id === playerId ? { ...p, name: trimmed, emoji: editEmoji } : p));
    setActivePlayers(activePlayers.map(p => p.id === playerId ? { ...p, name: trimmed, emoji: editEmoji } : p));
    setHistory(history.map(game => ({
      ...game,
      playerSnapshots: game.playerSnapshots.map(p => p.id === playerId ? { ...p, name: trimmed, emoji: editEmoji } : p)
    })));
    setIsEditing(false);
  };

  const handleDelete = () => {
    setGlobalRoster(globalRoster.filter(p => p.id !== playerId));
    setActivePlayers(activePlayers.filter(p => p.id !== playerId));
    router.push('/roster');
  };

  if (!rosterPlayer) return null;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-4xl text-center mb-4">🗑️</div>
            <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-white text-center">Delete Player?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 leading-relaxed font-medium">
              This will permanently remove <span className="font-bold text-slate-700 dark:text-slate-200">{rosterPlayer.name}</span> from the roster, but their history will remain safe in the vault.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={handleDelete} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-200 dark:shadow-none active:scale-95 transition">
                Yes, Delete
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="w-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold py-3 mt-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-xl font-black text-slate-800 dark:text-white">Player Profile</h1>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full">Cancel</button>
              <button onClick={handleSave} className="px-4 py-1.5 text-sm font-bold text-white bg-blue-600 rounded-full shadow-sm">Save</button>
            </>
          ) : (
            <>
              <button onClick={handleEditClick} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-lg active:scale-95 transition">✏️</button>
              <button onClick={() => setShowDeleteConfirm(true)} className="w-10 h-10 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full text-lg active:scale-95 transition">🗑️</button>
            </>
          )}
        </div>
      </div>

      <div className="pt-[88px] px-4 max-w-screen-md mx-auto animate-in fade-in slide-in-from-bottom-2">

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden mb-8">
          <div className="absolute -right-6 -bottom-6 text-9xl opacity-[0.03] dark:opacity-5 select-none pointer-events-none">
            {isEditing ? editEmoji : rosterPlayer.emoji}
          </div>
          
          <div className="relative z-10 flex items-center gap-5">
            {isEditing ? (
              <button 
                onClick={() => setShowEmojiPicker(true)}
                className="w-20 h-20 shrink-0 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 border-dashed rounded-full flex items-center justify-center text-4xl active:scale-95 transition shadow-inner relative"
              >
                {editEmoji}
                <div className="absolute -bottom-1 bg-slate-800 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Tap</div>
              </button>
            ) : (
              <div className="w-20 h-20 shrink-0 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-full flex items-center justify-center text-4xl shadow-sm dark:shadow-none">
                {rosterPlayer.emoji}
              </div>
            )}

            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input 
                  type="text" 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 font-black text-2xl text-slate-800 dark:text-white outline-none focus:border-blue-500 w-full"
                  autoFocus
                />
              ) : (
                <h1 className="text-3xl font-black text-slate-800 dark:text-white truncate">{rosterPlayer.name}</h1>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
             <div className="text-center">
                <div className="text-2xl mb-1">🎲</div>
                <div className="font-black text-xl text-slate-800 dark:text-white">{filteredGames.length}</div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Games</div>
             </div>
             <div className="text-center border-l border-slate-100 dark:border-slate-800">
                <div className="text-2xl mb-1">🏆</div>
                <div className="font-black text-xl text-slate-800 dark:text-white">{totalWins}</div>
                <div className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Wins</div>
             </div>
             <div className="text-center border-l border-slate-100 dark:border-slate-800">
                <div className="text-2xl mb-1">🤡</div>
                <div className="font-black text-xl text-slate-800 dark:text-white">{lastPlaces}</div>
                <div className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Last Place</div>
             </div>
          </div>
        </div>

        {graphData.length > 1 && (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm mb-8">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Score Trend</h3>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
              <polyline points={graphData.map((val, i) => { const x = (i / Math.max(graphData.length - 1, 1)) * width; const y = height - ((val - min) / range) * height; return `${x},${y}`; }).join(' ')} fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />
            </svg>
          </div>
        )}

        <div className="flex justify-between items-end mb-3 ml-1">
           <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
             Game History
           </h2>
        </div>
        
        {allGames.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
            <button onClick={() => setFilterGame('ALL')} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all ${filterGame === 'ALL' ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800'}`}>
              All Games
            </button>
            {uniqueGames.map(name => (
              <button key={name} onClick={() => setFilterGame(name)} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all ${filterGame === name ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800'}`}>
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 pb-8">
          {filteredGames.length === 0 ? (
            <div className="text-center p-6 text-slate-400 dark:text-slate-500 font-medium">No games match this filter.</div>
          ) : (
            filteredGames.map(g => {
              const isLastPlace = g.rank !== null && g.rank === g.totalPlayersInGame && g.totalPlayersInGame > 1;
              return (
                <div key={g.gameId} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-0.5">{g.date}</div>
                    <div className="text-lg font-black text-slate-800 dark:text-slate-100">{g.gameName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-800 dark:text-white mb-0.5">{g.score} <span className="text-[10px] text-slate-400">pts</span></div>
                    {g.rank && (
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block ${g.rank === 1 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : isLastPlace ? 'bg-red-50 dark:bg-red-900/20 text-red-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                        {g.rank === 1 ? '🏆 Winner' : isLastPlace ? '🤡 Last Place' : `Rank #${g.rank}`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showEmojiPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-[2rem] p-6 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-800 dark:text-white">Choose Emoji</h3>
              <button onClick={() => setShowEmojiPicker(false)} className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-white active:scale-95 transition-all">✕</button>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {EMOJIS.map(emoji => (
                <button 
                  key={emoji} 
                  onClick={() => { setEditEmoji(emoji); setShowEmojiPicker(false); }}
                  className="text-3xl aspect-square flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl active:scale-90 transition-all shadow-sm dark:shadow-none"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}