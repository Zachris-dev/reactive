import {
  Die3,
  OpposedContestResult,
  OpposedReturnResult,
  OpposedRiskFrame,
  PresentedSkill,
  RollStep,
  Side,
  SimpleRollResult,
} from "./types";
import {
  presentStoredSkill,
  skillNeedsRounding,
  validateStoredSkill,
} from "./skills";
import {
  completeSimpleRoll,
  evaluateRollStep,
} from "./simpleRoll";
import {
  buildOpposedReturns,
  createOpposedContestResult,
} from "./opposedRoll";

export interface OpposedSessionOptions {
  /** Safety limit for nested Risk contests; the initial contest is depth 0. */
  maxRiskDepth?: number;
}

export interface OpposedSessionSideState {
  /** Canonical integer-tenths skill selected for this contest. */
  suppliedSkill: number;
  /**
   * Frozen skill instance for this contest once presentation/rounding is done.
   * Exact skills have only supplied + rounded. Fractional skills also retain
   * the d10 that produced the rounded value.
   */
  skill: PresentedSkill | null;
  /** Preserved 3d6 history for this one test, including all doublings. */
  steps: RollStep[];
  /** Present only after the mandatory doubling chain is complete. */
  result: SimpleRollResult | null;
}

export interface OpposedSessionActiveFrame {
  depth: number;
  enteredWithRiskA: boolean;
  enteredWithRiskB: boolean;
  a: OpposedSessionSideState;
  b: OpposedSessionSideState;
  /**
   * Set once both simple rolls are complete. It remains here while waiting for
   * an optional one-sided Edge decision.
   */
  contest: OpposedContestResult | null;
}

export type OpposedSessionRequest =
  | {
      type: "fraction-die";
      depth: number;
      side: Side;
      suppliedSkill: number;
    }
  | {
      type: "roll-dice";
      depth: number;
      side: Side;
      count: 3;
      sides: 6;
      doublingLevel: number;
      multiplier: number;
    }
  | {
      type: "edge-choice";
      depth: number;
      sideWithEdge: Side;
      target: Side;
      contest: OpposedContestResult;
    }
  | {
      type: "risk-skills";
      depth: number;
      riskA: boolean;
      riskB: boolean;
    }
  | {
      type: "scores";
      index: number;
      total: number;
      result: OpposedReturnResult;
    }
  | {
      type: "complete";
    };

export type OpposedSessionInput =
  | {
      type: "fraction-die";
      side: Side;
      value: number;
    }
  | {
      type: "roll-dice";
      side: Side;
      dice: Die3;
    }
  | {
      type: "edge-decision";
      use: boolean;
    }
  | {
      type: "risk-skills";
      aSkill: number;
      bSkill: number;
    }
  | {
      type: "scores-resolved";
    };

export interface OpposedRollSession {
  /** Completed contest frames in roll order, original first. */
  frames: OpposedRiskFrame[];
  /** Built once rolling is finished, deepest result first. */
  returns: OpposedReturnResult[];
  /** Partial contest currently being rolled, if any. */
  activeFrame: OpposedSessionActiveFrame | null;
  /** The one external input or action the engine currently needs. */
  request: OpposedSessionRequest;
  /** Cumulative Risk state created anywhere in the stack so far. */
  riskA: boolean;
  riskB: boolean;
  /** Current position while returning scores for resolution. */
  returnIndex: number;
  maxRiskDepth: number;
}

function newSideState(suppliedSkill: number): OpposedSessionSideState {
  validateStoredSkill(suppliedSkill);
  return {
    suppliedSkill,
    skill: null,
    steps: [],
    result: null,
  };
}

function newActiveFrame(
  depth: number,
  aSkill: number,
  bSkill: number,
  enteredWithRiskA: boolean,
  enteredWithRiskB: boolean,
): OpposedSessionActiveFrame {
  return {
    depth,
    enteredWithRiskA,
    enteredWithRiskB,
    a: newSideState(aSkill),
    b: newSideState(bSkill),
    contest: null,
  };
}

function cloneSide(
  side: OpposedSessionSideState,
): OpposedSessionSideState {
  return {
    ...side,
    skill: side.skill === null ? null : { ...side.skill },
    steps: side.steps.map((step) => ({
      ...step,
      dice: [...step.dice] as Die3,
    })),
  };
}

