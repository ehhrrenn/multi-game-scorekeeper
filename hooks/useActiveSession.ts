// hooks/useActiveSession.ts
import { useState, useEffect } from 'react';

export type GameType = 'custom' | 'yahtzee' | 'farkle' | null;

export interface ActiveSession {
  gameType: GameType;
  // We only need to store the IDs of the players to link back to the Global Roster
  playerIds: string[]; 
  gameState: any; // The specific game data (scores, turns, etc.)
}

export function useActiveSession() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  // Load the single global session on mount
  useEffect(() => {
    const savedSession = localStorage.getItem('scorekeeper_active_session');
    if (savedSession) {
      setActiveSession(JSON.parse(savedSession));
    }
  }, []);

  // Save or Overwrite the current active game
  const saveSession = (gameType: GameType, playerIds: string[], gameState: any) => {
    const newSession = { gameType, playerIds, gameState };
    localStorage.setItem('scorekeeper_active_session', JSON.stringify(newSession));
    setActiveSession(newSession);
  };

  // Clear the session (when a game ends via "Save & Close")
  const clearSession = () => {
    localStorage.removeItem('scorekeeper_active_session');
    setActiveSession(null);
  };

  return { activeSession, saveSession, clearSession };
}