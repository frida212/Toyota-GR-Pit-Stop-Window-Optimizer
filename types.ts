
export enum TireCompound {
  Soft = 'Soft',
  Medium = 'Medium',
  Hard = 'Hard',
}

export enum TrackType {
  HighDeg = 'High Degradation',
  LowDeg = 'Low Degradation',
}

export enum RiskLevel {
  Conservative = 'Conservative',
  Balanced = 'Balanced',
  Aggressive = 'Aggressive',
}

export interface RaceData {
  totalLaps: number;
  avgLapTime: number;
  pitLaneTimeLoss: number;
  startCompound: TireCompound;
  availableCompounds: TireCompound[];
  tireWear: number; // 1-10 scale
  tireCliff: number;
  trackType: TrackType;
  traffic: number; // 1-10 scale
  overtakingDifficulty: number; // 1-10 scale
  riskLevel: RiskLevel;
}

export interface PitStop {
  pitOnLap: number;
  switchToTire: TireCompound;
}

export interface Strategy {
  strategyName: string;
  pitStops: PitStop[];
}

export interface PrimaryStrategy extends Strategy {
  justification: string;
  estimatedTimeGain: string;
}

export interface AlternativeStrategy extends Strategy {
  pros: string[];
  cons: string[];
}

export interface PitStrategy {
  primaryStrategy: PrimaryStrategy;
  alternativeStrategies: AlternativeStrategy[];
}
