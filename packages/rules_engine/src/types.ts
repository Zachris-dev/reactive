export type LogLevel = "trace" | "verbose" | "summary" | "quiet";
export type Side = "A" | "B";

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

/** Result of one opposed contest frame before any new Risk frame is started. */
export interface OpposedContestResult {
  a: SimpleRollResult;
  b: SimpleRollResult;
  /** Risk currently pending on side A. */
  riskAgainstA: boolean;
  /** Risk currently pending on side B. */
  riskAgainstB: boolean;
  bothHaveEdge: boolean;
  oneSidedEdgeDecision:
    | null
    | {
        sideWithEdge: Side;
        target: Side;
      };
}

export interface EdgeDecisionContext {
  depth: number;
  sideWithEdge: Side;
  target: Side;
  contest: OpposedContestResult;
}

export type EdgeDecision = (context: EdgeDecisionContext) => boolean;

export interface OpposedRollOptions {
  /** Optional Edge is declined when no decision callback is supplied. */
  edgeDecision?: EdgeDecision;
  /** Safety limit for nested Risk contests; the initial contest is depth 0. */
  maxRiskDepth?: number;
}

export interface OpposedRiskFrame {
  depth: number;
  aSkill: number;
  bSkill: number;
  aSkillFallback: boolean;
  bSkillFallback: boolean;
  /** Risk state that caused this frame to exist. Always false at depth 0. */
  enteredWithRiskA: boolean;
  enteredWithRiskB: boolean;
  contest: OpposedContestResult;
  /** Side that chose to spend a one-sided Edge in this frame, if any. */
  edgeUsedBy: Side | null;
  /** New Risk created by this frame after Edge interaction is resolved. */
  riskStartedForA: boolean;
  riskStartedForB: boolean;
}

/**
 * Complete opposed roll including all nested Risk frames.
 *
 * Ordinary totals from nested frames do not replace the initial totals.
 * Risk flags accumulate by side. A fumble in any nested frame propagates back
 * through the stack and forces that side's final opposed total to zero.
 */
export interface OpposedRollResult {
  frames: OpposedRiskFrame[];
  aFinalTotal: number;
  bFinalTotal: number;
  riskA: boolean;
  riskB: boolean;
  aFumbleSeverity: number | null;
  bFumbleSeverity: number | null;
}
