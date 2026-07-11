/*
# Skat Abrechnung - Initial Schema

## Overview
This migration creates the complete database structure for a Skat scoring application
with multi-user support. Each user can create sessions, invite players, and track games.

## New Tables

### profiles
- `id` (uuid, primary key, references auth.users)
- `email` (text, unique)
- `display_name` (text)
- `created_at` (timestamptz)

### sessions
- `id` (uuid, primary key)
- `user_id` (uuid, owner, references auth.users)
- `name` (text, session name)
- `cent_per_point` (integer, default 1)
- `player_count` (integer, 3-5)
- `current_dealer_index` (integer, current dealer position)
- `current_game_number` (integer)
- `is_active` (boolean)
- `created_at` (timestamptz)
- `finished_at` (timestamptz)

### session_players
- `id` (uuid, primary key)
- `session_id` (uuid, references sessions)
- `name` (text, player name)
- `position` (integer, seat position 0-4)
- `total_score` (integer, cumulative score)
- `created_at` (timestamptz)

### games
- `id` (uuid, primary key)
- `session_id` (uuid, references sessions)
- `game_number` (integer)
- `dealer_id` (uuid, references session_players)
- `soloist_id` (uuid, references session_players, player who played)
- `game_type` (text: kreuz, pik, herz, karo, grand, null, null_hand, null_ouvert, null_ouvert_hand, revolution, ramsch, tischramsch)
- `won` (boolean)
- `buben_count` (integer, 0-4, null for null games)
- `buben_with` (boolean, null for null games - mit/ohne)
- `hand` (boolean)
- `schneider` (boolean)
- `schneider_announced` (boolean)
- `schwarz` (boolean)
- `schwarz_announced` (boolean)
- `ouvert` (boolean)
- `kontra` (boolean)
- `re` (boolean)
- `is_bock` (boolean, game in bock round)
- `is_ram_sch` (boolean, game is ramsch)
- `calculated_value` (integer, final game value)
- `ramsch_schieben_count` (integer, for ramsch games)
- `ramsch_jungfrau` (boolean, for ramsch games)
- `ramsch_durchmarsch` (boolean, for ramsch games)
- `lost_doubling_count` (integer, count of lost kontra/re/bock)
- `created_at` (timestamptz)

### game_opponents
- `id` (uuid, primary key)
- `game_id` (uuid, references games)
- `player_id` (uuid, references session_players)
- `role` (text: 'soloist', 'opponent', 'sitter')

### game_scores
- `id` (uuid, primary key)
- `game_id` (uuid, references games)
- `player_id` (uuid, references session_players)
- `score_change` (integer, points won/lost this game)
- `created_at` (timestamptz)

### queue_items
- `id` (uuid, primary key)
- `session_id` (uuid, references sessions)
- `type` (text: 'bock', 'ramsch')
- `games_remaining` (integer)
- `priority` (integer, for spaltarsch insertion)
- `created_at` (timestamptz)

### bock_counter
- `id` (uuid, primary key)
- `session_id` (uuid, references sessions)
- `total_bock_games` (integer, cumulative count)
- `created_at` (timestamptz)

## Security
- Enable RLS on all tables
- Owner-scoped policies for sessions (user_id)
- Session-scoped policies for child tables (check session ownership)
- All policies use auth.uid() for ownership checks
*/

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Skat Session',
  cent_per_point integer NOT NULL DEFAULT 1,
  player_count integer NOT NULL CHECK (player_count BETWEEN 3 AND 5),
  current_dealer_index integer NOT NULL DEFAULT 0,
  current_game_number integer NOT NULL DEFAULT 0,
  total_bock_games integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

-- Session players table
CREATE TABLE IF NOT EXISTS session_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 4),
  total_score integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, position)
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  game_number integer NOT NULL,
  dealer_id uuid REFERENCES session_players(id),
  soloist_id uuid REFERENCES session_players(id),
  game_type text NOT NULL CHECK (game_type IN ('kreuz', 'pik', 'herz', 'karo', 'grand', 'null', 'null_hand', 'null_ouvert', 'null_ouvert_hand', 'revolution', 'ramsch', 'tischramsch')),
  won boolean NOT NULL,
  buben_count integer CHECK (buben_count BETWEEN 0 AND 4),
  buben_with boolean,
  hand boolean NOT NULL DEFAULT false,
  schneider boolean NOT NULL DEFAULT false,
  schneider_announced boolean NOT NULL DEFAULT false,
  schwarz boolean NOT NULL DEFAULT false,
  schwarz_announced boolean NOT NULL DEFAULT false,
  ouvert boolean NOT NULL DEFAULT false,
  kontra boolean NOT NULL DEFAULT false,
  re boolean NOT NULL DEFAULT false,
  is_bock boolean NOT NULL DEFAULT false,
  is_ramsch boolean NOT NULL DEFAULT false,
  calculated_value integer NOT NULL DEFAULT 0,
  ramsch_schieben_count integer NOT NULL DEFAULT 0,
  ramsch_jungfrau boolean NOT NULL DEFAULT false,
  ramsch_durchmarsch boolean NOT NULL DEFAULT false,
  ramsch_loser_id uuid REFERENCES session_players(id),
  lost_doubling_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Game opponents (who played against whom, who sat out)
