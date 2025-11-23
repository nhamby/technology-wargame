<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import type { GameState, Team, TeamState, TeamAllocation, TechLevel } from '$lib/types';
	import { GAME_CONFIG, TEAMS } from '$lib/config';
	import { validate_budget, roll_dice } from '$lib/gameLogic';

	let currentTeam: Team | null = null;
	let gameState: GameState | null = null;
	let loading = true;
	let statusMessage = '';

	// Allocation form state
	let allocSE = false;
	let allocTE = false;
	let allocIM: 'none' | 'open' | 'close' = 'none';
	let allocBR = 0;
	let allocAR = { L: 0, M: 0, H: 0 };
	let allocSP = [
		{ target: '' as Team | '', tech: 'L' as TechLevel },
		{ target: '' as Team | '', tech: 'L' as TechLevel }
	];

	let budgetInfo = { used: 0, budget: 0, remaining: 0 };
	let budgetColor = '#d9ffd9';
	let canSubmit = false;
	let lastKnownRound = 0;
	let pollInterval: ReturnType<typeof setInterval>;

	// Reactive statement to recalculate budget when gameState or allocations change
	$: if (gameState && currentTeam) {
		calculateBudget();
	}

	onMount(async () => {
		const role = sessionStorage.getItem('wargame_role');
		const auth = sessionStorage.getItem('wargame_auth');
		
		if (!role || auth !== 'true' || role === 'GM') {
			goto('/');
			return;
		}
		
		currentTeam = role as Team;
		await loadGameState();

		// Mark this team as active
		if (gameState && currentTeam) {
			gameState.active_users[currentTeam] = true;
			await saveGameState();
		}

		// Set initial round for change detection
		if (gameState) {
			lastKnownRound = gameState.round;
		}

		// Subscribe to real-time updates
		supabase
			.channel('team-updates')
			.on('postgres_changes', 
				{ event: '*', schema: 'public', table: 'game_state' },
				(payload: any) => {
					console.log('Real-time update received:', payload);
					if (payload.new && 'data' in payload.new) {
						gameState = payload.new.data as GameState;
						console.log('Game state updated from real-time:', gameState);
						
						// Check if round changed
						if (gameState.round !== lastKnownRound) {
							lastKnownRound = gameState.round;
							statusMessage = `Round advanced to ${gameState.round}`;
						}
					}
				}
			)
			.subscribe((status) => {
				console.log('Subscription status:', status);
			});

		// Polling fallback: Check for updates every 0.3 seconds
		pollInterval = setInterval(async () => {
			if (!document.hidden) {
				await checkForUpdates();
			}
		}, 300);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
		
		// Mark this team as inactive when leaving
		if (gameState && currentTeam) {
			gameState.active_users[currentTeam] = false;
			saveGameState();
		}
	});

	async function checkForUpdates() {
		const { data, error } = await supabase
			.from('game_state')
			.select('data')
			.single();
		
		if (!error && data) {
			const newState = (data as any).data as GameState;
			
			// Only update if something actually changed
			if (JSON.stringify(newState) !== JSON.stringify(gameState)) {
				console.log('Polling detected changes, updating state');
				
				// Check if round changed
				if (newState.round !== lastKnownRound) {
					lastKnownRound = newState.round;
					statusMessage = `Round advanced to ${newState.round}`;
				}
				
				gameState = newState;
			}
		}
	}

	async function loadGameState() {
		loading = true;
		try {
			const { data, error } = await supabase
				.from('game_state')
				.select('data')
				.limit(1)
				.maybeSingle();
			
			if (error) {
				console.error('Error loading game state:', error);
				statusMessage = 'Error loading game state: ' + error.message;
			} else if (data) {
				gameState = (data as any).data as GameState;
			} else {
				statusMessage = 'No game state found';
			}
		} catch (err) {
			console.error('Exception loading game state:', err);
			statusMessage = 'Error: ' + (err instanceof Error ? err.message : String(err));
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
			console.error('Error saving:', error);
		}
	}

	function calculateBudget() {
		if (!currentTeam || !gameState) return;
		
		const teamState = gameState.teams[currentTeam];
		const W = teamState.W;
		const budget = 2 * W;
		
		const pop_values = TEAMS.map(t => gameState!.teams[t].POP);
		const mean_pop = pop_values.reduce((a, b) => a + b, 0) / pop_values.length;
		const pop_factor = teamState.POP / mean_pop;
		
		const se_cost = allocSE ? Math.ceil(pop_factor) : 0;
		const te_cost = allocTE ? 1 : 0;
		const br_cost = allocBR;
		
		const sp_cost = allocSP.filter(sp => sp.target !== '').length;
		
		const ar_total = allocAR.L + allocAR.M + allocAR.H;
		let ar_cost = 0;
		if (ar_total > 0) {
			const tier1 = Math.min(2, ar_total);
			const tier2 = Math.min(2, Math.max(0, ar_total - 2));
			const tier3 = Math.max(0, ar_total - 4);
			ar_cost = 1 * tier1 + 2 * tier2 + 3 * tier3;
		}
		
		const used = se_cost + te_cost + br_cost + ar_cost + sp_cost;
		const remaining = budget - used;
		
		budgetInfo = { used, budget, remaining };
		
		if (remaining < 0) {
			budgetColor = '#ffcccc';
			canSubmit = false;
		} else if (remaining <= budget * 0.25) {
			budgetColor = '#fff8cc';
			canSubmit = true;
		} else {
			budgetColor = '#d9ffd9';
			canSubmit = true;
		}
	}

	async function submitAllocations() {
		if (!currentTeam || !gameState) return;
		
		const teamState = gameState.teams[currentTeam];
		
		if (teamState.submitted) {
			statusMessage = 'Already submitted for this round';
			return;
		}

		// Check AR caps
		const ar_caps = { L: 3, M: 2, H: 1 };
		for (const tech of ['L', 'M', 'H'] as TechLevel[]) {
			if (allocAR[tech] > ar_caps[tech]) {
				statusMessage = `AR(${tech}) limited to ${ar_caps[tech]} dice per round`;
				return;
			}
		}

		// Check discovered techs
		for (const tech of ['L', 'M', 'H'] as TechLevel[]) {
			if (teamState.discovered[tech] && allocAR[tech] > 0) {
				statusMessage = `You've already discovered ${tech} tech`;
				return;
			}
		}

		// Check BR requirements
		const effBR = teamState.BR_effective;
		if (allocAR.M > 0 && effBR < GAME_CONFIG.tech_info.M.br_req) {
			statusMessage = `M-level tech requires ${GAME_CONFIG.tech_info.M.br_req} BR (you have ${effBR.toFixed(1)})`;
			return;
		}
		if (allocAR.H > 0 && effBR < GAME_CONFIG.tech_info.H.br_req) {
			statusMessage = `H-level tech requires ${GAME_CONFIG.tech_info.H.br_req} BR (you have ${effBR.toFixed(1)})`;
			return;
		}

		// Validate budget
		const validation = validate_budget(
			teamState.W,
			{
				SE: allocSE ? 1 : 0,
				TE: allocTE ? 1 : 0,
				BR: allocBR,
				AR: allocAR,
				SP: allocSP
			},
			teamState.POP,
			gameState.teams
		);

		if (!validation.ok) {
			statusMessage = `Budget exceeded: ${validation.used}/${validation.budget} dice`;
			return;
		}

		// Roll dice for preview
		const dice_log = [];
		
		// BR rolls
		if (allocBR > 0) {
			const rolls = roll_dice(allocBR);
			const succ = rolls.filter(r => r >= 4).length;
			dice_log.push({
				Phase: 'BR',
				Tech: '-',
				Rolls: rolls.join(', '),
				ΔTK: `+${succ}`,
				ΔTP: '—',
				ΔIM: '—',
				SP_Result: '—'
			});
		}

		// AR rolls
		for (const tech of ['L', 'M', 'H'] as TechLevel[]) {
			if (allocAR[tech] > 0) {
				const rolls = roll_dice(allocAR[tech]);
				const thr = GAME_CONFIG.tech_info[tech].ar_thr;
				const succ = rolls.filter(r => r >= thr).length;
				const tp_gains = GAME_CONFIG.tech_info[tech].tp_draw(succ, teamState.TK);
				const tp_total = tp_gains.reduce((a, b) => a + b, 0);
				
				dice_log.push({
					Phase: 'AR',
					Tech: tech,
					Rolls: rolls.join(', '),
					ΔTK: `+${allocAR[tech]}`,
					ΔTP: `+${tp_total}`,
					ΔIM: '—',
					SP_Result: '—'
				});
			}
		}

		// IM change
		if (allocIM === 'open' && teamState.IM === 0) {
			dice_log.push({
				Phase: 'Policy',
				Tech: '-',
				Rolls: '—',
				ΔTK: '—',
				ΔTP: '—',
				ΔIM: 'Opened',
				SP_Result: '—'
			});
		} else if (allocIM === 'close' && teamState.IM === 1) {
			dice_log.push({
				Phase: 'Policy',
				Tech: '-',
				Rolls: '—',
				ΔTK: '—',
				ΔTP: '—',
				ΔIM: 'Closed',
				SP_Result: '—'
			});
		}

		// SP rolls
		for (const sp of allocSP) {
			if (sp.target !== '') {
				const target_state = gameState.teams[sp.target];
				const roll = Math.floor(Math.random() * 6) + 1;
				let eff_roll = roll;
				
				if (target_state.IM === 1) eff_roll = Math.min(6, roll + 1);
				else eff_roll = Math.max(1, roll - 1);
				
				const caught_thr = sp.tech === 'L' ? 1 : sp.tech === 'M' ? 2 : 3;
				const fail_range = sp.tech === 'L' ? [2, 3] : sp.tech === 'M' ? [3, 4] : [4];
				
				let result = 'Failed';
				if (eff_roll <= caught_thr) result = 'Caught';
				else if (fail_range.includes(eff_roll)) result = 'Failed';
				else if (eff_roll === 5) result = 'Observe';
				else if (eff_roll === 6) result = 'Observe+Copy';
				
				dice_log.push({
					Phase: 'SP',
					Tech: sp.tech,
					Rolls: `${roll} → ${eff_roll}`,
					ΔTK: '—',
					ΔTP: '—',
					ΔIM: '—',
					SP_Result: result
				});
			}
		}

		// Carryover calculation
		const leftover = validation.budget - validation.used;
		const carry_gain = (2/3) * leftover;
		const new_carry = teamState.carry_fraction + carry_gain;
		const carry_whole = Math.floor(new_carry);
		const carry_remain = new_carry - carry_whole;

		dice_log.push({
			Phase: 'Carryover',
			Tech: '-',
			Rolls: `${leftover} unused`,
			ΔTK: '—',
			ΔTP: '—',
			ΔIM: '—',
			SP_Result: `+${carry_whole} W next round | remainder ${carry_remain.toFixed(2)}`
		});

		// Update game state
		teamState.submitted = true;
		teamState.dice_log = dice_log;
		teamState.unspent_dice = leftover;
		teamState.carry_fraction = carry_remain;
		teamState.pending_W_carryover = carry_whole;

		gameState.submissions[currentTeam] = {
			SE: allocSE ? 1 : 0,
			TE: allocTE ? 1 : 0,
			IM: allocIM,
			BR: allocBR,
			AR: allocAR,
			SP: allocSP.map(sp => sp.target ? sp : null)
		};

		await saveGameState();
		statusMessage = 'Allocations submitted! Dice rolled.';
	}

	function logout() {
		sessionStorage.clear();
		goto('/');
	}

	// Reactive budget calculation
	$: if (currentTeam && gameState) {
		calculateBudget();
	}

	$: teamState = currentTeam && gameState ? gameState.teams[currentTeam] : null;
	$: otherTeams = currentTeam ? TEAMS.filter(t => t !== currentTeam) : [];
	$: canAccessM = teamState && teamState.BR_effective >= GAME_CONFIG.tech_info.M.br_req;
	$: canAccessH = teamState && teamState.BR_effective >= GAME_CONFIG.tech_info.H.br_req;
