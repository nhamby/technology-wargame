<script lang="ts">
	// Underscore prefix indicates intentionally unused prop provided by SvelteKit
	export let data: any = undefined;
	$: _ = data; // Suppress unused variable warning
</script>

<slot />

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #2d2d30;
		min-height: 100vh;
	}
</style>
