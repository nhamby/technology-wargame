<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import type { GameState, Team, TeamState, TeamAllocation, TechLevel } from '$lib/types';
	import { GAME_CONFIG, TEAMS } from '$lib/config';
	import { 
		empty_team_state, 
		compute_W_from_GDP, 
		compute_pop_weights, 
		compute_initial_K,
		compute_im_weights,
		roll_dice,
		normalize_metric
	} from '$lib/gameLogic';

	let gameState: GameState | null = null;
	let loading = true;
	let statusMessage = '';
	let selectedHistoryRound = '';
	let forceSubmitTeam: Team | '' = '';
	let showDebug = false;

	onMount(async () => {
		const role = sessionStorage.getItem('wargame_role');
		const auth = sessionStorage.getItem('wargame_auth');
		
		if (!role || auth !== 'true' || role !== 'GM') {
			goto('/');
			return;
		}

		await loadGameState();

		// Subscribe to real-time updates
		supabase
			.channel('game-updates')
			.on('postgres_changes', 
				{ event: '*', schema: 'public', table: 'game_state' },
				(payload: any) => {
					if (payload.new && 'data' in payload.new) {
						gameState = payload.new.data as GameState;
					}
				}
			)
			.subscribe();
	});

	async function loadGameState() {
		loading = true;
		const { data, error } = await supabase
			.from('game_state')
			.select('*')
			.single();
		
		if (error) {
			console.error('Error loading game state:', error);
			statusMessage = 'Error loading game state: ' + error.message;
			gameState = null;
		} else if (data) {
			console.log('Raw data from Supabase:', data);
			gameState = (data as any).data as GameState;
			console.log('Parsed gameState:', gameState);
			statusMessage = 'Game state loaded';
		} else {
			statusMessage = 'No data found in database';
			gameState = null;
		}
		loading = false;
	}

	async function createEmptyGameState() {
		loading = true;
		statusMessage = 'Creating empty game state...';
		
		const emptyState: GameState = {
			round: 1,
			game_ready: false,
			round_resolved: false,
			teams: {} as Record<Team, TeamState>,
			submissions: {} as Record<Team, TeamAllocation>,
			global_BR_pool: { L: 0, M: 0, H: 0 },
			public_log: [],
			private_logs: {
				US: [],
				China: [],
				France: [],
				Russia: []
			},
			active_users: {
				US: false,
				China: false,
				France: false,
				Russia: false
			},
			history: []
		};

		const { data, error } = await supabase
			.from('game_state')
			.insert({ data: emptyState })
			.select()
			.single();

		if (error) {
			console.error('Error creating game state:', error);
			statusMessage = 'Error creating game state: ' + error.message;
		} else {
			console.log('Created game state:', data);
			gameState = emptyState;
			statusMessage = 'Empty game state created. Click "Initialize Game" to set up teams.';
		}
		
		loading = false;
	}

	async function saveGameState() {
		if (!gameState) return;
		
		const { error } = await supabase
			.from('game_state')
			.update({ data: gameState, updated_at: new Date().toISOString() })
			.eq('id', (await supabase.from('game_state').select('id').single()).data?.id);
		
		if (error) {
			statusMessage = 'Error saving game state';
			console.error(error);
		} else {
			statusMessage = 'Game state saved';
		}
	}

	async function initializeGame() {
		if (gameState?.game_ready) {
			if (!confirm('Game already initialized. Reset and start over?')) return;
		}

		const gdps = TEAMS.map(t => GAME_CONFIG.init_by_team[t].GDP);
		const pops = TEAMS.map(t => GAME_CONFIG.init_by_team[t].POP);
		
		const W_vals = compute_W_from_GDP(gdps);
		const POP_wts = compute_pop_weights(pops);

		const teams: Record<Team, TeamState> = {} as Record<Team, TeamState>;
		
		TEAMS.forEach((t, idx) => {
			const st = empty_team_state();
			const init = GAME_CONFIG.init_by_team[t];
			
			st.GDP = gdps[idx];
			st.POP = pops[idx];
			st.W = W_vals[idx];
			st.SE = init.SE;
			st.TE = init.TE;
			st.IM = init.IM;
			st.regime = init.regime;
			st.K = compute_initial_K(st.SE, st.TE, 1);
			st.TK = 0;
			
			// Country-specific TK boosts
			if (t === 'France') st.TK += 4;
			if (t === 'Russia') st.TK += 7;
			
			teams[t] = st;
		});

		gameState = {
			round: 1,
			teams,
			submissions: { US: null, China: null, France: null, Russia: null },
			global_BR_pool: { L: 0, M: 0, H: 0 },
			public_log: [],
			private_logs: { US: [], China: [], France: [], Russia: [] },
			active_users: { US: false, China: false, France: false, Russia: false },
			game_ready: true,
			history: [],
			round_resolved: false
		};

		await saveGameState();
		statusMessage = 'Game initialized! Players can now join.';
	}

	async function resolveRound() {
		if (!gameState) return;
		
		// Check if round already resolved
		if (gameState.round_resolved) {
			statusMessage = 'Error: This round has already been resolved. Advance to next round.';
			return;
		}
		
		const allSubmitted = TEAMS.every(t => gameState!.teams[t].submitted);
		if (!allSubmitted) {
			if (!confirm('Not all teams have submitted. Resolve anyway?')) return;
		}

		// Save TP from last round
		TEAMS.forEach(t => {
			gameState!.teams[t].TP_last_round = { ...gameState!.teams[t].TP };
		});

		const public_events: string[] = [];
		const private_events: Record<Team, string[]> = { US: [], China: [], France: [], Russia: [] };

		const pw = compute_pop_weights(TEAMS.map(t => gameState!.teams[t].POP));
		const imw = compute_im_weights(gameState!.teams);

		// Apply IM flips and education
		TEAMS.forEach((t, idx) => {
			const st = gameState!.teams[t];
			const alloc = gameState!.submissions[t];
			if (!alloc) return;

			if (alloc.IM === 'open' && st.IM === 0) st.IM = 1;
			if (alloc.IM === 'close' && st.IM === 1) st.IM = 0;

			if (alloc.SE > 0) st.K += 1 * pw[idx];
			if (alloc.TE > 0) st.K += 1 * (1 + st.IM);
		});

		// Talent flow adjustment
		TEAMS.forEach(t => {
			const st = gameState!.teams[t];
			st.K *= imw[t];
		});

		// BR phase
		TEAMS.forEach(t => {
			const st = gameState!.teams[t];
			const alloc = gameState!.submissions[t];
			if (!alloc || alloc.BR === 0) return;

			const rolls = roll_dice(alloc.BR);
			let successes = rolls.filter(r => r >= 4).length;

			// Regime modifiers
			if (st.regime === 'demo') successes = Math.round(successes * 1.1);
			else if (st.regime === 'auto') successes = Math.round(successes * 0.9);

			// K-based bonus
			const k_bonus = Math.floor(st.K / 10);
			successes += k_bonus;

			st.BR_total += successes;
			st.TK += successes;

			public_events.push(`Round ${gameState!.round}: ${t} - BR successes = ${successes} (rolls: ${rolls.join(', ')})`);
		});

		// Calculate effective BR
		const total_BR = TEAMS.reduce((sum, t) => sum + gameState!.teams[t].BR_total, 0);
		TEAMS.forEach(t => {
			const own_BR = gameState!.teams[t].BR_total;
			const others_BR = total_BR - own_BR;
			gameState!.teams[t].BR_effective = own_BR + 0.75 * others_BR;
		});

		public_events.push(`Round ${gameState!.round}: Global BR - ${TEAMS.map(t => `${t}=${gameState!.teams[t].BR_total}`).join(', ')}`);

		// AR phase
		TEAMS.forEach(t => {
			const st = gameState!.teams[t];
			const alloc = gameState!.submissions[t];
			if (!alloc) return;

			(['L', 'M', 'H'] as TechLevel[]).forEach(tech => {
				const n_dice = alloc.AR[tech];
				if (n_dice === 0) return;

				const tech_info = GAME_CONFIG.tech_info[tech];
				if (st.BR_effective < tech_info.br_req) {
					private_events[t].push(`Round ${gameState!.round}: AR(${tech}) skipped - need ${tech_info.br_req} BR`);
					return;
				}

				const rolls = roll_dice(n_dice);
				let successes = rolls.filter(r => r >= tech_info.ar_thr).length;

				// Regime modifier for M/H
				if (tech !== 'L') {
					if (st.regime === 'auto') successes = Math.round(successes * 1.1);
					else if (st.regime === 'demo') successes = Math.round(successes * 0.9);
				}

				st.TK += n_dice;

				let TK_adj = st.TK;
				if (tech === 'M' && st.K < GAME_CONFIG.min_requirements.M.K_min) {
					TK_adj = Math.max(0, TK_adj - 10);
				}
				if (tech === 'H') {
					if (st.K < GAME_CONFIG.min_requirements.H.K_min || st.TK < GAME_CONFIG.min_requirements.H.TK_min) {
						TK_adj = Math.max(0, TK_adj - 10);
					}
				}

				const tp_gains = tech_info.tp_draw(successes, TK_adj);
				const tp_gain = tp_gains.reduce((a, b) => a + b, 0);

				if (successes > 0) {
					st.TP[tech] += tp_gain;
					private_events[t].push(`Round ${gameState!.round}: AR(${tech}) successes=${successes} → TP +${tp_gain}`);
				} else {
					private_events[t].push(`Round ${gameState!.round}: AR(${tech}) no successes`);
				}

				// Check discovery
				if (st.TP[tech] >= GAME_CONFIG.tp_threshold[tech] && !st.discovered[tech]) {
					st.discovered[tech] = true;
					private_events[t].push(`Round ${gameState!.round}: Discovered ${tech} tech!`);
				}
			});
		});

		// Spy phase
		TEAMS.forEach(t => {
			const st = gameState!.teams[t];
			const alloc = gameState!.submissions[t];
			if (!alloc || !alloc.SP) return;

			alloc.SP.forEach(sp => {
				if (!sp || !sp.target) return;

				const target = sp.target as Team;
				const tech = sp.tech;
				const tgt_st = gameState!.teams[target];

				const roll = Math.floor(Math.random() * 6) + 1;
				let eff_roll = roll;
				if (tgt_st.IM === 1) eff_roll = Math.min(6, roll + 1);
				else eff_roll = Math.max(1, roll - 1);

				const caught_threshold = tech === 'L' ? 1 : tech === 'M' ? 2 : 3;
				const fail_range = tech === 'L' ? [2, 3] : tech === 'M' ? [3, 4] : [4];

				if (eff_roll <= caught_threshold) {
					st.spy_caught_count[target][tech]++;
					public_events.push(`Round ${gameState!.round}: ${t} spy on ${target} (${tech}) CAUGHT (roll=${roll}→${eff_roll})`);
				} else if (fail_range.includes(eff_roll)) {
					private_events[t].push(`Round ${gameState!.round}: Spy failed vs ${target} (${tech})`);
				} else if (eff_roll === 5) {
					st.spy_revealed[target][tech] = true;
					private_events[t].push(`Round ${gameState!.round}: OBSERVE - Saw ${target} TP(${tech})=${tgt_st.TP[tech]}`);
				} else if (eff_roll === 6) {
					st.spy_revealed[target][tech] = true;
					const past_tp = tgt_st.TP_last_round[tech];
					st.TP[tech] = Math.max(st.TP[tech], past_tp);
					private_events[t].push(`Round ${gameState!.round}: STEAL SUCCESS - copied TP(${tech})=${past_tp} from ${target}`);
				}
			});
		});

		// Update logs
		public_events.forEach(event => {
			gameState!.public_log.push({ round: gameState!.round, event });
		});
		TEAMS.forEach(t => {
			private_events[t].forEach(event => {
				gameState!.private_logs[t].push({ round: gameState!.round, event });
			});
		});

		// Reset submission flags
		TEAMS.forEach(t => {
			gameState!.teams[t].submitted = false;
			gameState!.submissions[t] = null;
		});

		// Mark round as resolved
		gameState.round_resolved = true;

		await saveGameState();
		statusMessage = `Round ${gameState!.round} resolved! You can now advance to the next round.`;
	}

	async function advanceRound() {
		if (!gameState) return;

		// Check if round has been resolved
		if (!gameState.round_resolved) {
			statusMessage = 'Error: You must resolve the current round before advancing.';
			return;
		}

		if (gameState.round >= GAME_CONFIG.max_rounds) {
			statusMessage = 'Final round reached!';
			return;
		}

		// Apply carryover
		TEAMS.forEach(t => {
			const st = gameState!.teams[t];
			if (st.pending_W_carryover) {
				st.W += st.pending_W_carryover;
				st.last_carryover = st.pending_W_carryover;
				st.pending_W_carryover = 0;
			}
		});

		gameState.round++;
		// Reset round_resolved for the new round
		gameState.round_resolved = false;
		
		await saveGameState();
		statusMessage = `Advanced to Round ${gameState.round}`;
	}

	async function hardReset() {
		if (!confirm('HARD RESET: Delete all game data and start from Round 1?')) return;
		
		await initializeGame();
		if (gameState) {
			gameState.game_ready = false;
			gameState.round = 1;
			gameState.round_resolved = false;
			await saveGameState();
		}
		statusMessage = 'Game reset to initial state';
	}

	async function forceUnlockAll() {
		if (!gameState) return;
		TEAMS.forEach(t => {
			gameState!.active_users[t] = false;
		});
		await saveGameState();
		statusMessage = 'All teams unlocked';
	}

	async function forceMarkSubmitted() {
		if (!gameState || !forceSubmitTeam) return;
		
		gameState.teams[forceSubmitTeam].submitted = true;
		await saveGameState();
		statusMessage = `${forceSubmitTeam} marked as submitted`;
		forceSubmitTeam = '';
	}

	function logout() {
		sessionStorage.clear();
		goto('/');
	}

	$: submissionCount = gameState ? TEAMS.filter(t => gameState!.teams[t]?.submitted).length : 0;
	$: allSubmitted = submissionCount === 4;