</script>

<svelte:head>
	<title>Team Interface - {currentTeam}</title>
</svelte:head>

<main class="container">
	<div class="header">
		<h1>Team: {currentTeam}</h1>
		<button on:click={logout} class="btn-logout">Logout</button>
	</div>

	{#if loading}
		<div class="card">
			<p>Loading game state...</p>
		</div>
	{:else if !gameState?.game_ready}
		<div class="card">
			<h2 style="color:red;">⏳ Waiting for GM to initialize the game...</h2>
			<p>The Game Master must initialize the game before you can play.</p>
		</div>
	{:else if teamState}
		{#if statusMessage}
			<div class="alert {statusMessage.includes('Error') || statusMessage.includes('Warning') ? 'alert-warning' : 'alert-success'}">
				{statusMessage}
			</div>
		{/if}

		<!-- Status Header -->
		<div class="card status-header">
			<div class="status-grid">
				<div>
					<strong>Round:</strong> {gameState.round}/{GAME_CONFIG.max_rounds}
				</div>
				<div>
					<strong>Budget (W):</strong> {teamState.W} | <strong>Dice:</strong> {2 * teamState.W} | <strong>Immigration:</strong> {teamState.IM === 1 ? 'Open' : 'Closed'}
				</div>
				<div>
					<strong>Talent (K):</strong> {teamState.K.toFixed(1)} | <strong>Knowledge (TK):</strong> {teamState.TK}
				</div>
				<div>
					<strong>Score (TP) L/M/H:</strong> {teamState.TP.L}/{teamState.TP.M}/{teamState.TP.H}
				</div>
			</div>
			{#if teamState.submitted}
				<div class="submitted-banner">Submitted for this round - waiting for GM</div>
			{/if}
		</div>

		<!-- Budget Display -->
		<div class="budget-box" style="background: {budgetColor};">
			Dice: {budgetInfo.budget} &nbsp;|&nbsp; Spent: {budgetInfo.used} &nbsp;|&nbsp; Remaining: <strong>{budgetInfo.remaining}</strong>
		</div>
		{#if budgetInfo.remaining < 0}
			<div class="alert alert-warning">
				You are over budget! Please reduce allocations.
			</div>
		{/if}

		<!-- Allocation Form -->
		<div class="card">
			<h2>Submit Allocations for Round {gameState.round}</h2>
			
			<div class="allocation-grid">
				<!-- Education Column -->
				<div class="allocation-section">
					<h3>Education (SE/TE)</h3>
					<p class="help-text">Two ways to build K (talent)</p>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={allocSE} disabled={teamState.submitted} />
						Secondary Education (+1 K)
					</label>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={allocTE} disabled={teamState.submitted} />
						Tertiary Education (+1 K × (1+IM))
					</label>
					
					<h4 style="margin-top: 1.5rem;">Immigration Policy</h4>
					<div class="radio-group">
						<label>
							<input type="radio" bind:group={allocIM} value="none" disabled={teamState.submitted} />
							No change
						</label>
						<label>
							<input type="radio" bind:group={allocIM} value="open" disabled={teamState.submitted} />
							Open (→1)
						</label>
						<label>
							<input type="radio" bind:group={allocIM} value="close" disabled={teamState.submitted} />
							Closed (→0)
						</label>
					</div>
				</div>

				<!-- Basic Research Column -->
				<div class="allocation-section">
					<h3>Basic Research (BR - Public)</h3>
					<p class="help-text">BR builds TK but is shared with others</p>
					<label>
						BR investment:
						<input 
							type="number" 
							bind:value={allocBR} 
							min="0" 
							max={2 * teamState.W}
							disabled={teamState.submitted}
							class="number-input"
						/>
					</label>
				</div>

				<!-- Applied Research Column -->
				<div class="allocation-section">
					<h3>Applied Research (AR - Secret)</h3>
					<p class="help-text">Probabilistic discovery. Value scales with K</p>
					<label>
						AR (Incremental):
						<input 
							type="number" 
							bind:value={allocAR.L} 
							min="0" 
							max="3"
							disabled={teamState.submitted || teamState.discovered.L}
							class="number-input"
						/>
					</label>
					<label>
						AR (Advanced):
						<input 
							type="number" 
							bind:value={allocAR.M} 
							min="0" 
							max="2"
							disabled={teamState.submitted || !canAccessM || teamState.discovered.M}
							class="number-input"
							class:disabled={!canAccessM}
						/>
						{#if !canAccessM}
							<span class="req-text">Requires {GAME_CONFIG.tech_info.M.br_req} BR</span>
						{/if}
					</label>
					<label>
						AR (Radical):
						<input 
							type="number" 
							bind:value={allocAR.H} 
							min="0" 
							max="1"
							disabled={teamState.submitted || !canAccessH || teamState.discovered.H}
							class="number-input"
							class:disabled={!canAccessH}
						/>
						{#if !canAccessH}
							<span class="req-text">Requires {GAME_CONFIG.tech_info.H.br_req} BR</span>
						{/if}
					</label>
				</div>

				<!-- Espionage Column -->
				<div class="allocation-section">
					<h3>Espionage Effort (SP)</h3>
					<p class="help-text">Max two targets per round</p>
					<label>
						Target #1:
						<select bind:value={allocSP[0].target} disabled={teamState.submitted} class="select-input">
							<option value="">—</option>
							{#each otherTeams as team}
								<option value={team}>{team}</option>
							{/each}
						</select>
					</label>
					<label>
						Tech area #1:
						<select bind:value={allocSP[0].tech} disabled={teamState.submitted} class="select-input">
							<option value="L">L</option>
							<option value="M">M</option>
							<option value="H">H</option>
						</select>
					</label>
					
					<label style="margin-top: 1rem;">
						Target #2:
						<select bind:value={allocSP[1].target} disabled={teamState.submitted} class="select-input">
							<option value="">—</option>
							{#each otherTeams as team}
								<option value={team}>{team}</option>
							{/each}
						</select>
					</label>
					<label>
						Tech area #2:
						<select bind:value={allocSP[1].tech} disabled={teamState.submitted} class="select-input">
							<option value="L">L</option>
							<option value="M">M</option>
							<option value="H">H</option>
						</select>
					</label>
				</div>
			</div>

			<button 
				on:click={submitAllocations} 
				class="btn btn-primary btn-large"
				disabled={!canSubmit || teamState.submitted}
			>
				{teamState.submitted ? 'Already Submitted' : 'Submit Allocations'}
			</button>
		</div>

		<!-- Dice Roll Results -->
		<div class="card">
			<h3>Your Dice Rolls This Round</h3>
			{#if teamState.dice_log && teamState.dice_log.length > 0}
				<div class="table-scroll">
					<table>
						<thead>
							<tr>
								<th>Phase</th>
								<th>Tech</th>
								<th>Rolls</th>
								<th>ΔTK</th>
								<th>ΔTP</th>
								<th>ΔIM</th>
								<th>SP Result</th>
							</tr>
						</thead>
						<tbody>
							{#each teamState.dice_log as log}
								<tr>
									<td>{log.Phase}</td>
									<td>{log.Tech}</td>
									<td>{log.Rolls}</td>
									<td>{log.ΔTK}</td>
									<td>{log.ΔTP}</td>
									<td>{log.ΔIM}</td>
									<td>{log.SP_Result}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="muted">No dice rolls yet for this round</p>
			{/if}
		</div>

		<!-- Private Log -->
		<div class="card">
			<h3>Your Private AR & SP Log</h3>
			<div class="log-container">
				{#if currentTeam}
					{#each gameState.private_logs[currentTeam].slice().reverse() as log}
						<div class="log-entry">
							<span class="log-round">R{log.round}</span>
							{log.event}
						</div>
					{:else}
						<p class="muted">No private events yet</p>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Public Event Log -->
		<div class="card">
			<h3>Public Event Log (BR & Caught Spies)</h3>
			<div class="log-container">
				{#each gameState.public_log.slice().reverse().slice(0, 20) as log}
					<div class="log-entry">
						<span class="log-round">R{log.round}</span>
						{log.event}
					</div>
				{:else}
					<p class="muted">No public events yet</p>
				{/each}
			</div>
		</div>

		<!-- Public Status Overview -->
		<div class="card">
			<h3>Public Status Overview</h3>
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
							<th>BR (Own)</th>
							<th>BR (Global)</th>
							<th>TP(L)</th>
							<th>TP(M)</th>
							<th>TP(H)</th>
						</tr>
					</thead>
					<tbody>
						{#each TEAMS as team}
							{@const st = gameState.teams[team]}
							{@const canSeeL = team === currentTeam || teamState.spy_revealed[team]?.L}
							{@const canSeeM = team === currentTeam || teamState.spy_revealed[team]?.M}
							{@const canSeeH = team === currentTeam || teamState.spy_revealed[team]?.H}
							<tr class:current-team={team === currentTeam}>
								<td><strong>{team}</strong></td>
								<td>{st.GDP.toFixed(0)}</td>
								<td>{st.W}</td>
								<td>{st.POP.toFixed(1)}</td>
								<td>{st.SE}</td>
								<td>{st.TE}</td>
								<td>{st.IM}</td>
								<td>{st.K.toFixed(1)}</td>
								<td>{team === currentTeam ? st.TK : '?'}</td>
								<td>{st.BR_total.toFixed(0)}</td>
								<td>{st.BR_effective.toFixed(1)}</td>
								<td>{canSeeL ? st.TP.L : '?'}</td>
								<td>{canSeeM ? st.TP.M : '?'}</td>
								<td>{canSeeH ? st.TP.H : '?'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
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
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
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

	h4 {
		color: #cccccc;
		margin-top: 0;
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

	.alert-success {
		background: #d4edda;
		color: #155724;
		border: 1px solid #c3e6cb;
	}

	.alert-warning {
		background: #fff3cd;
		color: #856404;
		border: 1px solid #ffeaa7;
	}

	.status-header {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.status-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1rem;
		font-size: 0.95rem;
	}

	.submitted-banner {
		margin-top: 1rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		text-align: center;
		font-weight: bold;
		font-size: 1.1rem;
	}

	.budget-box {
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		text-align: center;
		font-weight: 600;
		font-size: 1.1rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.allocation-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 2rem;
		margin-bottom: 2rem;
	}

	.allocation-section {
		padding: 1.5rem;
		background: #252526;
		border-radius: 8px;
	}

	.allocation-section h3 {
		margin-top: 0;
		color: #8a9dff;
		font-size: 1.1rem;
	}

	.help-text {
		color: #9d9d9d;
		font-size: 0.85rem;
		margin-bottom: 1rem;
		font-style: italic;
	}

	label {
		display: block;
		margin-bottom: 0.75rem;
		font-weight: 500;
		color: #cccccc;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.checkbox-label input {
		cursor: pointer;
	}

	.radio-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.radio-group label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.number-input, .select-input {
		width: 100%;
		padding: 0.5rem;
		margin-top: 0.25rem;
		border: 2px solid #555;
		border-radius: 6px;
		font-size: 1rem;
		background: #252526;
		color: #e0e0e0;
	}

	.number-input:focus, .select-input:focus {
		outline: none;
		border-color: #667eea;
	}

	.number-input:disabled, .select-input:disabled {
		background: #1e1e1e;
		cursor: not-allowed;
		opacity: 0.5;
	}

	.number-input.disabled {
		background: #3e2323;
		border-color: #dc3545;
	}

	.req-text {
		display: block;
		font-size: 0.8rem;
		color: #f48771;
		margin-top: 0.25rem;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.btn-large {
		width: 100%;
		padding: 1rem;
		font-size: 1.1rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
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
		font-size: 0.9rem;
	}

	tbody tr:hover {
		background: #252526;
	}

	.current-team {
		background: #1e3a5f;
		font-weight: 600;
	}

	.table-scroll {
		overflow-x: auto;
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
</style>
