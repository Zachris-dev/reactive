export type LogLevel = "trace" | "verbose" | "summary" | "quiet";
export type Side = "A" | "B";

export type Die3 = readonly [number, number, number];

export interface DiceSource {
  d6(): number;
  d10(): number;
}

/**
 * A skill supplied to the engine. Numeric input is still accepted for the
 * standalone roller and tests. Structured input lets a character sheet pass
 * the skill's display name along with its canonical integer-tenths value.
 */
export type SkillInput =
  | number
  | {
      supplied: number;
      name?: string;
    };

/** A normalized skill selection before fractional rounding is resolved. */
export interface SkillSelection {
  name: string;
  supplied: number;
}

/**
 * A skill as actually used by one test.
 *
 * name is preserved for later result display.
 * supplied is always the canonical integer-tenths value (40 = 4.0).
 * rounded is the whole-number value used by that test.
 * fractionDie exists only when the supplied skill required rounding.
 */
export interface PresentedSkill extends SkillSelection {
  rounded: number;
  fractionDie?: number;
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
      name: string;
      supplied: number;
      rounded: number;
      fractionDie?: number;
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
  skill: PresentedSkill;
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
  aSkill: PresentedSkill;
  bSkill: PresentedSkill;
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