</script>

<svelte:head>
	<title>Game Master Control Panel</title>
</svelte:head>

<main class="container">
	<div class="header">
		<h1>Game Master Control Panel</h1>
		<div class="header-controls">
			<label class="debug-toggle">
				<input type="checkbox" bind:checked={showDebug} />
				<span>Debug Mode</span>
			</label>
			<button on:click={logout} class="btn-logout">Logout</button>
		</div>
	</div>

	<!-- Debug info -->
	{#if showDebug}
		<div class="debug-panel">
			<p><strong>Debug Info:</strong></p>
			<p>Loading: {loading}</p>
			<p>GameState: {gameState ? 'exists' : 'null'}</p>
			<p>Status: {statusMessage}</p>
			{#if gameState}
				<p>Teams: {JSON.stringify(Object.keys(gameState.teams || {}))}</p>
				<p>Game Ready: {gameState.game_ready}</p>
				<p>Round: {gameState.round}</p>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="card">
			<h2>Loading game state...</h2>
			<p>Please wait...</p>
		</div>
	{:else if !gameState}
		<div class="card">
			<h2 style="color: red;">No Game State Found</h2>
			<p>The database table exists but has no data.</p>
			<p><strong>Status:</strong> {statusMessage}</p>
			<div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
				<button on:click={createEmptyGameState} class="btn btn-success">
					Create Empty Game State
				</button>
				<button on:click={loadGameState} class="btn btn-secondary">
					Retry Loading
				</button>
			</div>
			<div style="margin-top: 1.5rem; padding: 1rem; background: #f0f0f0; border-radius: 6px;">
				<p style="margin: 0; font-size: 0.9rem;"><strong>Steps:</strong></p>
				<ol style="margin: 0.5rem 0; font-size: 0.9rem;">
					<li>Click "Create Empty Game State" to add initial data</li>
					<li>Then click "Initialize Game" to set up all teams</li>
					<li>Teams can then log in and start playing</li>
				</ol>
			</div>
		</div>
	{:else if gameState && (!gameState.teams || Array.isArray(gameState.teams) || Object.keys(gameState.teams).length === 0)}
		<div class="card">
			<h2 style="color: orange;">Game Not Initialized</h2>
			<p>The game state exists but teams haven't been set up yet.</p>
			<p><strong>Current Status:</strong> Round {gameState.round}, {gameState.game_ready ? 'Ready' : 'Not Ready'}</p>
			<div style="margin-top: 1.5rem;">
				<button on:click={initializeGame} class="btn btn-primary btn-large">
					Initialize Game & Set Up Teams
				</button>
			</div>
			<div style="margin-top: 1.5rem; padding: 1rem; background: #f0f0f0; border-radius: 6px;">
				<p style="margin: 0 0 0.5rem 0; font-size: 0.9rem;"><strong>What this does:</strong></p>
				<ul style="margin: 0; font-size: 0.9rem; padding-left: 1.5rem;">
					<li>Sets up all 4 teams (US, China, France, Russia)</li>
					<li>Assigns starting GDP, population, and resources</li>
					<li>Initializes talent pools and technology levels</li>
					<li>Enables teams to log in and start playing</li>
				</ul>
			</div>
		</div>
	{:else}
		<!-- Status Message -->
		{#if statusMessage}
			<div class="alert alert-info">{statusMessage}</div>
		{/if}

		{#if !gameState.game_ready}
			<div class="card" style="background: #fff3cd; border: 2px solid #ffc107;">
				<h2 style="color: #856404;">Game Not Initialized</h2>
				<p>The game state exists but teams haven't been set up yet.</p>
				<p><strong>Click "Initialize Game" below to set up all teams with their starting values.</strong></p>
			</div>
		{/if}

		<!-- Main Controls -->
		<div class="card">
			<h2>Main Controls</h2>
			<div class="control-grid">
				<div>
					<label>
						Current Round:
						<input type="number" bind:value={gameState.round} min="1" max={GAME_CONFIG.max_rounds} />
					</label>
				</div>
				<button on:click={initializeGame} class="btn btn-primary">
					{gameState.game_ready ? 'Reinitialize Game' : 'Initialize Game'}
				</button>
				<button on:click={saveGameState} class="btn btn-secondary">Save Now</button>
				<button 
					on:click={resolveRound} 
					class="btn btn-success" 
					disabled={!gameState.game_ready || gameState.round_resolved}
					title={gameState.round_resolved ? 'Round already resolved - advance to next round' : 'Process team submissions and calculate results'}
				>
					{gameState.round_resolved ? 'Round Already Resolved' : 'Resolve Round'}
				</button>
				<button 
					on:click={advanceRound} 
					class="btn btn-info" 
					disabled={!gameState.game_ready || !gameState.round_resolved}
					title={!gameState.round_resolved ? 'Must resolve current round first' : 'Move to the next round'}
				>
					Advance Round
				</button>
				<button on:click={hardReset} class="btn btn-danger">Hard Reset</button>
			</div>
		</div>

		<!-- Quick Stats -->
		<div class="card">
			<h3>Quick Stats</h3>
			<div class="stats-grid">
				<div class="stat">
					<div class="stat-label">Current Round</div>
					<div class="stat-value">{gameState.round}/{GAME_CONFIG.max_rounds}</div>
				</div>
				<div class="stat">
					<div class="stat-label">Game Status</div>
					<div class="stat-value {gameState.game_ready ? 'status-ready' : 'status-waiting'}">
						{gameState.game_ready ? 'Ready' : 'Not Started'}
					</div>
				</div>
				<div class="stat">
					<div class="stat-label">Round Status</div>
					<div class="stat-value {gameState.round_resolved ? 'status-ready' : 'status-waiting'}">
						{gameState.round_resolved ? 'Resolved' : 'Pending'}
					</div>
				</div>
				<div class="stat">
					<div class="stat-label">Submissions</div>
					<div class="stat-value {allSubmitted ? 'status-ready' : ''}">
						{submissionCount}/4
					</div>
				</div>
			</div>
		</div>

		<!-- Submission Status -->
		<div class="card">
			<h3>Submission Status</h3>
			<table>
				<thead>
					<tr>
						<th>Team</th>
						<th>Submitted</th>
						<th>Active</th>
					</tr>
				</thead>
				<tbody>
					{#each TEAMS as team}
						<tr>
							<td><strong>{team}</strong></td>
							<td>
								<span class="badge {gameState.teams[team]?.submitted ? 'badge-success' : 'badge-warning'}">
									{gameState.teams[team]?.submitted ? 'Yes' : 'No'}
								</span>
							</td>
							<td>
								<span class="badge {gameState.active_users[team] ? 'badge-info' : 'badge-secondary'}">
									{gameState.active_users[team] ? 'Online' : 'Offline'}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Allocations View -->
		<div class="card">
			<h3>Team Allocations</h3>
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th>Team</th>
							<th>SE</th>
							<th>TE</th>
							<th>IM</th>
							<th>BR</th>
							<th>AR(L)</th>
							<th>AR(M)</th>
							<th>AR(H)</th>
							<th>SP #1</th>
							<th>SP #2</th>
						</tr>
					</thead>
					<tbody>
						{#each TEAMS as team}
							{@const alloc = gameState.submissions[team]}
							<tr>
								<td><strong>{team}</strong></td>
								<td>{alloc?.SE ?? '-'}</td>
								<td>{alloc?.TE ?? '-'}</td>
								<td>{alloc?.IM ?? '-'}</td>
								<td>{alloc?.BR ?? '-'}</td>
								<td>{alloc?.AR.L ?? '-'}</td>
								<td>{alloc?.AR.M ?? '-'}</td>
								<td>{alloc?.AR.H ?? '-'}</td>
								<td>{alloc?.SP[0] ? `${alloc.SP[0].target}/${alloc.SP[0].tech}` : '-'}</td>
								<td>{alloc?.SP[1] ? `${alloc.SP[1].target}/${alloc.SP[1].tech}` : '-'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Scoreboard -->
		<div class="card">
			<h3>Full Scoreboard</h3>
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th>Team</th>
							<th>GDP</th>
							<th>W</th>
							<th>POP</th>
							<th>SE</th>
							<th>TE</th>
							<th>IM</th>
							<th>K</th>
							<th>TK</th>
							<th>BR</th>
							<th>TP(L)</th>
							<th>TP(M)</th>
							<th>TP(H)</th>
							<th>Score</th>
						</tr>
					</thead>
					<tbody>
						{#each TEAMS as team}
							{@const st = gameState.teams[team]}
							{@const tp_base = st.TP.L + 2 * st.TP.M + 3 * st.TP.H}
							{@const tk_mult = 1 + 0.2 * Math.log1p(st.TK)}
							{@const tp_score = tp_base * tk_mult}
							{@const w_score = 2 * Math.sqrt(st.W)}
							{@const total_score = tp_score + w_score}
							<tr>
								<td><strong>{team}</strong></td>
								<td>{st.GDP.toFixed(0)}</td>
								<td>{st.W}</td>
								<td>{st.POP.toFixed(1)}</td>
								<td>{st.SE}</td>
								<td>{st.TE}</td>
								<td>{st.IM}</td>
								<td>{st.K.toFixed(1)}</td>
								<td>{st.TK}</td>
								<td>{st.BR_total}</td>
								<td class={st.discovered.L ? 'discovered' : ''}>{st.TP.L}</td>
								<td class={st.discovered.M ? 'discovered' : ''}>{st.TP.M}</td>
								<td class={st.discovered.H ? 'discovered' : ''}>{st.TP.H}</td>
								<td><strong>{total_score.toFixed(1)}</strong></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Public Log -->
		<div class="card">
			<h3>Public Event Log</h3>
			<div class="log-container">
				{#each gameState.public_log.slice().reverse() as log}
					<div class="log-entry">
						<span class="log-round">R{log.round}</span>
						{log.event}
					</div>
				{:else}
					<p class="muted">No events yet</p>
				{/each}
			</div>
		</div>

		<!-- Admin Tools -->
		<div class="card">
			<h3>Admin Tools</h3>
			<div class="admin-tools">
				<button on:click={forceUnlockAll} class="btn btn-warning">
					Force Unlock All Teams
				</button>
				<div class="force-submit-group">
					<select bind:value={forceSubmitTeam}>
						<option value="">Select Team</option>
						{#each TEAMS as team}
							<option value={team}>{team}</option>
						{/each}
					</select>
					<button on:click={forceMarkSubmitted} class="btn btn-warning" disabled={!forceSubmitTeam}>
						Force Mark Submitted
					</button>
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #2d2d30;
		min-height: 100vh;
	}

	.container {
		max-width: 1600px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.debug-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: white;
		font-weight: 600;
		cursor: pointer;
		background: rgba(255, 255, 255, 0.1);
		padding: 0.5rem 1rem;
		border-radius: 6px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		transition: all 0.2s;
	}

	.debug-toggle:hover {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.5);
	}

	.debug-toggle input[type="checkbox"] {
		cursor: pointer;
		width: 18px;
		height: 18px;
	}

	.debug-panel {
		background: #fff3cd;
		border: 2px solid #ffc107;
		padding: 1rem;
		margin-bottom: 1rem;
		border-radius: 8px;
		font-family: 'Courier New', monospace;
		font-size: 0.9rem;
	}

	.debug-panel p {
		margin: 0.5rem 0;
	}

	.debug-panel strong {
		color: #856404;
	}

	h1 {
		color: white;
		margin: 0;
		font-size: 2rem;
	}

	h2, h3 {
		margin-top: 0;
		color: #e0e0e0;
	}

	.btn-logout {
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 6px;
		cursor: pointer;
		font-weight: 600;
	}

	.btn-logout:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.card {
		background: #3e3e42;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
		margin-bottom: 2rem;
	}

	.alert {
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-weight: 500;
	}

	.alert-info {
		background: #d1ecf1;
		color: #0c5460;
		border: 1px solid #bee5eb;
	}

	.control-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		align-items: end;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
		margin-top: 1rem;
	}

	.stat {
		text-align: center;
		padding: 1rem;
		background: #252526;
		border-radius: 8px;
	}

	.stat-label {
		font-size: 0.9rem;
		color: #9d9d9d;
		margin-bottom: 0.5rem;
	}

	.stat-value {
		font-size: 1.8rem;
		font-weight: bold;
		color: #8a9dff;
	}

	.stat-value.status-ready {
		color: #4ec9b0;
	}

	.stat-value.status-waiting {
		color: #dcdcaa;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 600;
		color: #cccccc;
	}

	input[type="number"] {
		width: 100%;
		padding: 0.5rem;
		border: 2px solid #555;
		border-radius: 6px;
		font-size: 1rem;
		background: #252526;
		color: #e0e0e0;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	input[type="number"]::-webkit-outer-spin-button,
	input[type="number"]::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		font-size: 0.95rem;
		font-weight: 600;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		width: 100%;
	}

	.btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary { background: #667eea; color: white; }
	.btn-secondary { background: #6c757d; color: white; }
	.btn-success { background: #28a745; color: white; }
	.btn-info { background: #17a2b8; color: white; }
	.btn-danger { background: #dc3545; color: white; }
	.btn-warning { background: #ffc107; color: #000; }
	
	.btn-large {
		font-size: 1.1rem;
		padding: 1rem 2rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 1rem;
	}

	th, td {
		padding: 0.75rem;
		text-align: left;
		border-bottom: 1px solid #555;
		color: #cccccc;
	}

	th {
		background: #252526;
		font-weight: 600;
		color: #e0e0e0;
	}

	tbody tr:hover {
		background: #252526;
	}

	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.badge-success { background: #d4edda; color: #155724; }
	.badge-warning { background: #fff3cd; color: #856404; }
	.badge-info { background: #d1ecf1; color: #0c5460; }
	.badge-secondary { background: #e2e3e5; color: #383d41; }

	.table-scroll {
		overflow-x: auto;
	}

	.discovered {
		background: #d4edda;
		font-weight: bold;
		color: #155724;
	}

	.log-container {
		max-height: 400px;
		overflow-y: auto;
		padding: 1rem;
		background: #252526;
		border-radius: 6px;
	}

	.log-entry {
		padding: 0.5rem;
		margin-bottom: 0.5rem;
		background: #3e3e42;
		border-radius: 4px;
		font-size: 0.9rem;
		color: #cccccc;
	}

	.log-round {
		display: inline-block;
		background: #667eea;
		color: white;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-weight: 600;
		margin-right: 0.5rem;
	}

	.muted {
		color: #9d9d9d;
		font-style: italic;
	}

	.admin-tools {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
	}

	.force-submit-group {
		display: flex;
		gap: 0.5rem;
		flex: 1;
		min-width: 300px;
	}

	.force-submit-group select {
		flex: 1;
		padding: 0.75rem;
		border: 2px solid #555;
		border-radius: 6px;
		font-size: 0.95rem;
		background: #252526;
		color: #e0e0e0;
	}
</style>
