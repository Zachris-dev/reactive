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
  /** Risk currently created on side A by this contest. */
  riskAgainstA: boolean;
  /** Risk currently created on side B by this contest. */
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
  /**
   * Cumulative Risk state already active when this frame begins.
   * Always false at depth 0.
   */
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
 * One opposed contest returned for resolution while the Risk stack unwinds.
 *
 * Returns are emitted deepest-first. A fumble in a deeper frame propagates to
 * every enclosing frame, so the totals/severity here may differ from the raw
 * contest totals stored in the source frame.
 */
export interface OpposedReturnResult {
  /** Depth of the source contest frame. 0 is the original opposed roll. */
  depth: number;
  contest: OpposedContestResult;
  aTotal: number;
  bTotal: number;
  /** Risk flags after all nested contests have propagated back. */
  riskA: boolean;
  riskB: boolean;
  /** Fumbles from this frame or a deeper frame, propagated outward. */
  aFumbleSeverity: number | null;
  bFumbleSeverity: number | null;
}

/**
 * Complete opposed roll including all nested Risk frames and every result that
 * must subsequently be resolved.
 *
 * frames are stored in roll order: original first, deepest last.
 * returns are stored in resolution order: deepest first, original last.
 */
export interface OpposedRollResult {
  frames: OpposedRiskFrame[];
  returns: OpposedReturnResult[];
  /** Final cumulative Risk state after the whole stack has been rolled. */
  riskA: boolean;
  riskB: boolean;
  /** Worst fumble that propagates all the way back to the original frame. */
  aFumbleSeverity: number | null;
  bFumbleSeverity: number | null;
}