function cloneActiveFrame(
  frame: OpposedSessionActiveFrame | null,
): OpposedSessionActiveFrame | null {
  if (frame === null) {
    return null;
  }
  return {
    ...frame,
    a: cloneSide(frame.a),
    b: cloneSide(frame.b),
  };
}

function cloneSession(session: OpposedRollSession): OpposedRollSession {
  return {
    ...session,
    frames: [...session.frames],
    returns: [...session.returns],
    activeFrame: cloneActiveFrame(session.activeFrame),
  };
}

function sideState(
  frame: OpposedSessionActiveFrame,
  side: Side,
): OpposedSessionSideState {
  return side === "A" ? frame.a : frame.b;
}

function presentExactSkills(frame: OpposedSessionActiveFrame): void {
  for (const side of [frame.a, frame.b]) {
    if (side.skill === null && !skillNeedsRounding(side.suppliedSkill)) {
      side.skill = presentStoredSkill(side.suppliedSkill);
    }
  }
}

function beginReturns(session: OpposedRollSession): void {
  session.returns = buildOpposedReturns(
    session.frames,
    session.riskA,
    session.riskB,
  );
  session.returnIndex = 0;

  const first = session.returns[0];
  if (first === undefined) {
    throw new Error("Opposed session produced no return values.");
  }

  session.request = {
    type: "scores",
    index: 0,
    total: session.returns.length,
    result: first,
  };
}

function finalizeCurrentContest(
  session: OpposedRollSession,
  edgeUsedBy: Side | null,
): void {
  const active = session.activeFrame;
  if (active === null || active.contest === null) {
    throw new Error("No completed contest is available to finalize.");
  }

  const contest = active.contest;
  let riskStartedForA = contest.riskAgainstA;
  let riskStartedForB = contest.riskAgainstB;

  if (edgeUsedBy === "A") {
    riskStartedForB = true;
  } else if (edgeUsedBy === "B") {
    riskStartedForA = true;
  }

  session.frames.push({
    depth: active.depth,
    aSkill: contest.a.skill,
    bSkill: contest.b.skill,
    aSkillFallback: false,
    bSkillFallback: false,
    enteredWithRiskA: active.enteredWithRiskA,
    enteredWithRiskB: active.enteredWithRiskB,
    contest,
    edgeUsedBy,
    riskStartedForA,
    riskStartedForB,
  });

  if (riskStartedForA) {
    session.riskA = true;
  }
  if (riskStartedForB) {
    session.riskB = true;
  }

  session.activeFrame = null;

  if (riskStartedForA || riskStartedForB) {
    const nextDepth = active.depth + 1;
    if (nextDepth > session.maxRiskDepth) {
      throw new Error(
        `Maximum nested Risk depth ${session.maxRiskDepth} exceeded. ` +
          "Increase the safety limit for a deliberately deeper deterministic test.",
      );
    }

    session.request = {
      type: "risk-skills",
      depth: nextDepth,
      riskA: session.riskA,
      riskB: session.riskB,
    };
    return;
  }

  beginReturns(session);
}

/**
 * Advance automatically through states that need no external decision.
 * The function stops only when dice, an Edge choice, Risk skills, or score
 * resolution is required.
 */
function advanceUntilPause(session: OpposedRollSession): void {
  while (true) {
    const active = session.activeFrame;
    if (active === null) {
      return;
    }

    presentExactSkills(active);

    if (active.a.skill === null) {
      session.request = {
        type: "fraction-die",
        depth: active.depth,
        side: "A",
        suppliedSkill: active.a.suppliedSkill,
      };
      return;
    }

    if (active.b.skill === null) {
      session.request = {
        type: "fraction-die",
        depth: active.depth,
        side: "B",
        suppliedSkill: active.b.suppliedSkill,
      };
      return;
    }

    if (active.a.result === null) {
      const doublingLevel = active.a.steps.length;
      session.request = {
        type: "roll-dice",
        depth: active.depth,
        side: "A",
        count: 3,
        sides: 6,
        doublingLevel,
        multiplier: 2 ** doublingLevel,
      };
      return;
    }

    if (active.b.result === null) {
      const doublingLevel = active.b.steps.length;
      session.request = {
        type: "roll-dice",
        depth: active.depth,
        side: "B",
        count: 3,
        sides: 6,
        doublingLevel,
        multiplier: 2 ** doublingLevel,
      };
      return;
    }

    if (active.contest === null) {
      active.contest = createOpposedContestResult(
        active.a.result,
        active.b.result,
      );
    }

    const offered = active.contest.oneSidedEdgeDecision;
    if (offered !== null) {
      session.request = {
        type: "edge-choice",
        depth: active.depth,
        sideWithEdge: offered.sideWithEdge,
        target: offered.target,
        contest: active.contest,
      };
      return;
    }

    finalizeCurrentContest(session, null);
    return;
  }
}

