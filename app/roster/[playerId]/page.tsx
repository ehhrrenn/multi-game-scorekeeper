// app/roster/[playerId]/page.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useGameState } from '../../../hooks/useGameState';
import BottomNav from '../../components/BottomNav';
import GameCard, { GameRecord } from '../../components/GameCard';

// --- Types ---
type Player = { id: string; name: string; emoji: string; photoURL?: string; isGuest?: boolean; isCloudUser?: boolean };
type GameProfile = { name: string; winCondition: 'HIGH' | 'LOW'; scoreDirection: 'UP' | 'DOWN' };

const EMOJIS = ['🦊', '⚡️', '🦖', '🤠', '👾', '🍕', '🚀', '🐙', '🦄', '🥑', '🔥', '💎', '👻', '👑', '😎', '🤖', '👽', '🐶', '🐱', '🐼'];

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const playerId = decodeURIComponent(params.playerId as string);

  // 1. Data State (Cloud + Local)
  const [cloudPlayer, setCloudPlayer] = useState<Player | null>(null);
  const [cloudHistory, setCloudHistory] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [localPlayers, setLocalPlayers] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [localHistory, setLocalHistory] = useGameState<GameRecord[]>('scorekeeper_history', []);
  const [gameProfiles] = useGameState<GameProfile[]>('scorekeeper_game_profiles', [{ name: 'Custom Game', winCondition: 'HIGH', scoreDirection: 'UP' }]);

  // 2. UI State
  const [filterGame, setFilterGame] = useState<string>('ALL');
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  
  // Edit & Delete State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 3. Fetch Cloud Data
  useEffect(() => {
    async function fetchCloudProfile() {
      try {
        const userRef = doc(db, 'Users', playerId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) setCloudPlayer(userSnap.data() as Player);

        const gamesRef = collection(db, 'Games');
        const q = query(gamesRef, where('activePlayerIds', 'array-contains', playerId));
        const gamesSnap = await getDocs(q);
        setCloudHistory(gamesSnap.docs.map(doc => doc.data() as GameRecord));
      } catch (error) {
        console.error("Error fetching profile from Firebase:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchCloudProfile();
  }, [playerId]);

  // 4. Merge Data Models
  const player = useMemo(() => {
    if (cloudPlayer) return { ...cloudPlayer, isCloudUser: true };
    const local = localPlayers.find(p => p.id === playerId);
    if (local) return { ...local, isCloudUser: false };
    return null;
  }, [cloudPlayer, localPlayers, playerId]);

  useEffect(() => {
    if (player && !isEditing) {
      setEditName(player.name);
      setEditEmoji(player.emoji || '👤');
    }
  }, [player, isEditing]);

  const allHistory = useMemo(() => {
    const localMatches = localHistory.filter(h => h.activePlayerIds.includes(playerId));
    const combined = [...localMatches, ...cloudHistory];
    return Array.from(new Map(combined.map(h => [h.gameId, h])).values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [localHistory, cloudHistory, playerId]);

  // 5. Filtering & Analytics Engine
  const uniqueGames = useMemo(() => Array.from(new Set(allHistory.map(g => g.gameName))), [allHistory]);
  
  // --- UNIVERSAL FILTER ---
  // Drives the stats, the graph, and the feed
  const filteredGames = useMemo(() => {
    if (filterGame === 'ALL') return allHistory;
    return allHistory.filter(g => g.gameName === filterGame);
  }, [allHistory, filterGame]);

  const stats = useMemo(() => {
    let wins = 0;
    let lastPlaces = 0;
    const scoresForGraph: number[] = [];

    filteredGames.forEach(game => {
      const profile = gameProfiles.find(p => p.name === game.gameName) || gameProfiles[0];
      const winCondition = profile.winCondition;
      const playerScore = game.finalScores[playerId];
      
      if (playerScore !== undefined) scoresForGraph.push(playerScore);

      let winningScore = winCondition === 'HIGH' ? -Infinity : Infinity;
      let losingScore = winCondition === 'HIGH' ? Infinity : -Infinity;
      
      game.activePlayerIds.forEach(pid => {
        const score = game.finalScores[pid];
        if (score !== undefined) {
          if (winCondition === 'HIGH') {
            if (score > winningScore) winningScore = score;
            if (score < losingScore) losingScore = score;
          } else {
            if (score < winningScore) winningScore = score;
            if (score > losingScore) losingScore = score;
          }
        }
      });

      if (playerScore === winningScore) wins += 1;
      if (playerScore === losingScore && game.activePlayerIds.length > 1) lastPlaces += 1;
    });

    return {
      gamesPlayed: filteredGames.length,
      wins,
      lastPlaces,
      graphData: scoresForGraph.reverse() // Oldest to newest for the graph
    };
  }, [filteredGames, gameProfiles, playerId]);

  // Graph Layout variables
  const width = 400; 
  const height = 120;
  const max = Math.max(...stats.graphData, 10); 
  const min = Math.min(...stats.graphData, 0); 
  const range = max - min || 1;

  // Handlers
  const handleEditClick = () => setIsEditing(true);

  const handleSave = () => {
    const trimmed = editName.trim() || 'Unknown';
    setLocalPlayers(localPlayers.map(p => p.id === playerId ? { ...p, name: trimmed, emoji: editEmoji } : p));
    // Note: To sync edit to cloud, add a setDoc to Firebase 'Users' collection here later
    setIsEditing(false);
  };

  const handleDelete = () => {
    setLocalPlayers(localPlayers.filter(p => p.id !== playerId));
    // Note: To sync delete to cloud, add a deleteDoc here later
    router.push('/roster');
  };

  const handleDeleteGame = (gameId: string) => {
    setLocalHistory(prev => prev.filter(game => game.gameId !== gameId));
    setCloudHistory(prev => prev.filter(game => game.gameId !== gameId));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!player) return null;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-4xl text-center mb-4">🗑️</div>
            <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-white text-center">Delete Player?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 leading-relaxed font-medium">
              This will permanently remove <span className="font-bold text-slate-700 dark:text-slate-200">{player.name}</span> from the roster, but their history will remain safe in the vault.
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

      {/* Sticky Header */}
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
        
        {/* --- MOVED: Top Context Filter --- */}
        {allHistory.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
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

        {/* Hero Dossier Card */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden mb-8">
          {player.isCloudUser && (
            <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl z-10 shadow-sm">
              CLOUD SYNCED
            </div>
          )}
          
          <div className="absolute -right-6 -bottom-6 text-9xl opacity-[0.03] dark:opacity-5 select-none pointer-events-none">
            {isEditing ? editEmoji : player.emoji}
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
              player.photoURL ? (
                <img src={player.photoURL} alt={player.name} className="w-20 h-20 rounded-full border-2 border-white dark:border-slate-800 shadow-sm object-cover" />
              ) : (
                <div className="w-20 h-20 shrink-0 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-full flex items-center justify-center text-4xl shadow-sm dark:shadow-none">
                  {player.emoji}
                </div>
              )
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
                <h1 className="text-3xl font-black text-slate-800 dark:text-white truncate">{player.name}</h1>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
             <div className="text-center">
                <div className="text-2xl mb-1">🎲</div>
                <div className="font-black text-xl text-slate-800 dark:text-white">{stats.gamesPlayed}</div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Games</div>
             </div>
             <div className="text-center border-l border-slate-100 dark:border-slate-800">
                <div className="text-2xl mb-1">🏆</div>
                <div className="font-black text-xl text-slate-800 dark:text-white">{stats.wins}</div>
                <div className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Wins</div>
             </div>
             <div className="text-center border-l border-slate-100 dark:border-slate-800">
                <div className="text-2xl mb-1">🤡</div>
                <div className="font-black text-xl text-slate-800 dark:text-white">{stats.lastPlaces}</div>
                <div className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Last Place</div>
             </div>
          </div>
        </div>

        {/* Dynamic SVG Score Graph */}
        {stats.graphData.length > 1 && (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm mb-8">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Score Trend</h3>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
              <polyline 
                points={stats.graphData.map((val, i) => { 
                  const x = (i / Math.max(stats.graphData.length - 1, 1)) * width; 
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

        {/* Match Feed */}
        <div className="flex justify-between items-end mb-3 ml-1">
           <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
             Game History
           </h2>
        </div>
        
        <div className="grid gap-3 pb-8">
          {filteredGames.length === 0 ? (
            <div className="text-center p-6 text-slate-400 dark:text-slate-500 font-medium border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              No games match this filter.
            </div>
          ) : (
            filteredGames.map((game, index) => (
              // --- FIX: The key prop is now explicitly unique by combining ID and index ---
              <GameCard 
                key={`${game.gameId}-${index}`}
                game={game} 
                isExpanded={expandedGameId === game.gameId}
                onToggle={() => setExpandedGameId(prev => prev === game.gameId ? null : game.gameId)}
                onDelete={handleDeleteGame}
              />
            ))
          )}
        </div>
      </div>

      {/* Emoji Picker Modal */}
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
      
      <BottomNav />
    </main>
  );
}