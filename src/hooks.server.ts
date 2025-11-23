import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	try {
		return await resolve(event);
	} catch (error) {
		console.error('Server error:', error);
		return new Response(JSON.stringify({ 
			error: 'Internal server error',
			message: error instanceof Error ? error.message : String(error)
		}), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		});
	}
};
