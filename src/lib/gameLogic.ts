import type { Team, TeamState, TechLevel, GameState } from './types';
import { GAME_CONFIG, TEAMS } from './config';

export function normalize_metric(values: number[], exponent: number, baseline: number): number[] {
	const vals_scaled = values.map(v => Math.pow(v, exponent));
	const mean_scaled = vals_scaled.reduce((a, b) => a + b, 0) / vals_scaled.length;
	return vals_scaled.map(v => baseline * (v / mean_scaled));
}

export function compute_W_from_GDP(gdp_values: number[]): number[] {
	const normed = normalize_metric(
		gdp_values,
		GAME_CONFIG.gdp_weight_exponent,
		GAME_CONFIG.gdp_baseline
	);
	return normed.map(v => Math.ceil(v));
}

export function compute_pop_weights(pop_values: number[]): number[] {
	return normalize_metric(pop_values, GAME_CONFIG.pop_weight_exponent, 1);
}

export function compute_initial_K(SE: number, TE: number, scale: number = 1): number {
	return scale * (SE + TE);
}

export function compute_im_weights(teams_state: Record<Team, TeamState>): Record<Team, number> {
	const W = TEAMS.map(t => teams_state[t].W);
	const TE = TEAMS.map(t => teams_state[t].TE);
	const IM = TEAMS.map(t => teams_state[t].IM);
	
	const pull = W.map((w, i) => w * TE[i]);
	const avg_pull = pull.reduce((a, b) => a + b, 0) / pull.length;
	
	if (avg_pull <= 0) {
		return Object.fromEntries(TEAMS.map(t => [t, 1])) as Record<Team, number>;
	}
	
	const pull_norm = pull.map(p => p / avg_pull);
	
	const weights = pull_norm.map((p, i) => 
		IM[i] === 0 ? Math.min(1, p) : p
	);
	
	const mean_weight = weights.reduce((a, b) => a + b, 0) / weights.length;
	const stabilized = weights.map(w => w / mean_weight);
	
	return Object.fromEntries(TEAMS.map((t, i) => [t, stabilized[i]])) as Record<Team, number>;
}

export function empty_team_state(): TeamState {
	return {
		GDP: 1,
		POP: 1,
		W: 3,
		SE: 3,
		TE: 3,
		IM: 0,
		regime: 'demo',
		K: 0,
		TK: 0,
		BR_total: 0,
		BR_effective: 0,
		BR_succ: 0,
		TP: { L: 0, M: 0, H: 0 },
		TP_last_round: { L: 0, M: 0, H: 0 },
		discovered: { L: false, M: false, H: false },
		submitted: false,
		spy_revealed: {
			US: { L: false, M: false, H: false },
			China: { L: false, M: false, H: false },
			France: { L: false, M: false, H: false },
			Russia: { L: false, M: false, H: false }
		},
		spy_caught_count: {
			US: { L: 0, M: 0, H: 0 },
			China: { L: 0, M: 0, H: 0 },
			France: { L: 0, M: 0, H: 0 },
			Russia: { L: 0, M: 0, H: 0 }
		},
		rolls_saved: {
			BR: null,
			AR: { L: null, M: null, H: null },
			SP: null
		},
		dice_log: [],
		unspent_dice: 0,
		carry_fraction: 0,
		pending_W_carryover: 0,
		last_carryover: 0
	};
}

export function roll_dice(count: number): number[] {
	return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}

export function validate_budget(
	W: number,
	alloc: {
		SE: number;
		TE: number;
		BR: number;
		AR: Record<TechLevel, number>;
		SP: Array<{ target: Team | ''; tech: TechLevel } | null>;
	},
	POP: number,
	teams_state: Record<Team, TeamState>
): { ok: boolean; used: number; budget: number } {
	const budget = 2 * W;
	
	let se_cost = 0;
	if (alloc.SE > 0) {
		const pop_values = TEAMS.map(t => teams_state[t].POP);
		const mean_pop = pop_values.reduce((a, b) => a + b, 0) / pop_values.length;
		const pop_factor = POP / mean_pop;
		se_cost = Math.ceil(pop_factor);
	}
	
	const te_cost = alloc.TE > 0 ? 1 : 0;
	const br_cost = alloc.BR;
	
	const sp_cost = alloc.SP.filter(sp => sp && sp.target !== '').length;
	
	const ar_total = alloc.AR.L + alloc.AR.M + alloc.AR.H;
	let ar_cost = 0;
	if (ar_total > 0) {
		const tier1 = Math.min(2, ar_total);
		const tier2 = Math.min(2, Math.max(0, ar_total - 2));
		const tier3 = Math.max(0, ar_total - 4);
		ar_cost = 1 * tier1 + 2 * tier2 + 3 * tier3;
	}
	
	const used = se_cost + te_cost + br_cost + ar_cost + sp_cost;
	
	return { ok: used <= budget, used, budget };
}