CREATE TABLE IF NOT EXISTS game_opponents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES session_players(id),
  role text NOT NULL CHECK (role IN ('soloist', 'opponent', 'sitter')),
  created_at timestamptz DEFAULT now()
);

-- Game scores (score changes per player per game)
CREATE TABLE IF NOT EXISTS game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES session_players(id),
  score_change integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Queue items (Bock/Ramsch queue)
CREATE TABLE IF NOT EXISTS queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('bock', 'ramsch')),
  games_remaining integer NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_opponents ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_items ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Sessions policies (owner-scoped)
DROP POLICY IF EXISTS "select_own_sessions" ON sessions;
CREATE POLICY "select_own_sessions" ON sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sessions" ON sessions;
CREATE POLICY "insert_own_sessions" ON sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sessions" ON sessions;
CREATE POLICY "update_own_sessions" ON sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sessions" ON sessions;
CREATE POLICY "delete_own_sessions" ON sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Session players policies (scoped through session ownership)
DROP POLICY IF EXISTS "select_own_session_players" ON session_players;
CREATE POLICY "select_own_session_players" ON session_players FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_players.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_session_players" ON session_players;
CREATE POLICY "insert_own_session_players" ON session_players FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_players.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_session_players" ON session_players;
CREATE POLICY "update_own_session_players" ON session_players FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_players.session_id AND sessions.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_players.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_session_players" ON session_players;
CREATE POLICY "delete_own_session_players" ON session_players FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_players.session_id AND sessions.user_id = auth.uid())
  );

-- Games policies (scoped through session ownership)
DROP POLICY IF EXISTS "select_own_games" ON games;
CREATE POLICY "select_own_games" ON games FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = games.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_games" ON games;
CREATE POLICY "insert_own_games" ON games FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = games.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_games" ON games;
CREATE POLICY "update_own_games" ON games FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = games.session_id AND sessions.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = games.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_games" ON games;
CREATE POLICY "delete_own_games" ON games FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = games.session_id AND sessions.user_id = auth.uid())
  );

-- Game opponents policies
DROP POLICY IF EXISTS "select_own_game_opponents" ON game_opponents;
CREATE POLICY "select_own_game_opponents" ON game_opponents FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM games g JOIN sessions s ON g.session_id = s.id WHERE g.id = game_opponents.game_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_game_opponents" ON game_opponents;
CREATE POLICY "insert_own_game_opponents" ON game_opponents FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM games g JOIN sessions s ON g.session_id = s.id WHERE g.id = game_opponents.game_id AND s.user_id = auth.uid())
  );

-- Game scores policies
DROP POLICY IF EXISTS "select_own_game_scores" ON game_scores;
CREATE POLICY "select_own_game_scores" ON game_scores FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM games g JOIN sessions s ON g.session_id = s.id WHERE g.id = game_scores.game_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_game_scores" ON game_scores;
CREATE POLICY "insert_own_game_scores" ON game_scores FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM games g JOIN sessions s ON g.session_id = s.id WHERE g.id = game_scores.game_id AND s.user_id = auth.uid())
  );

-- Queue items policies
DROP POLICY IF EXISTS "select_own_queue_items" ON queue_items;
CREATE POLICY "select_own_queue_items" ON queue_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = queue_items.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_queue_items" ON queue_items;
CREATE POLICY "insert_own_queue_items" ON queue_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = queue_items.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_queue_items" ON queue_items;
CREATE POLICY "update_own_queue_items" ON queue_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = queue_items.session_id AND sessions.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = queue_items.session_id AND sessions.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_queue_items" ON queue_items;
CREATE POLICY "delete_own_queue_items" ON queue_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = queue_items.session_id AND sessions.user_id = auth.uid())
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_session_players_session_id ON session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_games_session_id ON games(session_id);
CREATE INDEX IF NOT EXISTS idx_game_opponents_game_id ON game_opponents(game_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_id ON game_scores(game_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_session_id ON queue_items(session_id);