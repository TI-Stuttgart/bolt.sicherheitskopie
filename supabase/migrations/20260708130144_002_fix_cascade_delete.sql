-- Fix foreign key constraint for game_opponents -> session_players
-- This allows cascade delete from sessions all the way down

-- Drop the existing constraint
ALTER TABLE game_opponents 
  DROP CONSTRAINT IF EXISTS game_opponents_player_id_fkey;

-- Recreate with ON DELETE CASCADE
ALTER TABLE game_opponents 
  ADD CONSTRAINT game_opponents_player_id_fkey 
  FOREIGN KEY (player_id) REFERENCES session_players(id) ON DELETE CASCADE;

-- Also fix game_scores -> session_players
ALTER TABLE game_scores 
  DROP CONSTRAINT IF EXISTS game_scores_player_id_fkey;

ALTER TABLE game_scores 
  ADD CONSTRAINT game_scores_player_id_fkey 
  FOREIGN KEY (player_id) REFERENCES session_players(id) ON DELETE CASCADE;

-- Fix games -> soloist/loser references
ALTER TABLE games 
  DROP CONSTRAINT IF EXISTS games_soloist_id_fkey;

ALTER TABLE games 
  ADD CONSTRAINT games_soloist_id_fkey 
  FOREIGN KEY (soloist_id) REFERENCES session_players(id) ON DELETE CASCADE;

ALTER TABLE games 
  DROP CONSTRAINT IF EXISTS games_ramsch_loser_id_fkey;

ALTER TABLE games 
  ADD CONSTRAINT games_ramsch_loser_id_fkey 
  FOREIGN KEY (ramsch_loser_id) REFERENCES session_players(id) ON DELETE CASCADE;