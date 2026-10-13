import {
  OpposedContestResult,
  OpposedReturnResult,
  OpposedRiskFrame,
  SimpleRollResult,
} from "./types";

/**
 * Apply opposed interaction rules to two already-completed simple rolls.
 * No dice are rolled here.
 */
export function createOpposedContestResult(
  a: SimpleRollResult,
  b: SimpleRollResult,
): OpposedContestResult {
  let riskAgainstA = a.pendingRisk;
  let riskAgainstB = b.pendingRisk;

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

function maxSeverity(
  current: number | null,
  candidate: number | null,
): number | null {
  if (candidate === null) {
    return current;
  }
  if (current === null) {
    return candidate;
  }
  return Math.max(current, candidate);
}

/**
 * Build opposed results in resolution order: deepest Risk first, original
 * contest last. Deeper fumbles propagate outward to enclosing returns.
 */
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
