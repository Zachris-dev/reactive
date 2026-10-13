import {
  DiceSource,
  PresentedSkill,
  SkillInput,
  SkillSelection,
} from "./types";

export function validateStoredSkill(skill: number): void {
  if (!Number.isInteger(skill) || skill < 0) {
    throw new Error(`Skill must be a non-negative integer in tenths; got ${skill}.`);
  }
}

export function defaultSkillName(skill: number): string {
  validateStoredSkill(skill);
  return `Skill ${(skill / 10).toFixed(1)}`;
}

export function normalizeSkillInput(skill: SkillInput): SkillSelection {
  if (typeof skill === "number") {
    validateStoredSkill(skill);
    return {
      name: defaultSkillName(skill),
      supplied: skill,
    };
  }

  validateStoredSkill(skill.supplied);

  if (skill.name !== undefined && skill.name.trim().length === 0) {
    throw new Error("Skill name must not be empty when supplied.");
  }

  return {
    name: skill.name ?? defaultSkillName(skill.supplied),
    supplied: skill.supplied,
  };
}

export function skillNeedsRounding(skill: SkillInput): boolean {
  const selection = normalizeSkillInput(skill);
  return selection.supplied % 10 !== 0;
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
  skill: SkillInput,
  fractionDie?: number,
): PresentedSkill {
  const selection = normalizeSkillInput(skill);
  const whole = Math.floor(selection.supplied / 10);
  const fraction = selection.supplied % 10;

  if (fraction === 0) {
    return {
      name: selection.name,
      supplied: selection.supplied,
      rounded: whole,
    };
  }

  if (fractionDie === undefined) {
    throw new Error(
      `Skill ${selection.supplied} requires a d10 fractional-rounding result before it can be presented.`,
    );
  }

  validateFractionDie(fractionDie);

  return {
    name: selection.name,
    supplied: selection.supplied,
    rounded: fractionDie <= fraction ? whole + 1 : whole,
    fractionDie,
  };
}

export function roundStoredSkill(
  skill: SkillInput,
  dice: DiceSource,
): PresentedSkill {
  if (!skillNeedsRounding(skill)) {
    return presentStoredSkill(skill);
  }
  return presentStoredSkill(skill, dice.d10());
}

export class SkillSequence {
  private index = 0;

  constructor(private readonly values: readonly SkillInput[]) {
    for (const value of values) {
      normalizeSkillInput(value);
    }
  }

  next(): SkillInput {
    if (this.index >= this.values.length) {
      return 0;
    }
    return this.values[this.index++];
  }

  remaining(): readonly SkillInput[] {
    return this.values.slice(this.index);
  }

  consumedCount(): number {
    return this.index;
  }
}
