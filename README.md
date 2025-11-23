# Global Research Wargame - SvelteKit Edition

A real-time, multiplayer technology wargame where 4 countries compete in strategic technology development over 10 rounds. Built with SvelteKit and Supabase for reliable real-time synchronization.

## Game Overview

**Players**: 4 countries (US, China, France, Russia) + 1 Game Master  
**Duration**: 10 rounds  
**Objective**: Maximize technology points (TP) across three tech levels

### Core Mechanics

- **Basic Research (BR)**: Public investment in foundational knowledge. Your BR builds talent knowledge (TK) and contributes to a global pool accessible by all players (you get 100%, others get 75%)
- **Applied Research (AR)**: Secret technology development at three levels:
  - **L (Incremental)**: Low-risk, foundational discoveries
  - **M (Advanced)**: Medium-risk, requires minimum BR investment
  - **H (Radical)**: High-risk, breakthrough technologies
- **Espionage (SP)**: Deploy spies to observe or steal rival technologies (max 2 targets per round)
- **Education**: Invest in Secondary (SE) and Tertiary (TE) education to build talent pool (K)
- **Immigration**: Open or close borders to affect talent flow and espionage defense

### Game Progression

Each round, teams simultaneously allocate their budget (W × 2 dice) across investments. The GM resolves all actions, rolls dice for outcomes, and advances to the next round. Unused dice carry over at 2/3 efficiency.

## Quick Start

### Prerequisites

- Node.js 20+
- Supabase account (free tier sufficient)

### Local Development Setup

> **For detailed setup instructions**, see [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

#### Quick Setup (5 minutes)

1. **Clone and install dependencies**:

   ```bash
   git clone <repository-url>
   cd technology-wargame
   npm install
   ```

2. **Configure Supabase** - Get credentials from [app.supabase.com](https://app.supabase.com):

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Supabase project credentials:

   ```env
   PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. **Initialize Supabase database**:

   **Option A - Automated (Recommended)**:

   ```bash
   npm run init-db
   ```

   **Option B - Manual**: Go to your project's SQL Editor and run `supabase/init.sql`

4. **Start local development server**:

   ```bash
   npm run dev
   # Or use the convenience script
   ./start-local.sh
   ```

   Open `http://localhost:5173` and start testing

### Testing Locally

The application runs on `http://localhost:5173` during development. All data is stored in your Supabase cloud database, allowing multiple people to test together.

**Quick Testing Tips**:

- Open multiple browser windows to simulate different players
- Default passwords: GM = `admin123`, Teams = `password`
- Real-time updates work across all connected clients
- See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for detailed testing guide

### Default Credentials

| Role                      | Password   |
| ------------------------- | ---------- |
| Game Master               | `admin123` |
| US, China, France, Russia | `password` |

**IMPORTANT:** Change passwords in `src/lib/config.ts` before allowing others to access

## Architecture

### Technology Stack

- **Frontend**: SvelteKit 2 with TypeScript, Svelte 4
- **Database**: Supabase (PostgreSQL + real-time WebSockets)
- **State**: Client-side Svelte stores + Supabase sync

### Key Features

**Real-time Synchronization**: WebSocket subscriptions provide instant updates when GM resolves rounds or players submit allocations. No polling or manual refresh required.

**Type Safety**: Complete TypeScript type system ensures compile-time validation of game state, eliminating runtime errors.

**Budget Validation**: Client-side validation with real-time feedback prevents invalid submissions. Tiered AR costs (1-2-3 dice per level) and tech prerequisites enforced automatically.

**Fog of War**: Scoreboard displays public metrics for all teams, but TP scores are hidden unless revealed through successful espionage.

**Carryover System**: Unused dice carry forward at 2/3 efficiency, encouraging strategic resource management.

### File Structure

```text
src/
├── lib/
│   ├── types.ts           # TypeScript type definitions
│   ├── config.ts          # Game configuration and passwords
│   ├── gameLogic.ts       # Core mechanics (BR/AR/SP resolution)
│   └── supabaseClient.ts  # Database connection
├── routes/
│   ├── +page.svelte       # Login page
│   ├── +layout.svelte     # Root layout
│   ├── team/
│   │   └── +page.svelte   # Team interface
│   └── gm/
│       └── +page.svelte   # Game Master control panel
supabase/
└── init.sql               # Database initialization script (for reference)
```

## Game Mechanics Reference

### Budget Allocation

Each team receives **2 × W dice** per round. Costs:

- **SE/TE**: Population-weighted for SE, 1 die for TE
- **BR**: 1 die per investment point
- **AR**: Tiered pricing (1-2-3) based on total AR investments
  - First 2 dice: 1 die each
  - Next 2 dice: 2 dice each
  - Remaining: 3 dice each
- **SP**: 1 die per espionage target (max 2)

### Tech Prerequisites

- **L-level**: Available to all teams
- **M-level**: Requires BR ≥ 3.0
- **H-level**: Requires BR ≥ 7.0

### Espionage Outcomes

Roll modified by target's immigration status (IM):

- **IM=0 (closed)**: Roll -1
- **IM=1 (open)**: Roll +1

Results by adjusted roll:

- **1-3**: Caught (public announcement)
- **4**: Failed (silent)
- **5**: Observe (reveal TP score)
- **6**: Observe + Copy (reveal and steal 1d6 TP)

## Troubleshooting

### Local Development Issues

**Module errors**: Delete `node_modules` and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

**Supabase connection errors**:

- Verify `.env` file has correct `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
- Check that the `game_state` table exists in your Supabase project
- Ensure Row Level Security policy is enabled (see setup instructions)

**Port already in use** (if you see "EADDRINUSE"):

```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9
```

**Real-time updates not working**:

- Check that you've enabled real-time on the `game_state` table in Supabase
- Verify the table is added to the `supabase_realtime` publication
- Check browser console for WebSocket connection errors

## License

See [LICENSE](LICENSE) file for details.
