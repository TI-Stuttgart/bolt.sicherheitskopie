-- Add sitter_index column to sessions table
-- For 4 players: sitter_index = dealer_index (dealer sits out)
-- For 5 players: sitter_index will be second sitter (first is dealer)
-- For 3 players: sitter_index is unused (everyone plays)

ALTER TABLE sessions ADD COLUMN sitter_index INTEGER DEFAULT 0;

-- Add check constraint for valid sitter_index
ALTER TABLE sessions ADD CONSTRAINT sitter_index_valid 
  CHECK (sitter_index >= 0 AND sitter_index < player_count);

COMMENT ON COLUMN sessions.sitter_index IS 
  'Index of additional sitting player (besides dealer for 5-player games). For 4 players, equals dealer_index. For 3 players, unused.';