export function startOpposedSession(
  aSkill: number,
  bSkill: number,
  options: OpposedSessionOptions = {},
): OpposedRollSession {
  const session: OpposedRollSession = {
    frames: [],
    returns: [],
    activeFrame: newActiveFrame(0, aSkill, bSkill, false, false),
    request: { type: "complete" },
    riskA: false,
    riskB: false,
    returnIndex: 0,
    maxRiskDepth: options.maxRiskDepth ?? 64,
  };

  advanceUntilPause(session);
  return session;
}

function requireRequest<T extends OpposedSessionRequest["type"]>(
  session: OpposedRollSession,
  type: T,
): Extract<OpposedSessionRequest, { type: T }> {
  if (session.request.type !== type) {
    throw new Error(
      `Opposed session is waiting for ${session.request.type}, not ${type}.`,
    );
  }
  return session.request as Extract<OpposedSessionRequest, { type: T }>;
}

export function advanceOpposedSession(
  session: OpposedRollSession,
  input: OpposedSessionInput,
): OpposedRollSession {
  const next = cloneSession(session);

  if (input.type === "fraction-die") {
    const request = requireRequest(next, "fraction-die");
    if (request.side !== input.side) {
      throw new Error(
        `Fraction die is required from side ${request.side}, not ${input.side}.`,
      );
    }

    const active = next.activeFrame;
    if (active === null) {
      throw new Error("No active contest is waiting for fractional rounding.");
    }

    const side = sideState(active, input.side);
    side.skill = presentStoredSkill(side.suppliedSkill, input.value);
    advanceUntilPause(next);
    return next;
  }

  if (input.type === "roll-dice") {
    const request = requireRequest(next, "roll-dice");
    if (request.side !== input.side) {
      throw new Error(
        `3d6 is required from side ${request.side}, not ${input.side}.`,
      );
    }

    const active = next.activeFrame;
    if (active === null) {
      throw new Error("No active contest is waiting for 3d6.");
    }

    const side = sideState(active, input.side);
    if (side.skill === null) {
      throw new Error("Skill presentation must finish before rolling 3d6.");
    }

    const step = evaluateRollStep(
      side.skill,
      input.dice,
      request.doublingLevel,
    );
    side.steps.push(step);

    if (!step.isTriple) {
      side.result = completeSimpleRoll(side.skill, side.steps);
    }

    advanceUntilPause(next);
    return next;
  }

  if (input.type === "edge-decision") {
    const request = requireRequest(next, "edge-choice");
    finalizeCurrentContest(
      next,
      input.use ? request.sideWithEdge : null,
    );
    return next;
  }

  if (input.type === "risk-skills") {
    const request = requireRequest(next, "risk-skills");
    validateStoredSkill(input.aSkill);
    validateStoredSkill(input.bSkill);

    next.activeFrame = newActiveFrame(
      request.depth,
      input.aSkill,
      input.bSkill,
      next.riskA,
      next.riskB,
    );
    advanceUntilPause(next);
    return next;
  }

  if (input.type === "scores-resolved") {
    requireRequest(next, "scores");

    const nextIndex = next.returnIndex + 1;
    next.returnIndex = nextIndex;

    if (nextIndex >= next.returns.length) {
      next.request = { type: "complete" };
      return next;
    }

    next.request = {
      type: "scores",
      index: nextIndex,
      total: next.returns.length,
      result: next.returns[nextIndex],
    };
    return next;
  }

  const neverInput: never = input;
  throw new Error(`Unsupported opposed-session input: ${String(neverInput)}`);
}
