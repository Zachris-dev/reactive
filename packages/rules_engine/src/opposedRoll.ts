import {
  DiceSource,
  EdgeDecisionContext,
  OpposedContestResult,
  OpposedReturnResult,
  OpposedRiskFrame,
  OpposedRollOptions,
  OpposedRollResult,
  Side,
  SimpleRollResult,
} from "./types";
import { rollSimple } from "./simpleRoll";
import { SkillSequence } from "./skills";

/**
 * Apply the opposed interaction rules to two already-completed simple rolls.
 * No dice are rolled here.
 */
export function createOpposedContestResult(
  a: SimpleRollResult,
  b: SimpleRollResult,
): OpposedContestResult {
  // Normal Risk belongs to the side that rolled it.
  let riskAgainstA = a.pendingRisk;
  let riskAgainstB = b.pendingRisk;

  // A fumble cancels still-pending Risk created by that same roll.
  if (a.fumbleSeverity !== null) {
    riskAgainstA = false;
  }
  if (b.fumbleSeverity !== null) {
    riskAgainstB = false;
  }

  const aCanUseEdge = a.edgeAvailable && a.fumbleSeverity === null;
  const bCanUseEdge = b.edgeAvailable && b.fumbleSeverity === null;
  const bothHaveEdge = aCanUseEdge && bCanUseEdge;

  let oneSidedEdgeDecision: OpposedContestResult["oneSidedEdgeDecision"] = null;

  if (bothHaveEdge) {
    // Both sides having Edge in the same contest is automatic double Risk.
    riskAgainstA = true;
    riskAgainstB = true;
  } else if (aCanUseEdge && b.fumbleSeverity === null && !riskAgainstB) {
    oneSidedEdgeDecision = { sideWithEdge: "A", target: "B" };
  } else if (bCanUseEdge && a.fumbleSeverity === null && !riskAgainstA) {
    oneSidedEdgeDecision = { sideWithEdge: "B", target: "A" };
  }

  return {
    a,
    b,
    riskAgainstA,
    riskAgainstB,
    bothHaveEdge,
    oneSidedEdgeDecision,
  };
}

/**
 * Roll one opposed contest frame.
 *
 * This immediate helper is useful for tests and batch tools. Normal play can
 * use the resumable opposed-session API instead.
 */
export function rollOpposedContest(
  aSkill: number,
  bSkill: number,
  aDice: DiceSource,
  bDice: DiceSource,
): OpposedContestResult {
  return createOpposedContestResult(
    rollSimple(aSkill, aDice),
    rollSimple(bSkill, bDice),
  );
}

function maxSeverity(current: number | null, candidate: number | null): number | null {
  if (candidate === null) {
    return current;
  }
  if (current === null) {
    return candidate;
  }
  return Math.max(current, candidate);
}

function useOptionalEdge(
  depth: number,
  contest: OpposedContestResult,
  decision: OpposedRollOptions["edgeDecision"],
): Side | null {
  const offered = contest.oneSidedEdgeDecision;
  if (offered === null || decision === undefined) {
    return null;
  }

  const context: EdgeDecisionContext = {
    depth,
    sideWithEdge: offered.sideWithEdge,
    target: offered.target,
    contest,
  };

  return decision(context) ? offered.sideWithEdge : null;
}

export function buildOpposedReturns(
  frames: readonly OpposedRiskFrame[],
  riskA: boolean,
  riskB: boolean,
): OpposedReturnResult[] {
  const returns: OpposedReturnResult[] = [];
  let propagatedFumbleA: number | null = null;
  let propagatedFumbleB: number | null = null;

  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];

    // Fumbles propagate only outward: a fumble in an enclosing contest must
    // not rewrite a deeper contest that has already been rolled.
    propagatedFumbleA = maxSeverity(
      propagatedFumbleA,
      frame.contest.a.fumbleSeverity,
    );
    propagatedFumbleB = maxSeverity(
      propagatedFumbleB,
      frame.contest.b.fumbleSeverity,
    );

    returns.push({
      depth: frame.depth,
      contest: frame.contest,
      aTotal:
        propagatedFumbleA === null ? frame.contest.a.finalTotal : 0,
      bTotal:
        propagatedFumbleB === null ? frame.contest.b.finalTotal : 0,
      riskA,
      riskB,
      aFumbleSeverity: propagatedFumbleA,
      bFumbleSeverity: propagatedFumbleB,
    });
  }

  return returns;
}

/**
 * Batch helper: roll a complete opposed roll, including nested Risk contests.
 *
 * Normal interactive play should use the resumable opposed-session API. This
 * helper remains useful for the CLI tester and deterministic automated cases.
 */
export function rollOpposed(
  aSkills: readonly number[],
  bSkills: readonly number[],
  aDice: DiceSource,
  bDice: DiceSource,
  options: OpposedRollOptions = {},
): OpposedRollResult {
  const aSequence = new SkillSequence(aSkills);
  const bSequence = new SkillSequence(bSkills);
  const maxRiskDepth = options.maxRiskDepth ?? 64;

  const frames: OpposedRiskFrame[] = [];
  let riskA = false;
  let riskB = false;

  let activeRiskA = false;
  let activeRiskB = false;
  let depth = 0;

  while (true) {
    if (depth > maxRiskDepth) {
      throw new Error(
        `Maximum nested Risk depth ${maxRiskDepth} exceeded. ` +
          "Increase the safety limit for a deliberately deeper deterministic test.",
      );
    }

    const aSkillFallback = aSequence.remaining().length === 0;
    const bSkillFallback = bSequence.remaining().length === 0;
    const aSkill = aSequence.next();
    const bSkill = bSequence.next();

    const contest = rollOpposedContest(aSkill, bSkill, aDice, bDice);
    let riskStartedForA = contest.riskAgainstA;
    let riskStartedForB = contest.riskAgainstB;

    const edgeUsedBy = useOptionalEdge(depth, contest, options.edgeDecision);
    if (edgeUsedBy === "A") {
      // A's Edge inflicts Risk on B.
      riskStartedForB = true;
    } else if (edgeUsedBy === "B") {
      // B's Edge inflicts Risk on A.
      riskStartedForA = true;
    }

    frames.push({
      depth,
      aSkill: contest.a.skill,
      bSkill: contest.b.skill,
      aSkillFallback,
      bSkillFallback,
      enteredWithRiskA: activeRiskA,
      enteredWithRiskB: activeRiskB,
      contest,
      edgeUsedBy,
      riskStartedForA,
      riskStartedForB,
    });

    if (riskStartedForA) {
      riskA = true;
      activeRiskA = true;
    }
    if (riskStartedForB) {
      riskB = true;
      activeRiskB = true;
    }

    if (!riskStartedForA && !riskStartedForB) {
      break;
    }

    // The Risk contest is now started. Later fumbles cannot erase that frame.
    depth += 1;
  }

  if (frames.length === 0) {
    throw new Error("Opposed roll produced no contest frames.");
  }

  const returns = buildOpposedReturns(frames, riskA, riskB);
  const originalReturn = returns[returns.length - 1];
  if (originalReturn === undefined) {
    throw new Error("Opposed roll produced no return values.");
  }

  return {
    frames,
    returns,
    riskA,
    riskB,
    aFumbleSeverity: originalReturn.aFumbleSeverity,
    bFumbleSeverity: originalReturn.bFumbleSeverity,
  };
}
