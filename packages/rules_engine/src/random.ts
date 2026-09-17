import { DiceSource } from "./types";

function assertDie(value: number, sides: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > sides) {
    throw new Error(`${label} must be an integer from 1 to ${sides}; got ${value}.`);
  }
  return value;
}

export class RandomDiceSource implements DiceSource {
  d6(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  d10(): number {
    return Math.floor(Math.random() * 10) + 1;
  }
}

export class SequenceDiceSource implements DiceSource {
  private d6Index = 0;
  private d10Index = 0;

  constructor(
    private readonly d6Values: readonly number[] = [],
    private readonly d10Values: readonly number[] = [],
  ) {}

  d6(): number {
    if (this.d6Index >= this.d6Values.length) {
      throw new Error("Deterministic d6 sequence exhausted.");
    }
    return assertDie(this.d6Values[this.d6Index++], 6, "d6");
  }

  d10(): number {
    if (this.d10Index >= this.d10Values.length) {
      throw new Error("Deterministic d10 sequence exhausted.");
    }
    return assertDie(this.d10Values[this.d10Index++], 10, "d10");
  }
}
