import type { GameType } from '../hooks/useActiveSession';

export function clearStoredGameState(gameType: GameType): void {
  if (typeof window === 'undefined' || !gameType) {
    return;
  }

  if (gameType === 'custom') {
    window.localStorage.removeItem('scorekeeper_players');
    window.localStorage.removeItem('scorekeeper_rounds');
    window.localStorage.removeItem('scorekeeper_active_game_id');
    window.localStorage.removeItem('scorekeeper_has_celebrated');
    return;
  }

  if (gameType === 'yahtzee') {
    window.localStorage.removeItem('yahtzee_players');
    window.localStorage.removeItem('yahtzee_is_triple');
    window.localStorage.removeItem('yahtzee_scores_v2');
    window.localStorage.removeItem('scorekeeper_active_game_id');
  }
}
