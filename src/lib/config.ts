import type { GameConfig, TechLevel } from './types';

// Probability scaling function
function p_from_TK(TK: number, base: number, max: number, TK_ref: number): number {
	const x = Math.min(TK / TK_ref, 1);
	return base + (max - base) * x;
}

export const GAME_CONFIG: GameConfig = {
	max_rounds: 10,
	techs: ['L', 'M', 'H'],
	gdp_weight_exponent: 0.2,
	pop_weight_exponent: 0.2,
	gdp_baseline: 4,
	
	init_by_team: {
		US: { GDP: 26000, POP: 330, SE: 2, TE: 4, IM: 1, regime: 'demo' },
		China: { GDP: 17500, POP: 1400, SE: 4, TE: 3, IM: 0, regime: 'auto' },
		France: { GDP: 3000, POP: 67, SE: 4, TE: 2, IM: 1, regime: 'demo' },
		Russia: { GDP: 2200, POP: 146, SE: 3, TE: 2, IM: 0, regime: 'auto' }
	},
	
	tp_threshold: {
		L: 10,
		M: 20,
		H: 40
	},
	
	min_requirements: {
		M: { K_min: 7 },
		H: { K_min: 12, TK_min: 20 }
	},
	
	tech_info: {
		L: {
			br_req: 0,
			ar_thr: 2,
			tp_draw: (n: number, TK: number) => {
				const p_high = 0.75;
				return Array.from({ length: n }, () => 
					Math.random() < p_high ? 2 : 1
				);
			}
		},
		M: {
			br_req: 8,
			ar_thr: 4,
			tp_draw: (n: number, TK: number) => {
				const TK_ref_M = 15;
				const base = 0.3;
				const max = 0.9;
				const p_high = p_from_TK(TK, base, max, TK_ref_M);
				return Array.from({ length: n }, () => 
					Math.random() < p_high ? 6 : 2
				);
			}
		},
		H: {
			br_req: 20,
			ar_thr: 6,
			tp_draw: (n: number, TK: number) => {
				const TK_ref_H = 40;
				const base = 0.05;
				const max = 0.7;
				const p_high = p_from_TK(TK, base, max, TK_ref_H);
				return Array.from({ length: n }, () => 
					Math.random() < p_high ? 36 : 1
				);
			}
		}
	}
};

export const TEAMS: Array<'US' | 'China' | 'France' | 'Russia'> = ['US', 'China', 'France', 'Russia'];

// WARNING: These are default passwords for testing only.
// Change these before allowing others to access your deployment!
export const TEAM_PASSWORDS: Record<string, string> = {
	US: 'password',
	China: 'password',
	France: 'password',
	Russia: 'password',
	GM: 'admin123'
};
