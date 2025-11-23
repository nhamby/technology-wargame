<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import type { Role } from '$lib/types';
	import { TEAM_PASSWORDS } from '$lib/config';
	import { goto } from '$app/navigation';

	// Prop provided by SvelteKit (intentionally unused)
	export let data: any = undefined;
	$: _ = data; // Suppress unused variable warning

	let selectedRole: Role | '' = '';
	let password = '';
	let error = '';

	const currentRole = writable<Role | null>(null);

	function handleLogin() {
		error = '';
		
		if (!selectedRole || !password) {
			error = 'Please select a role and enter a password';
			return;
		}

		if (TEAM_PASSWORDS[selectedRole] !== password) {
			error = 'Invalid credentials';
			return;
		}

		// Store in session storage
		sessionStorage.setItem('wargame_role', selectedRole);
		sessionStorage.setItem('wargame_auth', 'true');
		
		// Navigate to the appropriate page
		if (selectedRole === 'GM') {
			goto('/gm');
		} else {
			goto('/team');
		}
	}

	onMount(() => {
		// Check if already logged in
		const role = sessionStorage.getItem('wargame_role');
		const auth = sessionStorage.getItem('wargame_auth');
		
		if (role && auth === 'true') {
			if (role === 'GM') {
				goto('/gm');
			} else {
				goto('/team');
			}
		}
	});
</script>

<svelte:head>
	<title>Global Research Wargame</title>
</svelte:head>

<main class="container">
	<h1>Global Research Wargame</h1>
	<p class="subtitle">A strategic simulation of international technology competition</p>

	<div class="login-card">
		<h2>Login</h2>
		
		<div class="form-group">
			<label for="role">Select Role:</label>
			<select id="role" bind:value={selectedRole} class="form-control">
				<option value="">-- Choose Role --</option>
				<option value="GM">Game Master</option>
				<option value="US">United States</option>
				<option value="China">China</option>
				<option value="France">France</option>
				<option value="Russia">Russia</option>
			</select>
		</div>

		<div class="form-group">
			<label for="password">Password:</label>
			<input
				id="password"
				type="password"
				bind:value={password}
				class="form-control"
				on:keypress={(e) => e.key === 'Enter' && handleLogin()}
			/>
		</div>

		{#if error}
			<div class="alert alert-error">{error}</div>
		{/if}

		<button on:click={handleLogin} class="btn btn-primary">
			Log In
		</button>
	</div>

	<div class="info-section">
		<h3>About the Game</h3>
		<p>
			This is a multi-player wargame simulating international competition in technology development.
			Four countries compete across 10 rounds, investing in education, research, and espionage
			while a Game Master oversees the proceedings.
		</p>
		<ul>
			<li><strong>Basic Research (BR):</strong> Public knowledge building</li>
			<li><strong>Applied Research (AR):</strong> Secret technology development (L/M/H levels)</li>
			<li><strong>Espionage (SP):</strong> Gather intelligence on rivals</li>
			<li><strong>Education:</strong> Build your talent base (K)</li>
		</ul>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
		background: #2d2d30;
		min-height: 100vh;
	}

	.container {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	h1 {
		color: white;
		text-align: center;
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}

	.subtitle {
		text-align: center;
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 2rem;
	}

	.login-card {
		background: #3e3e42;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
		margin-bottom: 2rem;
	}

	h2 {
		margin-top: 0;
		color: #e0e0e0;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 600;
		color: #cccccc;
	}

	.form-control {
		width: 100%;
		padding: 0.75rem;
		border: 2px solid #555;
		border-radius: 6px;
		font-size: 1rem;
		box-sizing: border-box;
		background: #252526;
		color: #e0e0e0;
	}

	.form-control:focus {
		outline: none;
		border-color: #667eea;
	}

	.btn {
		padding: 0.75rem 2rem;
		font-size: 1rem;
		font-weight: 600;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		width: 100%;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.btn-primary:hover {
		opacity: 0.9;
	}

	.alert {
		padding: 0.75rem;
		border-radius: 6px;
		margin-bottom: 1rem;
	}

	.alert-error {
		background: #fee;
		color: #c33;
		border: 1px solid #fcc;
	}

	.info-section {
		background: #3e3e42;
		border-radius: 12px;
		padding: 1.5rem;
		color: #cccccc;
	}

	.info-section h3 {
		margin-top: 0;
		color: #8a9dff;
	}

	.info-section ul {
		line-height: 1.8;
	}
</style>
