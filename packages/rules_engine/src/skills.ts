import { DiceSource, PresentedSkill } from "./types";

export function validateStoredSkill(skill: number): void {
  if (!Number.isInteger(skill) || skill < 0) {
    throw new Error(`Skill must be a non-negative integer in tenths; got ${skill}.`);
  }
}

export function skillNeedsRounding(skill: number): boolean {
  validateStoredSkill(skill);
  return skill % 10 !== 0;
}

function validateFractionDie(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error(`Fraction die must be an integer from 1 to 10; got ${value}.`);
  }
}

/**
 * Turn a canonical integer-tenths skill into the whole-number skill used by
 * one test. Exact skills need no fraction die. Fractional skills require one.
 */
export function presentStoredSkill(
  skill: number,
  fractionDie?: number,
): PresentedSkill {
  validateStoredSkill(skill);

  const whole = Math.floor(skill / 10);
  const fraction = skill % 10;

  if (fraction === 0) {
    return {
      supplied: skill,
      rounded: whole,
    };
  }

  if (fractionDie === undefined) {
    throw new Error(
      `Skill ${skill} requires a d10 fractional-rounding result before it can be presented.`,
    );
  }

  validateFractionDie(fractionDie);

  return {
    supplied: skill,
    rounded: fractionDie <= fraction ? whole + 1 : whole,
    fractionDie,
  };
}

export function roundStoredSkill(
  skill: number,
  dice: DiceSource,
): PresentedSkill {
  if (!skillNeedsRounding(skill)) {
    return presentStoredSkill(skill);
  }
  return presentStoredSkill(skill, dice.d10());
}

export class SkillSequence {
  private index = 0;

  constructor(private readonly values: readonly number[]) {
    for (const value of values) {
      validateStoredSkill(value);
    }
  }

  next(): number {
    if (this.index >= this.values.length) {
      return 0;
    }
    return this.values[this.index++];
  }

  remaining(): readonly number[] {
    return this.values.slice(this.index);
  }

  consumedCount(): number {
    return this.index;
  }
}
