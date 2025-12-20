

export interface MatchInfo {
  id: string;
  league: { name: string };
  home: { name: string; image_id?: string };
  away: { name: string; image_id?: string };
  ss: string; // Score string "1-0"
  time: string; // "45"
  timer?: { tm: number; ts: number; tt: string; ta: number; md: number };
  stats?: Record<string, string[]>; // "attacks": ["10", "5"]
}

export interface ProcessedStats {
  attacks: [number, number];
  dangerous_attacks: [number, number];
  on_target: [number, number];
  off_target: [number, number];
  corners: [number, number];
  yellowcards: [number, number];
  redcards: [number, number];
}

export interface OddsItem {
  id: string;
  home_od?: string;
  draw_od?: string;
  away_od?: string;
  over_od?: string;
  under_od?: string;
  handicap?: string;
  time_str: string;
  add_time: string;
}

export interface OddsData {
  results: {
    odds: {
      "1_2": OddsItem[]; // Match Winner / Handicap
      "1_3": OddsItem[]; // Over/Under
    };
  };
}

export interface ChartPoint {
  time: number;
  value: number;
  type?: 'home' | 'away' | 'over' | 'under';
  handicap?: number;
}

export interface PreGoalAnalysis {
  score: number;
  // Fix: Update level type to match AI's Vietnamese output
  level: 'thấp' | 'trung bình' | 'cao' | 'rất cao';
  factors: {
    apiMomentum: number;
    shotCluster: number;
    pressure: number;
  };
  reasoning?: string; // Added for AI explanation
}

// New interface for AI prediction response
export interface AIPredictionResponse {
  goal_probability: number; // 0-100
  // Fix: Update confidence_level type to match AI's Vietnamese output
  confidence_level: 'thấp' | 'trung bình' | 'cao' | 'rất cao';
  reasoning?: string; // Optional explanation from AI
}
