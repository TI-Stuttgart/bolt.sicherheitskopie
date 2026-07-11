import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Session = {
  id: string;
  user_id: string;
  name: string;
  cent_per_point: number;
  player_count: number;
  current_dealer_index: number;
  current_game_number: number;
  total_bock_games: number;
  is_active: boolean;
  created_at: string;
  finished_at: string | null;
};

export type SessionPlayer = {
  id: string;
  session_id: string;
  name: string;
  position: number;
  total_score: number;
};

export type Game = {
  id: string;
  session_id: string;
  game_number: number;
  dealer_id: string | null;
  soloist_id: string | null;
  game_type: GameType;
  won: boolean;
  buben_count: number | null;
  buben_with: boolean | null;
  hand: boolean;
  schneider: boolean;
  schneider_announced: boolean;
  schwarz: boolean;
  schwarz_announced: boolean;
  ouvert: boolean;
  kontra: boolean;
  re: boolean;
  is_bock: boolean;
  is_ramsch: boolean;
  calculated_value: number;
  ramsch_schieben_count: number;
  ramsch_jungfrau: boolean;
  ramsch_durchmarsch: boolean;
  ramsch_loser_id: string | null;
  lost_doubling_count: number;
};

export type GameOpponent = {
  id: string;
  game_id: string;
  player_id: string;
  role: 'soloist' | 'opponent' | 'sitter';
};

export type GameScore = {
  id: string;
  game_id: string;
  player_id: string;
  score_change: number;
};

export type QueueItem = {
  id: string;
  session_id: string;
  type: 'bock' | 'ramsch';
  games_remaining: number;
  priority: number;
};

export type GameType = 'kreuz' | 'pik' | 'herz' | 'karo' | 'grand' | 'null' | 'null_hand' | 'null_ouvert' | 'null_ouvert_hand' | 'revolution' | 'ramsch' | 'tischramsch';
