import {
  DiceSource,
  Die3,
  EngineEvent,
  PresentedSkill,
  RollStep,
  SkillInput,
  SimpleRollResult,
} from "./types";
import { roundStoredSkill } from "./skills";

export interface SimpleRollOptions {
  maxDoublingDepth?: number;
}

function roll3d6(dice: DiceSource): Die3 {
  return [dice.d6(), dice.d6(), dice.d6()];
}

function validateD6(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new Error(`d6 must be an integer from 1 to 6; got ${value}.`);
  }
}

function isTriple(values: Die3): boolean {
  return values[0] === values[1] && values[1] === values[2];
}

/**
 * Evaluate one supplied 3d6 result using a skill that has already been
 * presented and rounded for this test.
 */
export function evaluateRollStep(
  skill: PresentedSkill,
  rolled: Die3,
  doublingLevel: number,
): RollStep {
  if (!Number.isInteger(doublingLevel) || doublingLevel < 0) {
    throw new Error(
      `Doubling level must be a non-negative integer; got ${doublingLevel}.`,
    );
  }

  validateD6(rolled[0]);
  validateD6(rolled[1]);
  validateD6(rolled[2]);

  const sum = rolled[0] + rolled[1] + rolled[2];
  const signedDifference = sum - 10;

  return {
    dice: rolled,
    sum,
    signedDifference,
    doublingLevel,
    multiplier: 2 ** doublingLevel,
    riskMatch: signedDifference === skill.rounded,
    edgeMatch: sum === skill.rounded,
    isTriple: isTriple(rolled),
    rollValue: null,
  };
}

function skillEvent(skill: PresentedSkill): EngineEvent {
  if (skill.fractionDie === undefined) {
    return {
      type: "skill-rounded",
      name: skill.name,
      supplied: skill.supplied,
      rounded: skill.rounded,
    };
  }

  return {
    type: "skill-rounded",
    name: skill.name,
    supplied: skill.supplied,
    rounded: skill.rounded,
    fractionDie: skill.fractionDie,
  };
}

/**
 * Complete a simple roll from an already-presented skill and its preserved
 * 3d6 history. This is used by both the immediate roller and the resumable
 * opposed-roll session.
 */
export function completeSimpleRoll(
  skill: PresentedSkill,
  suppliedSteps: readonly RollStep[],
): SimpleRollResult {
  if (suppliedSteps.length === 0) {
    throw new Error("A simple roll cannot complete without a 3d6 result.");
  }

  if (suppliedSteps[suppliedSteps.length - 1].isTriple) {
    throw new Error("A simple roll cannot complete while doubling is still required.");
  }

  const steps: RollStep[] = suppliedSteps.map((step) => ({
    ...step,
    dice: [...step.dice] as Die3,
    rollValue: null,
  }));

  const events: EngineEvent[] = [skillEvent(skill)];
  let pendingRisk = false;
  let edgeAvailable = false;
  let fumbleSeverity: number | null = null;

  for (const step of steps) {
    events.push({
      type: "dice-rolled",
      step: { ...step, dice: [...step.dice] as Die3 },
    });

    if (step.riskMatch) {
      if (step.doublingLevel === 0) {
        pendingRisk = true;
        events.push({
          type: "risk-pending",
          doublingLevel: step.doublingLevel,
        });
      } else {
        fumbleSeverity = Math.max(
          fumbleSeverity ?? 0,
          step.doublingLevel,
        );
        events.push({
          type: "fumble-recorded",
          severity: fumbleSeverity,
          doublingLevel: step.doublingLevel,
        });
      }
    }

    if (step.edgeMatch) {
      edgeAvailable = true;
      events.push({
        type: "edge-available",
        doublingLevel: step.doublingLevel,
      });
    }

    if (step.isTriple) {
      const nextLevel = step.doublingLevel + 1;
      events.push({
        type: "doubling",
        completedLevel: step.doublingLevel,
        nextLevel,
        nextMultiplier: 2 ** nextLevel,
      });
    }
  }

  if (fumbleSeverity !== null) {
    pendingRisk = false;
    edgeAvailable = false;
    events.push({
      type: "roll-complete",
      finalTotal: 0,
      finalRollValue: 0,
      pendingRisk,
      edgeAvailable,
      fumbleSeverity,
    });

    return {
      skill,
      steps,
      pendingRisk,
      edgeAvailable,
      fumbleSeverity,
      finalRollValue: 0,
      finalTotal: 0,
      events,
    };
  }

  let highestRollValue = 0;
  for (const step of steps) {
    step.rollValue = Math.abs(step.signedDifference) * step.multiplier;
    highestRollValue = Math.max(highestRollValue, step.rollValue);
  }

  const finalTotal = highestRollValue + skill.rounded;
  events.push({
    type: "roll-complete",
    finalTotal,
    finalRollValue: highestRollValue,
    pendingRisk,
    edgeAvailable,
    fumbleSeverity,
  });

  return {
    skill,
    steps,
    pendingRisk,
    edgeAvailable,
    fumbleSeverity,
    finalRollValue: highestRollValue,
    finalTotal,
    events,
  };
}

export function rollSimple(
  storedSkill: SkillInput,
  dice: DiceSource,
  options: SimpleRollOptions = {},
): SimpleRollResult {
  const maxDoublingDepth = options.maxDoublingDepth ?? 64;
  const skill = roundStoredSkill(storedSkill, dice);
  const steps: RollStep[] = [];
  let doublingLevel = 0;

  while (true) {
    if (doublingLevel > maxDoublingDepth) {
      throw new Error(
        `Maximum doubling depth ${maxDoublingDepth} exceeded. ` +
          "Increase the safety limit for a deliberately deeper deterministic test.",
      );
    }

    const step = evaluateRollStep(
      skill,
      roll3d6(dice),
      doublingLevel,
    );
    steps.push(step);

    if (!step.isTriple) {
      break;
    }

    doublingLevel += 1;
  }

  return completeSimpleRoll(skill, steps);
}
