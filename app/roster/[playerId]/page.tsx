// app/roster/[playerId]/page.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { deleteDoc, doc, getDoc, collection, getDocs, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { fetchCloudPlayersWithLegacy, formatFirstName } from '../../../lib/cloudPlayers';
import { db } from '../../../lib/firebase';
import { useGameState } from '../../../hooks/useGameState';
import { useAuth } from '../../../hooks/useAuth';
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
  
  // Auth & Admin Check
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.uid === process.env.NEXT_PUBLIC_ADMIN_UID;

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

  // Admin Merge State
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [allCloudUsers, setAllCloudUsers] = useState<Player[]>([]);
  const [targetMergeId, setTargetMergeId] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);

  // 3. Fetch Cloud Data
  useEffect(() => {
    async function fetchCloudProfile() {
      if (!db) {
        setCloudPlayer(null);
        setCloudHistory([]);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', playerId);
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
      graphData: scoresForGraph.reverse() 
    };
  }, [filteredGames, gameProfiles, playerId]);

  const width = 400; const height = 120;
  const max = Math.max(...stats.graphData, 10); const min = Math.min(...stats.graphData, 0); const range = max - min || 1;

  // Handlers
const handleEditClick = () => setIsEditing(true);

const handleSave = async () => {
  if (!player) return;
  
  if (player.isCloudUser) {
    if (!db) {
      console.warn('Skipped cloud profile update: Firebase is not configured.');
      return;
    }

    // 1. Save directly to Firestore for Cloud Users
    try {
      const userRef = doc(db, 'users', player.id);
      await updateDoc(userRef, {
        name: editName,
        emoji: editEmoji,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating cloud profile:", error);
    }
  } else {
    // 2. Original local save logic for Guest/Local players
    setLocalPlayers(prev => prev.map(p => p.id === player.id ? { ...p, name: editName, emoji: editEmoji } : p));
    setIsEditing(false);
  }
};

const handleDelete = async () => {
    setLocalPlayers(localPlayers.filter(p => p.id !== playerId));

    if (db) {
      try {
        await deleteDoc(doc(db, 'users', playerId));
      } catch (error) {
        console.error('Error deleting player from cloud:', error);
      }
    }

    router.push('/roster');
  };

  const handleDeleteGame = async (gameId: string) => {
    setLocalHistory(prev => prev.filter(game => game.gameId !== gameId));
    setCloudHistory(prev => prev.filter(game => game.gameId !== gameId));

    if (!db) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'Games', gameId));
    } catch (error) {
      console.error('Error deleting game from cloud:', error);
    }
  };

  // --- ADMIN MERGE LOGIC ---
  const handleOpenMergeModal = async () => {
    setShowMergeModal(true);
      if (!db) {
        setAllCloudUsers([]);
        return;
      }

    // Fetch target users
    const users = await fetchCloudPlayersWithLegacy(db);
    setAllCloudUsers(users.filter(p => p.id !== playerId));
  };

  const executeMerge = async () => {
      if (!targetMergeId || !db) return;
    setIsMerging(true);

    try {
      // 1. Setup a Firestore Batch
      const batch = writeBatch(db);

      // 2. Query all cloud games for the old ID
      const gamesRef = collection(db, 'Games');
      const q = query(gamesRef, where('activePlayerIds', 'array-contains', playerId));
      const gamesSnap = await getDocs(q);

      // 3. Queue the game updates in the batch
      gamesSnap.docs.forEach(gameDoc => {
        const gameData = gameDoc.data() as GameRecord;
        
        // Swap ID in active array
        const newActiveIds = gameData.activePlayerIds.map(id => id === playerId ? targetMergeId : id);
        
        // Swap ID key in final scores
        const newScores = { ...gameData.finalScores };
        if (newScores[playerId] !== undefined) {
          newScores[targetMergeId] = newScores[playerId];
          delete newScores[playerId];
        }

        // Swap ID in snapshots (if tracking them)
        const newSnapshots = gameData.playerSnapshots?.map(snap => 
          snap.id === playerId ? { ...snap, id: targetMergeId } : snap
        ) || [];

        batch.update(gameDoc.ref, {
          activePlayerIds: newActiveIds,
          finalScores: newScores,
          playerSnapshots: newSnapshots
        });
      });

      // 4. Delete the ghost profile from Cloud Users (if it exists)
      const oldUserRef = doc(db, 'users', playerId);
      batch.delete(oldUserRef);

      // 5. Commit Cloud Changes
      await batch.commit();

      // 6. Update Local Storage Fallback
      setLocalPlayers(prev => prev.filter(p => p.id !== playerId));
      setLocalHistory(prev => prev.map(game => {
        if (!game.activePlayerIds.includes(playerId)) return game;
        const newActiveIds = game.activePlayerIds.map(id => id === playerId ? targetMergeId : id);
        const newScores = { ...game.finalScores };
        if (newScores[playerId] !== undefined) {
          newScores[targetMergeId] = newScores[playerId];
          delete newScores[playerId];
        }
        return { ...game, activePlayerIds: newActiveIds, finalScores: newScores };
      }));

      // Merge Complete! Go back to Roster
      router.push('/roster');

    } catch (error) {
      console.error("Error executing merge:", error);
      setIsMerging(false);
    }
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
      
      {/* Existing Delete Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-4xl text-center mb-4">🗑️</div>
            <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-white text-center">Delete Player?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 leading-relaxed font-medium">
              This will permanently remove <span className="font-bold text-slate-700 dark:text-slate-200">{player.isCloudUser ? formatFirstName(player.name) : player.name}</span> from the roster, but their history will remain safe in the vault.
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

      {/* --- NEW: Admin Merge Modal --- */}
      {showMergeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => !isMerging && setShowMergeModal(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black mb-2 text-slate-800 dark:text-white">Admin Merge</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Move all of <b>{player.isCloudUser ? formatFirstName(player.name) : player.name}'s</b> history into a synced Cloud Account. This cannot be undone.
            </p>
            
            <select 
              value={targetMergeId} 
              onChange={e => setTargetMergeId(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 mb-6 font-bold text-slate-800 dark:text-white outline-none"
            >
              <option value="" disabled>Select target account...</option>
              {allCloudUsers.map(u => (
                <option key={u.id} value={u.id}>{u.isCloudUser ? formatFirstName(u.name) : u.name} {u.isGuest ? '(Guest)' : '(Google)'}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowMergeModal(false)} disabled={isMerging} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold py-3 rounded-xl">
                Cancel
              </button>
              <button 
                onClick={executeMerge} 
                disabled={!targetMergeId || isMerging} 
                className="flex-1 bg-purple-600 text-white font-black py-3 rounded-xl disabled:opacity-50 flex justify-center items-center"
              >
                {isMerging ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : 'Confirm Merge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Header */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800 z-40 flex items-center justify-between px-4 max-w-screen-md mx-auto">
        <h1 className="text-xl font-black text-slate-800 dark:text-white">Player Profile</h1>
        <div className="flex gap-2">
          {/* Admin Context Menu */}
          {isAdmin && !player.isCloudUser && (
            <button onClick={handleOpenMergeModal} className="w-10 h-10 flex items-center justify-center bg-purple-100 dark:bg-purple-900/20 text-purple-600 rounded-full text-sm font-bold active:scale-95 transition">
              🔗
            </button>
          )}

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
        
        {/* Top Context Filter */}
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
                <h1 className="text-3xl font-black text-slate-800 dark:text-white truncate">{player.isCloudUser ? formatFirstName(player.name) : player.name}</h1>
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
                  
                  {/* INJECTED: Revert to Photo Button */}
                  {player.isCloudUser && player.photoURL && (
                    <button 
                      onClick={() => {
                        setEditEmoji(''); // Clear the emoji
                        setShowEmojiPicker(false); // Close the modal
                      }}
                      className="w-full mb-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold rounded-xl flex items-center justify-center gap-2 border border-blue-200 dark:border-blue-800 transition-all active:scale-95"
                    >
                      <span>🖼️</span> Use Google Photo
                    </button>
                  )}

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