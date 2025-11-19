# Local Development Guide

This guide will help you set up and test the Technology Wargame locally before deploying to production.

## Prerequisites

Before starting, make sure you have:

- **Node.js 20 or higher** - [Download here](https://nodejs.org/)
- **A Supabase account** - [Sign up for free](https://app.supabase.com)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

This will install all required packages including SvelteKit and Supabase client.

### 2. Set Up Supabase Project

#### Create a New Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Choose a project name and database password
4. Select a region close to you
5. Wait for the project to be created (takes about 2 minutes)

#### Get Your Credentials

1. In your Supabase project, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **Anon/Public Key**

#### Initialize the Database

1. In your Supabase project, click **SQL Editor** in the left sidebar

2. Click **New Query**

3. Copy and paste the following SQL and click **Run** to execute:

```sql
-- Create the game_state table
CREATE TABLE game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial game state
INSERT INTO game_state (data) VALUES (
  '{"round": 1, "game_ready": false, "teams": {}, "submissions": {},
    "global_BR_pool": {"L": 0, "M": 0, "H": 0}, "public_log": [],
    "private_logs": {}, "active_users": {"US": false, "China": false,
    "France": false, "Russia": false}, "history": []}'
);

-- Enable real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;

-- Enable Row Level Security
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (for simplicity)
CREATE POLICY "Allow all operations" ON game_state FOR ALL USING (true);
```

### 3. Configure Environment Variables

1. Copy the example environment file and rename to ".env":

2. Edit `.env` and add your Supabase credentials:

```env
PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Start the Development Server

```bash
npm run dev
```

The application will start on `http://localhost:5173`

## Testing the Game

### Default Login Credentials

| Role        | Password   |
| ----------- | ---------- |
| Game Master | `admin123` |
| US          | `password` |
| China       | `password` |
| France      | `password` |
| Russia      | `password` |

**Security Note**: These are default passwords for testing. Change them in `src/lib/config.ts` before production deployment.

### Testing with Multiple Players

To simulate a full game with multiple players:

1. **Open multiple browser windows/tabs**:

   - Window 1: `http://localhost:5173` - Log in as Game Master
   - Window 2: `http://localhost:5173` - Log in as US
   - Window 3: `http://localhost:5173` - Log in as China
   - Window 4: `http://localhost:5173` - Log in as France
   - Window 5: `http://localhost:5173` - Log in as Russia

2. **Game Flow**:

   - As Game Master: Click "Start New Game" to initialize
   - As Teams: Submit budget allocations for the round
   - As Game Master: When all teams have submitted, click "Resolve Round"
   - All players will see updates in real-time

3. **Testing Real-time Sync**:
   - Changes made in one window should appear immediately in all other windows
   - The "Game Ready" status should update when all teams submit
   - Round advancement should be visible to all players instantly

### Testing from Other Devices

If you want to test from other devices on your local network:

1. Find your computer's local IP address:

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig
```

For example: `http://192.168.1.100:5173`

## Common Development Tasks

### Resetting the Game State

To reset the game back to round 1:

1. Go to your Supabase project
2. Click **Table Editor** → **game_state**
3. Click on the row and edit the `data` field
4. Replace it with the initial state from the setup SQL above

Or run this SQL in the SQL Editor:

```sql
UPDATE game_state SET data =
  '{"round": 1, "game_ready": false, "teams": {}, "submissions": {},
    "global_BR_pool": {"L": 0, "M": 0, "H": 0}, "public_log": [],
    "private_logs": {}, "active_users": {"US": false, "China": false,
    "France": false, "Russia": false}, "history": []}';
```

### Viewing Real-time Database Changes

1. In Supabase, go to **Table Editor** → **game_state**
2. Keep this tab open while testing
3. You'll see the `data` field update as players interact with the game

### Checking Application Logs

Open your browser's Developer Tools (F12) and check the Console tab for:

- Supabase connection status
- Real-time subscription events
- Any errors or warnings

## Building for Production

Before deploying, test the production build locally:

```bash
npm run build
npm run preview
```

This will build and serve the production version at `http://localhost:4173`

## Next Steps

Once you've tested locally and everything works:

1. **Change Default Passwords** - Edit `src/lib/config.ts` before allowing others to access
2. **Secure Your Database** - Review Supabase RLS policies for production use

## Troubleshooting

### Can't connect to Supabase

- Double-check your `.env` file has the correct values
- Ensure there are no extra spaces or quotes around the values
- Verify the `game_state` table exists in your Supabase project

### Real-time updates not working

- Check that you ran the `ALTER PUBLICATION` command
- Look for WebSocket errors in the browser console
- Try refreshing the page to reconnect

### Port 5173 is already in use

```bash
# Kill the process using port 5173
lsof -ti:5173 | xargs kill -9

# Or specify a different port
npm run dev -- --port 5174
```

### Module not found errors

```bash
# Clear and reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Additional Resources

- [SvelteKit Documentation](https://kit.svelte.dev/)
- [Supabase Documentation](https://supabase.com/docs)
