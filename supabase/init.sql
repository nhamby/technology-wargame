-- Initialize the game_state table for the wargame application
-- Run this script in your Supabase project's SQL Editor

-- Create roles for Supabase
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO service_role;

-- Create the game_state table
CREATE TABLE IF NOT EXISTS game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant table permissions
GRANT ALL ON game_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON game_state TO anon, authenticated;

-- Insert initial game state
INSERT INTO game_state (data) VALUES (
  '{
    "round": 1,
    "game_ready": false,
    "teams": {},
    "submissions": {},
    "global_BR_pool": {
      "L": 0,
      "M": 0,
      "H": 0
    },
    "public_log": [],
    "private_logs": {},
    "active_users": {
      "US": false,
      "China": false,
      "France": false,
      "Russia": false
    },
    "history": []
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (suitable for local development)
-- For production, you should implement proper authentication and authorization
DROP POLICY IF EXISTS "Allow all operations" ON game_state;
CREATE POLICY "Allow all operations" 
  ON game_state 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Enable realtime for the game_state table
-- This allows clients to subscribe to real-time changes
-- Create the publication if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE game_state;

-- Create index on updated_at for performance
CREATE INDEX IF NOT EXISTS idx_game_state_updated_at ON game_state(updated_at DESC);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to call the function
DROP TRIGGER IF EXISTS update_game_state_updated_at ON game_state;
CREATE TRIGGER update_game_state_updated_at
  BEFORE UPDATE ON game_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Display initialization message
DO $$
BEGIN
  RAISE NOTICE 'Wargame database initialized successfully!';
END $$;
