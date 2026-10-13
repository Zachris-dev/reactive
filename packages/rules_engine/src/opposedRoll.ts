import {
  DiceSource,
  Die3,
  EdgeDecisionContext,
  OpposedContestResult,
  OpposedRollOptions,
  OpposedRollResult,
} from "./types";
import { rollSimple } from "./simpleRoll";
import { SkillSequence } from "./skills";
import {
  buildOpposedReturns,
  createOpposedContestResult,
} from "./opposedCore";
import {
  advanceOpposedSession,
  startOpposedSession,
} from "./opposedSession";

export {
  buildOpposedReturns,
  createOpposedContestResult,
} from "./opposedCore";

/**
 * Roll one opposed contest immediately.
 *
 * This helper is useful for focused tests. Normal interactive play should use
 * startOpposedSession() / advanceOpposedSession().
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

function roll3d6(dice: DiceSource): Die3 {
  return [dice.d6(), dice.d6(), dice.d6()];
}

/**
 * Batch driver for the resumable opposed-roll engine.
 *
 * The CLI tester and deterministic cases use this convenience wrapper. It
 * answers every pause automatically from the supplied skill sequences, dice
 * sources, and Edge policy, so batch tests exercise the same state machine as
 * eventual interactive play.
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

  let session = startOpposedSession(
    aSequence.next(),
    bSequence.next(),
    { maxRiskDepth: options.maxRiskDepth },
  );

  while (session.request.type !== "complete") {
    const request = session.request;

    if (request.type === "fraction-die") {
      const dice = request.side === "A" ? aDice : bDice;
      session = advanceOpposedSession(session, {
        type: "fraction-die",
        side: request.side,
        value: dice.d10(),
      });
      continue;
    }

    if (request.type === "roll-dice") {
      const dice = request.side === "A" ? aDice : bDice;
      session = advanceOpposedSession(session, {
        type: "roll-dice",
        side: request.side,
        dice: roll3d6(dice),
      });
      continue;
    }

    if (request.type === "edge-choice") {
      let use = false;

      if (options.edgeDecision !== undefined) {
        const context: EdgeDecisionContext = {
          depth: request.depth,
          sideWithEdge: request.sideWithEdge,
          target: request.target,
          contest: request.contest,
        };
        use = options.edgeDecision(context);
      }

      session = advanceOpposedSession(session, {
        type: "edge-decision",
        use,
      });
      continue;
    }

    if (request.type === "risk-skills") {
      session = advanceOpposedSession(session, {
        type: "risk-skills",
        aSkill: aSequence.next(),
        bSkill: bSequence.next(),
      });
      continue;
    }

    if (request.type === "scores") {
      session = advanceOpposedSession(session, {
        type: "scores-resolved",
      });
      continue;
    }
  }

  const frames = session.frames.map((frame) => ({
    ...frame,
    aSkillFallback: frame.depth >= aSkills.length,
    bSkillFallback: frame.depth >= bSkills.length,
  }));

  // Rebuild from the annotated frame list so the batch result is entirely
  // self-consistent even though fallback markers are tester-only metadata.
  const returns = buildOpposedReturns(
    frames,
    session.riskA,
    session.riskB,
  );
  const originalReturn = returns[returns.length - 1];

  if (originalReturn === undefined) {
    throw new Error("Opposed roll produced no return values.");
  }

  return {
    frames,
    returns,
    riskA: session.riskA,
    riskB: session.riskB,
    aFumbleSeverity: originalReturn.aFumbleSeverity,
    bFumbleSeverity: originalReturn.bFumbleSeverity,
  };
}
