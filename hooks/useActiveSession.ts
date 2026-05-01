// hooks/useActiveSession.ts
import { useCallback, useEffect, useState } from 'react';

export type GameType = 'custom' | 'yahtzee' | 'farkle' | null;

export interface ActiveSession {
  sessionId: string;
  gameType: GameType;
  // We only need to store the IDs of the players to link back to the Global Roster
  playerIds: string[]; 
  gameState: any; // The specific game data (scores, turns, etc.)
  lastModifiedAt: number;
}

const ACTIVE_SESSION_KEY = 'scorekeeper_active_session';
const ACTIVE_SESSION_EVENT = 'scorekeeper:active-session-changed';

function readActiveSession(): ActiveSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const savedSession = window.localStorage.getItem(ACTIVE_SESSION_KEY);
  if (!savedSession) {
    return null;
  }

  try {
    return JSON.parse(savedSession) as ActiveSession;
  } catch {
    return null;
  }
}

export function useActiveSession() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  useEffect(() => {
    setActiveSession(readActiveSession());

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== ACTIVE_SESSION_KEY) {
        return;
      }

      setActiveSession(readActiveSession());
    };

    const handleActiveSessionChanged = () => {
      setActiveSession(readActiveSession());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(ACTIVE_SESSION_EVENT, handleActiveSessionChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(ACTIVE_SESSION_EVENT, handleActiveSessionChanged);
    };
  }, []);

  const saveSession = useCallback((gameType: GameType, playerIds: string[], gameState: any, sessionId?: string) => {
    const nextSessionId = sessionId || activeSession?.sessionId || `${gameType || 'game'}_${Date.now()}`;
    const newSession = {
      sessionId: nextSessionId,
      gameType,
      playerIds,
      gameState,
      lastModifiedAt: Date.now()
    };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(newSession));
    window.dispatchEvent(new Event(ACTIVE_SESSION_EVENT));
    setActiveSession(newSession);
  }, [activeSession?.sessionId]);

  const clearSession = useCallback(() => {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    window.dispatchEvent(new Event(ACTIVE_SESSION_EVENT));
    setActiveSession(null);
  }, []);

  return { activeSession, saveSession, clearSession };
}