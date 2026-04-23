// app/roster/[playerId]/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameState } from '../../../hooks/useGameState';

// --- Types ---
type Player = { id: string; name: string; emoji: string };
type Round = { roundId: number; scores: Record<string, number> };
type PlayerSnapshot = { id: string; name: string; emoji: string };
type GameProfile = { name: string; winCondition: 'HIGH' | 'LOW'; scoreDirection: 'UP' | 'DOWN' };
type GameSettings = { target: number };

type MatchRecord = {
  matchId: string;
  date: string;
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

// --- Helpers ---
const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];

function rankInMatch(match: MatchRecord, playerId: string, isLowWin: boolean): number | null {
  const sorted = Object.entries(match.finalScores)
    .sort(([, a], [, b]) => isLowWin ? a - b : b - a)
    .map(([id]) => id);
  const index = sorted.indexOf(playerId);
  return index === -1 ? null : index + 1;
}

export default function PlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const router = useRouter();

  // --- Global State ---
  const [globalRoster, setGlobalRoster] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [activePlayers, setActivePlayers] = useGameState<Player[]>('scorekeeper_players', []);
  const [history, setHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const [gameProfiles] = useGameState<GameProfile[]>('scorekeeper_game_profiles', []);

  // --- Local State ---
  const rosterPlayer = globalRoster.find(p => p.id === playerId);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(rosterPlayer?.name || '');
  const [editEmoji, setEditEmoji] = useState(rosterPlayer?.emoji || '👤');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // --- Analytics Engine ---
  const games = useMemo(() => {
    return history
      .filter(match => match.activePlayerIds.includes(playerId as string))
      .map(match => {
        const profile = gameProfiles.find(p => p.name === match.gameName) || { winCondition: 'HIGH' };
        return {
          matchId: match.matchId,
          date: match.date,
          gameName: match.gameName,
          score: match.finalScores[playerId as string] || 0,
          rank: rankInMatch(match, playerId as string, profile.winCondition === 'LOW')
        };
      });
  }, [history, playerId, gameProfiles]);

  const graphData = useMemo(() => [...games].reverse().map(g => g.score), [games]);

  // Graph SVG Math
  const width = 400;
  const height = 120;
  const max = Math.max(...graphData, 10);
  const min = Math.min(...graphData, 0);
  const range = max - min || 1;

  // --- Actions ---
  const handleSave = () => {
    const trimmed = editName.trim() || 'Unknown';
    setGlobalRoster(globalRoster.map(p => p.id === playerId ? { ...p, name: trimmed, emoji: editEmoji } : p));
    setActivePlayers(activePlayers.map(p => p.id === playerId ? { ...p, name: trimmed, emoji: editEmoji } : p));
    setHistory(history.map(match => ({
      ...match,
      playerSnapshots: match.playerSnapshots.map(p => p.id === playerId ? { ...p, name: trimmed, emoji: editEmoji } : p)
    })));
    setIsEditing(false);
  };

  const handleDelete = () => {
    setGlobalRoster(globalRoster.filter(p => p.id !== playerId));
    setActivePlayers(activePlayers.filter(p => p.id !== playerId));
    // Safe Delete: We keep the history intact
    router.push('/roster');
  };

  if (!rosterPlayer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500">
        Player not found or deleted.
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      
      {/* UNIFIED HEADER */}
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
              <button onClick={() => { setIsEditing(true); setShowDeleteConfirm(false); }} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-lg active:scale-95 transition">✏️</button>
              <button onClick={() => setShowDeleteConfirm(true)} className="w-10 h-10 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full text-lg active:scale-95 transition">🗑️</button>
            </>
          )}
        </div>
      </div>

      <div className="pt-[88px] px-4 max-w-screen-md mx-auto animate-in fade-in slide-in-from-bottom-2">
        
        {/* DELETE CONFIRMATION */}
        {showDeleteConfirm && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-2xl p-5 mb-6 animate-in slide-in-from-top-2">
            <h3 className="text-red-800 dark:text-red-400 font-bold mb-2 text-center">Delete {rosterPlayer.name}?</h3>
            <p className="text-sm text-red-600 dark:text-red-300 mb-4 text-center">This removes them from the roster, but keeps their past game stats intact in the Vault.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl shadow-sm">Yes, Delete</button>
            </div>
          </div>
        )}

        {/* HERO PROFILE SECTION */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center relative overflow-hidden mb-8">
          <div className="absolute -right-10 -top-10 text-9xl opacity-[0.03] dark:opacity-5 select-none pointer-events-none">
            {isEditing ? editEmoji : rosterPlayer.emoji}
          </div>
          
          <div className="relative z-10 flex flex-col items-center">
            {isEditing ? (
              <button 
                onClick={() => setShowEmojiPicker(true)}
                className="w-24 h-24 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 border-dashed rounded-full flex items-center justify-center text-5xl mb-4 active:scale-95 transition shadow-inner relative"
              >
                {editEmoji}
                <div className="absolute -bottom-2 bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Tap</div>
              </button>
            ) : (
              <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-full flex items-center justify-center text-5xl mb-4 shadow-sm dark:shadow-none">
                {rosterPlayer.emoji}
              </div>
            )}

            {isEditing ? (
              <input 
                type="text" 
                value={editName} 
                onChange={e => setEditName(e.target.value)} 
                className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 font-black text-2xl text-center text-slate-800 dark:text-white outline-none focus:border-blue-500 w-full max-w-[250px]"
                autoFocus
              />
            ) : (
              <h1 className="text-3xl font-black text-slate-800 dark:text-white mb-2">{rosterPlayer.name}</h1>
            )}
            
            <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">
              Played {games.length} Games
            </p>
          </div>
        </div>

        {/* PERFORMANCE GRAPH */}
        {graphData.length > 1 && (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm mb-8">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Score Trend</h3>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
              <polyline
                points={graphData.map((val, i) => {
                  const x = (i / Math.max(graphData.length - 1, 1)) * width;
                  const y = height - ((val - min) / range) * height;
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-sm"
              />
            </svg>
          </div>
        )}

        {/* MATCH HISTORY LIST */}
        <h2 className="mt-8 mb-3 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
          Recent Matches
        </h2>

        <div className="grid gap-3 pb-8">
          {games.length === 0 ? (
            <div className="text-center p-6 text-slate-400 dark:text-slate-500 font-medium">No games played yet.</div>
          ) : (
            games.map(g => (
              <div key={g.matchId} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-0.5">{g.date}</div>
                  <div className="text-lg font-black text-slate-800 dark:text-slate-100">{g.gameName}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-slate-800 dark:text-white mb-0.5">{g.score} <span className="text-[10px] text-slate-400">pts</span></div>
                  {g.rank && (
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block ${g.rank === 1 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                      {g.rank === 1 ? '🏆 Winner' : `Rank #${g.rank}`}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- EMOJI PICKER SUB-MODAL --- */}
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