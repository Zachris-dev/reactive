import {
  DiceSource,
  Die3,
  EngineEvent,
  RollStep,
  SimpleRollResult,
} from "./types";
import { roundStoredSkill } from "./skills";

export interface SimpleRollOptions {
  maxDoublingDepth?: number;
}

function roll3d6(dice: DiceSource): Die3 {
  return [dice.d6(), dice.d6(), dice.d6()];
}

function isTriple(values: Die3): boolean {
  return values[0] === values[1] && values[1] === values[2];
}

export function rollSimple(
  storedSkill: number,
  dice: DiceSource,
  options: SimpleRollOptions = {},
): SimpleRollResult {
  const maxDoublingDepth = options.maxDoublingDepth ?? 64;
  const skill = roundStoredSkill(storedSkill, dice);
  const events: EngineEvent[] = [
    {
      type: "skill-rounded",
      storedSkill,
      fraction: skill.fraction,
      fractionDie: skill.fractionDie,
      roundedSkill: skill.roundedSkill,
    },
  ];

  const steps: RollStep[] = [];
  let pendingRisk = false;
  let edgeAvailable = false;
  let fumbleSeverity: number | null = null;
  let doublingLevel = 0;

  while (true) {
    if (doublingLevel > maxDoublingDepth) {
      throw new Error(
        `Maximum doubling depth ${maxDoublingDepth} exceeded. ` +
          "Increase the safety limit for a deliberately deeper deterministic test.",
      );
    }

    const rolled = roll3d6(dice);
    const sum = rolled[0] + rolled[1] + rolled[2];
    const signedDifference = sum - 10;
    const riskMatch = signedDifference === skill.roundedSkill;
    const edgeMatch = sum === skill.roundedSkill;
    const triple = isTriple(rolled);
    const multiplier = 2 ** doublingLevel;

    const step: RollStep = {
      dice: rolled,
      sum,
      signedDifference,
      doublingLevel,
      multiplier,
      riskMatch,
      edgeMatch,
      isTriple: triple,
      rollValue: null,
    };
    steps.push(step);
    events.push({ type: "dice-rolled", step: { ...step } });

    if (riskMatch) {
      if (doublingLevel === 0) {
        pendingRisk = true;
        events.push({ type: "risk-pending", doublingLevel });
      } else {
        fumbleSeverity = Math.max(fumbleSeverity ?? 0, doublingLevel);
        events.push({
          type: "fumble-recorded",
          severity: fumbleSeverity,
          doublingLevel,
        });
      }
    }

    if (edgeMatch) {
      edgeAvailable = true;
      events.push({ type: "edge-available", doublingLevel });
    }

    if (!triple) {
      break;
    }

    const nextLevel = doublingLevel + 1;
    events.push({
      type: "doubling",
      completedLevel: doublingLevel,
      nextLevel,
      nextMultiplier: 2 ** nextLevel,
    });
    doublingLevel = nextLevel;
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

  const finalTotal = highestRollValue + skill.roundedSkill;
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
