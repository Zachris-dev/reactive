export type LogLevel = "trace" | "verbose" | "summary" | "quiet";

export type Die3 = readonly [number, number, number];

export interface DiceSource {
  d6(): number;
  d10(): number;
}

export interface SkillRoundResult {
  storedSkill: number;
  whole: number;
  fraction: number;
  fractionDie: number | null;
  roundedSkill: number;
}

export interface RollStep {
  dice: Die3;
  sum: number;
  signedDifference: number;
  doublingLevel: number;
  multiplier: number;
  riskMatch: boolean;
  edgeMatch: boolean;
  isTriple: boolean;
  rollValue: number | null;
}

export type EngineEvent =
  | {
      type: "skill-rounded";
      storedSkill: number;
      fraction: number;
      fractionDie: number | null;
      roundedSkill: number;
    }
  | {
      type: "dice-rolled";
      step: RollStep;
    }
  | {
      type: "risk-pending";
      doublingLevel: number;
    }
  | {
      type: "edge-available";
      doublingLevel: number;
    }
  | {
      type: "fumble-recorded";
      severity: number;
      doublingLevel: number;
    }
  | {
      type: "doubling";
      completedLevel: number;
      nextLevel: number;
      nextMultiplier: number;
    }
  | {
      type: "roll-complete";
      finalTotal: number;
      finalRollValue: number;
      pendingRisk: boolean;
      edgeAvailable: boolean;
      fumbleSeverity: number | null;
    };

export interface SimpleRollResult {
  skill: SkillRoundResult;
  steps: RollStep[];
  pendingRisk: boolean;
  edgeAvailable: boolean;
  fumbleSeverity: number | null;
  finalRollValue: number;
  finalTotal: number;
  events: EngineEvent[];
}

export interface OpposedContestResult {
  a: SimpleRollResult;
  b: SimpleRollResult;
  riskAgainstA: boolean;
  riskAgainstB: boolean;
  bothHaveEdge: boolean;
  oneSidedEdgeDecision:
    | null
    | {
        sideWithEdge: "A" | "B";
        target: "A" | "B";
      };
}
