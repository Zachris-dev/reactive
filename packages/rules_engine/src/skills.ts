import { DiceSource, SkillRoundResult } from "./types";

export function validateStoredSkill(skill: number): void {
  if (!Number.isInteger(skill) || skill < 0) {
    throw new Error(`Skill must be a non-negative integer in tenths; got ${skill}.`);
  }
}

export function roundStoredSkill(skill: number, dice: DiceSource): SkillRoundResult {
  validateStoredSkill(skill);

  const whole = Math.floor(skill / 10);
  const fraction = skill % 10;

  if (fraction === 0) {
    return {
      storedSkill: skill,
      whole,
      fraction,
      fractionDie: null,
      roundedSkill: whole,
    };
  }

  const fractionDie = dice.d10();
  const roundedSkill = fractionDie <= fraction ? whole + 1 : whole;

  return {
    storedSkill: skill,
    whole,
    fraction,
    fractionDie,
    roundedSkill,
  };
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
