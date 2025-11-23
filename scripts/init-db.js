#!/usr/bin/env node

/**
 * Database Initialization Script
 * 
 * This script initializes your Supabase database with the initial game state.
 * Run this after creating the game_state table in Supabase.
 * 
 * Usage: node scripts/init-db.js
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	console.error('❌ Error: Missing Supabase credentials!');
	console.error('Please ensure PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are set in your .env file');
	process.exit(1);
}

console.log('🔗 Connecting to Supabase...');
console.log('   URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

const initialGameState = {
	round: 1,
	game_ready: false,
	teams: {},
	submissions: {},
	global_BR_pool: {
		L: 0,
		M: 0,
		H: 0
	},
	public_log: [],
	private_logs: {},
	active_users: {
		US: false,
		China: false,
		France: false,
		Russia: false
	},
	history: []
};

async function initializeDatabase() {
	try {
		// Check if data already exists
		console.log('📋 Checking for existing game state...');
		const { data: existingData, error: checkError } = await supabase
			.from('game_state')
			.select('id')
			.limit(1);

		if (checkError && checkError.code !== 'PGRST116') {
			throw checkError;
		}

		if (existingData && existingData.length > 0) {
			console.log('⚠️  Game state already exists in database');
			console.log('   Found', existingData.length, 'record(s)');
			
			const readline = await import('readline');
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});

			const answer = await new Promise(resolve => {
				rl.question('\n   Do you want to reset it? (yes/no): ', resolve);
			});
			rl.close();

			if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
				console.log('❌ Initialization cancelled');
				process.exit(0);
			}

			console.log('🗑️  Deleting existing data...');
			const { error: deleteError } = await supabase
				.from('game_state')
				.delete()
				.neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

			if (deleteError) {
				throw deleteError;
			}
		}

		// Insert initial game state
		console.log('📝 Inserting initial game state...');
		const { data, error } = await supabase
			.from('game_state')
			.insert([{ data: initialGameState }])
			.select();

		if (error) {
			throw error;
		}

		console.log('✅ Database initialized successfully!');
		console.log('   Record ID:', data[0].id);
		console.log('\n🎮 You can now start your local development server:');
		console.log('   npm run dev');
		console.log('   or');
		console.log('   ./start-local.sh');
		
	} catch (error) {
		console.error('❌ Error initializing database:', error.message);
		console.error('\nTroubleshooting:');
		console.error('1. Ensure the game_state table exists in Supabase');
		console.error('2. Check that your .env file has correct credentials');
		console.error('3. Verify RLS policies allow INSERT operations');
		console.error('\nTo create the table, run this SQL in Supabase SQL Editor:');
		console.error(`
CREATE TABLE IF NOT EXISTS game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" 
  ON game_state 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
`);
		process.exit(1);
	}
}

initializeDatabase();
