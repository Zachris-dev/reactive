import {
  DiceSource,
  EdgeDecisionContext,
  OpposedContestResult,
  OpposedRiskFrame,
  OpposedRollOptions,
  OpposedRollResult,
  Side,
} from "./types";
import { rollSimple } from "./simpleRoll";
import { SkillSequence } from "./skills";

/**
 * Roll one opposed contest frame.
 *
 * A side's own Risk trigger places Risk on that same side. Edge is different:
 * a one-sided Edge may place Risk on the opponent, while Edge on both sides is
 * automatic double Risk.
 *
 * This function stops before resolving an optional one-sided Edge or starting
 * a nested Risk contest. rollOpposed() performs those higher-level steps.
 */
export function rollOpposedContest(
  aSkill: number,
  bSkill: number,
  aDice: DiceSource,
  bDice: DiceSource,
): OpposedContestResult {
  const a = rollSimple(aSkill, aDice);
  const b = rollSimple(bSkill, bDice);

  // Normal Risk belongs to the side that rolled it.
  let riskAgainstA = a.pendingRisk;
  let riskAgainstB = b.pendingRisk;

  // A fumble cancels still-pending Risk on that same side.
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

/**
 * Roll a complete opposed roll, including nested Risk contests.
 *
 * Each new Risk contest consumes the next supplied skill for both sides. When
 * a side's supplied sequence is exhausted, further Risk contests use Skill 0.
 * Doubling does not consume another skill because it remains part of the same
 * test.
 *
 * Risk flags accumulate through the nested stack. Ordinary totals from nested
 * Risk contests do not replace the initial opposed totals. A fumble in any
 * nested contest propagates back through the stack and forces that side's
 * final opposed total to zero; the greatest fumble severity is preserved.
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
  let aFumbleSeverity: number | null = null;
  let bFumbleSeverity: number | null = null;

  let enteredWithRiskA = false;
  let enteredWithRiskB = false;
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
      aSkill,
      bSkill,
      aSkillFallback,
      bSkillFallback,
      enteredWithRiskA,
      enteredWithRiskB,
      contest,
      edgeUsedBy,
      riskStartedForA,
      riskStartedForB,
    });

    aFumbleSeverity = maxSeverity(aFumbleSeverity, contest.a.fumbleSeverity);
    bFumbleSeverity = maxSeverity(bFumbleSeverity, contest.b.fumbleSeverity);

    if (riskStartedForA) {
      riskA = true;
    }
    if (riskStartedForB) {
      riskB = true;
    }

    if (!riskStartedForA && !riskStartedForB) {
      break;
    }

    // The Risk contest is now started. Later fumbles cannot erase this already
    // existing frame; they only affect the side's propagated result/severity.
    enteredWithRiskA = riskStartedForA;
    enteredWithRiskB = riskStartedForB;
    depth += 1;
  }

  const initial = frames[0];
  if (initial === undefined) {
    throw new Error("Opposed roll produced no contest frames.");
  }

  return {
    frames,
    aFinalTotal: aFumbleSeverity === null ? initial.contest.a.finalTotal : 0,
    bFinalTotal: bFumbleSeverity === null ? initial.contest.b.finalTotal : 0,
    riskA,
    riskB,
    aFumbleSeverity,
    bFumbleSeverity,
  };
}
