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
    return;
  }

  if (gameType === 'farkle') {
    window.localStorage.removeItem('farkle_players');
    window.localStorage.removeItem('farkle_scores');
    window.localStorage.removeItem('farkle_mode');
    window.localStorage.removeItem('farkle_settings');
    window.localStorage.removeItem('farkle_current_round');
    window.localStorage.removeItem('farkle_current_player');
    window.localStorage.removeItem('farkle_phase');
    window.localStorage.removeItem('scorekeeper_active_game_id');
    return;
  }

  if (gameType === 'catan') {
    window.localStorage.removeItem('catan_players');
    window.localStorage.removeItem('catan_scores');
    window.localStorage.removeItem('catan_board');
    window.localStorage.removeItem('catan_round_index');
    window.localStorage.removeItem('catan_player_index');
    window.localStorage.removeItem('catan_phase');
    window.localStorage.removeItem('catan_has_celebrated');
    window.localStorage.removeItem('scorekeeper_active_game_id');
  }
}
