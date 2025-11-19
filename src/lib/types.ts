// Core game types
export type Team = 'US' | 'China' | 'France' | 'Russia';
export type Role = Team | 'GM';
export type TechLevel = 'L' | 'M' | 'H';
export type Regime = 'demo' | 'auto';

export interface TeamState {
	// Economic & Population
	GDP: number;
	POP: number;
	W: number; // Budget weight
	
	// Education & Research
	SE: number; // Secondary education
	TE: number; // Tertiary education
	IM: number; // Immigration (0 = closed, 1 = open)
	regime: Regime;
	
	// Knowledge & Capability
	K: number; // Talent/Knowledge base
	TK: number; // Technical knowledge
	
	// Basic Research
	BR_total: number; // Total BR successes
	BR_effective: number; // Own + 75% of others'
	BR_succ: number; // Successes this round
	
	// Technology Points
	TP: Record<TechLevel, number>;
	TP_last_round: Record<TechLevel, number>;
	discovered: Record<TechLevel, boolean>;
	
	// Submission status
	submitted: boolean;
	
	// Espionage tracking
	spy_revealed: Record<Team, Record<TechLevel, boolean>>;
	spy_caught_count: Record<Team, Record<TechLevel, number>>;
	
	// Dice rolls
	rolls_saved: {
		BR: number[] | null;
		AR: Record<TechLevel, number[] | null>;
		SP: Array<{
			raw_roll: number;
			target: Team;
			tech: TechLevel;
		}> | null;
	};
	
	// Logging
	dice_log: DiceLogEntry[];
	
	// Carryover system
	unspent_dice: number;
	carry_fraction: number;
	pending_W_carryover: number;
	last_carryover: number;
}

export interface DiceLogEntry {
	Phase: string;
	Tech: string;
	Rolls: string;
	ΔTK: string;
	ΔTP: string;
	ΔIM: string;
	SP_Result: string;
}

export interface TeamAllocation {
	SE: number; // 0 or 1
	TE: number; // 0 or 1
	IM: 'none' | 'open' | 'close';
	BR: number;
	AR: Record<TechLevel, number>;
	SP: Array<{
		target: Team | '';
		tech: TechLevel;
	} | null>;
}

export interface GameState {
	round: number;
	teams: Record<Team, TeamState>;
	submissions: Record<Team, TeamAllocation | null>;
	global_BR_pool: Record<TechLevel, number>;
	public_log: LogEntry[];
	private_logs: Record<Team, LogEntry[]>;
	active_users: Record<Team, boolean>;
	game_ready: boolean;
	history: RoundHistory[];
	round_resolved: boolean; // Track if current round has been resolved
}

export interface LogEntry {
	round: number;
	event: string;
}

export interface RoundHistory {
	round: number;
	allocations: Record<Team, TeamAllocation | null>;
	before: Record<Team, TeamState>;
	after: Record<Team, TeamState>;
	rolls: Record<Team, TeamState['rolls_saved']>;
	public_log: LogEntry[];
	private_logs: Record<Team, LogEntry[]>;
}

export interface GameConfig {
	max_rounds: number;
	techs: TechLevel[];
	gdp_weight_exponent: number;
	pop_weight_exponent: number;
	gdp_baseline: number;
	
	init_by_team: Record<Team, {
		GDP: number;
		POP: number;
		SE: number;
		TE: number;
		IM: number;
		regime: Regime;
	}>;
	
	tp_threshold: Record<TechLevel, number>;
	
	min_requirements: {
		M: { K_min: number };
		H: { K_min: number; TK_min: number };
	};
	
	tech_info: Record<TechLevel, {
		br_req: number;
		ar_thr: number;
		tp_draw: (n: number, TK: number) => number[];
	}>;
}
