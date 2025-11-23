import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Environment-based configuration:
// - Production (Vercel): Uses environment variables set in Vercel dashboard
// - Local with Cloud: Uses .env or .env.local file
// - Local with Supabase CLI: Falls back to local defaults
const supabaseUrl = PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

if (!supabaseUrl || !supabaseKey) {
	console.error('❌ Supabase configuration missing! Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
	realtime: {
		params: {
			eventsPerSecond: 10
		}
	},
	auth: {
		persistSession: false
	}
});

// Log connection info in development
if (typeof window !== 'undefined') {
	console.log('🔗 Supabase client initialized:', {
		url: supabaseUrl,
		hasKey: !!supabaseKey,
		isLocal: supabaseUrl.includes('localhost')
	});
}
