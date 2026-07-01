// app/roster/page.tsx
'use client';

import { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { fetchCloudPlayersWithLegacy, formatFirstName, mergePlayersById } from '../../lib/cloudPlayers';
import { db } from '../../lib/firebase';
import { useGameProfilesSync } from '../../hooks/useGameProfilesSync';
import { getWinnerIdsForRecord, isGameCompleted } from '../../lib/gameHistory';
import { useGameState } from '../../hooks/useGameState';
import { useAuth } from '../../hooks/useAuth';

// --- Types ---
type Player = { id: string; name: string; emoji: string; photoURL?: string; isGuest?: boolean };
type Round = { roundId: number; scores: Record<string, number> };
type PlayerSnapshot = { id: string; name: string; emoji: string; photoURL?: string };
type GameSettings = { target: number; scoreDirection: 'UP' | 'DOWN' };

type MatchRecord = {
  gameId?: string;
  matchId: string;
  date: string; 
  gameName: string;
  finalScores: Record<string, number>;
  activePlayerIds: string[];
  savedRounds: Round[];
  playerSnapshots: PlayerSnapshot[];
  settings?: GameSettings;
};

type PlayerStats = {
  playerId: string;
  name: string;
  emoji: string;
  photoURL?: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  totalPoints: number;
  avgPoints: number;
  bestScore: number;
  isCloudUser: boolean; // Helps us badge them in the UI
  useCustomEmoji: boolean;
};

const DINGBATS = ['☞', '✤', '✦', '✷', '✶', '✳', '✲', '✚', '✱', '✦', '✧', '✥', '❖', '✪', '✺', '✹', '✸', '⚘', '⚜', '☙'];

export default function RosterPage() {
  // 1. Cloud State
  const [cloudPlayers, setCloudPlayers] = useState<Player[]>([]);
  const [cloudHistory, setCloudHistory] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // 2. Local Storage State (The Legacy Data)
  const [localPlayers] = useGameState<Player[]>('scorekeeper_global_roster', []);
  const [localHistory] = useGameState<MatchRecord[]>('scorekeeper_history', []);
  const { gameProfiles } = useGameProfilesSync();
  const { user, loading: authLoading } = useAuth();

  // 3. Fetch from Firestore on mount (once auth state is known)
  useEffect(() => {
    async function fetchCloudData() {
      if (authLoading) {
        return;
      }

      if (!db || !user) {
        setCloudPlayers([]);
        setCloudHistory([]);
        setLoading(false);
        return;
      }

      try {
        const fetchedUsers = await fetchCloudPlayersWithLegacy(db);
        
        const gamesSnapshot = await getDocs(collection(db, 'Games'));
        const fetchedGames = gamesSnapshot.docs.map(doc => doc.data() as MatchRecord);

        setCloudPlayers(fetchedUsers as Player[]);
        setCloudHistory(fetchedGames);
      } catch (error) {
        console.error("Error fetching data from Firebase:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCloudData();
  }, [authLoading, user]);

  // 4. Merge Local and Cloud Data safely
  const allPlayers = useMemo(() => {
    return mergePlayersById(localPlayers, cloudPlayers);
  }, [localPlayers, cloudPlayers]);

  const allHistory = useMemo(() => {
    const combined = [...localHistory, ...cloudHistory];
    // Deduplicate by gameId (cloud) with matchId fallback (legacy local)
    return Array.from(new Map(combined.map(h => [h.gameId || h.matchId, h])).values());
  }, [localHistory, cloudHistory]);

  // 5. Analytics Engine (Running on merged data)
  const playerStats = useMemo(() => {
    const getScoreDirectionForGame = (game: MatchRecord): 'UP' | 'DOWN' => {
      if (game.settings?.scoreDirection) {
        return game.settings.scoreDirection;
      }

      const profile = gameProfiles.find((entry) => entry.name === game.gameName);
      if (profile?.scoreDirection) {
        return profile.scoreDirection;
      }

      return profile?.winCondition === 'LOW' ? 'DOWN' : 'UP';
    };

    const statsMap: Record<string, PlayerStats> = {};

    allPlayers.forEach(p => {
      // Determine if they exist in the cloud array to show a cloud icon later
      const isCloud = cloudPlayers.some(cp => cp.id === p.id);

      statsMap[p.id] = {
        playerId: p.id,
        name: p.name,
        emoji: p.emoji,
        photoURL: p.photoURL,
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
        totalPoints: 0,
        avgPoints: 0,
        bestScore: 0,
        isCloudUser: isCloud,
        useCustomEmoji: false,
      };
    });

    allHistory.forEach(game => {
      const completed = isGameCompleted(game);
      const winners = completed ? getWinnerIdsForRecord(game, getScoreDirectionForGame(game)) : [];
      const scoreDirection = getScoreDirectionForGame(game);

      // Update stats
      game.activePlayerIds.forEach(pid => {
        if (!statsMap[pid]) return; 
        
        const score = game.finalScores[pid] || 0;
        const pStats = statsMap[pid];

        pStats.gamesPlayed += 1;
        pStats.totalPoints += score;
        if (winners.includes(pid)) pStats.wins += 1;
        
        if (pStats.gamesPlayed === 1) {
          pStats.bestScore = score;
        } else {
          if (scoreDirection === 'UP') {
            pStats.bestScore = Math.max(pStats.bestScore, score);
          } else {
            pStats.bestScore = Math.min(pStats.bestScore, score);
          }
        }
      });
    });

    return Object.values(statsMap)
      .map(p => ({
        ...p,
        winRate: p.gamesPlayed > 0 ? p.wins / p.gamesPlayed : 0,
        avgPoints: p.gamesPlayed > 0 ? p.totalPoints / p.gamesPlayed : 0
      }))
      .sort((a, b) => b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed);
  }, [allPlayers, allHistory, gameProfiles, cloudPlayers]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#f6f6f2] text-[#111]">
        <div className="h-12 w-12 border-2 border-black border-t-transparent animate-spin"></div>
      </div>
    );
  }

return (
    <div className="min-h-screen bg-[#f6f6f2] text-[#111] pb-32 transition-colors newsprint-page">
      
      <div className="sticky top-0 z-40 bg-[#fbfbf8]/95 backdrop-blur-md border-b border-black/20">
        <div className="max-w-screen-md mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight [font-family:Georgia,'Times_New_Roman',serif]">All Players</h1>
          <span className="bg-white text-black px-3 py-1 rounded-none text-xs font-bold border border-black/20 uppercase tracking-[0.18em]">
            {allPlayers.length} Total Players
          </span>
        </div>
      </div>

      {/* 2. MATCHING MAIN CONTAINER */}
      <main className="max-w-screen-md mx-auto p-4 space-y-6">
        
        {/* Optional: If you ever want top-level Hero Stats for the whole roster, put the flex-box row here! */}

        <h2 className="text-sm font-bold text-black/55 uppercase tracking-widest mb-3 ml-1 mt-2">
          Player Profiles
        </h2>

        {/* 3. MATCHING FEED / LIST VIEW */}
        {loading ? (
          <div className="text-center p-8 text-black/55 font-medium">Syncing Cloud Roster...</div>
        ) : playerStats.length === 0 ? (
          <div className="bg-[#fbfbf8] rounded-none p-8 text-center text-black/55 font-medium border border-black/20 border-dashed">
            No players found. Start a game to add players!
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {playerStats.map((p) => (
              <Link 
                key={p.playerId} 
                href={`/roster/${p.playerId}`}
                className="block bg-[#fbfbf8] border border-black/20 rounded-none p-4 hover:border-black active:translate-y-px transition-all"
              >
                <div className="flex items-center gap-4 mb-4">
                  
                  {/* Matching Avatar Sizing */}
                  <div className="w-14 h-14 bg-white border border-black/20 rounded-none flex items-center justify-center text-3xl overflow-hidden flex-shrink-0">
                    {p.isCloudUser && p.photoURL && !p.useCustomEmoji ? (
                      <Image src={p.photoURL} alt={p.name} width={56} height={56} unoptimized className="w-full h-full object-cover" />
                    ) : (
                      <span>{DINGBATS[(p.playerId?.charCodeAt(0) ?? 0) % DINGBATS.length] || p.emoji || '☞'}</span>
                    )}
                  </div>
                  
                  {/* Name and Topline Stats */}
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-black flex items-center gap-2 truncate [font-family:Georgia,'Times_New_Roman',serif]">
                      <span className="truncate">{p.isCloudUser ? formatFirstName(p.name) : p.name}</span>
                      {p.isCloudUser && <span className="text-xs flex-shrink-0 text-black/55">◈</span>}
                    </div>
                    <div className="text-xs text-black/55 font-bold truncate uppercase tracking-[0.12em]">
                      {p.gamesPlayed} games • {p.wins} wins • {(p.winRate * 100).toFixed(0)}%
                    </div>
                  </div>
                  
                  {/* Native iOS Chevron to imply clickability */}
                  <div className="text-black/35 pl-2 text-xl font-black">
                    ▸
                  </div>
                </div>

                {/* Stat Pillars */}
                <div className="flex gap-3 text-center">
                  <div className="hidden sm:block flex-1 bg-white rounded-none py-2 border border-black/10">
                    <div className="text-[10px] text-black/55 font-bold uppercase tracking-wider">Total</div>
                    <div className="font-black text-black">{p.totalPoints}</div>
                  </div>
                  <div className="flex-1 bg-white rounded-none py-2 border border-black/10">
                    <div className="text-[10px] text-black/55 font-bold uppercase tracking-wider">Avg</div>
                    <div className="font-black text-black">{p.avgPoints.toFixed(0)}</div>
                  </div>
                  <div className="flex-1 bg-white rounded-none py-2 border border-black/10">
                    <div className="text-[10px] text-black/55 font-bold uppercase tracking-wider">Best</div>
                    <div className="font-black text-black">{p.bestScore}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}