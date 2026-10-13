import {
  OpposedReturnResult,
  Side,
} from "./types";

/**
 * One modifier explicitly selected by the caller for this resolution.
 *
 * Resolution does not decide whether a scene, wound, spell, or other stored
 * modifier applies. The UI/game-state layer makes that choice and submits only
 * the effective entries that apply here. Mitigation is resolved before this
 * call, including its no-bonus cap. Values are signed: penalties are negative
 * and explicit bonuses are positive.
 */
export interface ResolutionModifier {
  id?: string;
  name: string;
  value: number;
}

/**
 * Effect-stage modifiers for the effect produced when one side wins.
 *
 * The caller supplies already-signed entries. For example, a sword might be
 * +1 and the defender's armour -2. Resolution merely adds the selected values.
 */
export interface SideEffectModifiers {
  aWins?: readonly ResolutionModifier[];
  bWins?: readonly ResolutionModifier[];
}

export interface OpposedResolutionInput {
  source: OpposedReturnResult;
  aRollModifiers?: readonly ResolutionModifier[];
  bRollModifiers?: readonly ResolutionModifier[];
  effectModifiers?: SideEffectModifiers;
}

export type FumbleCause =
  | "doubled-risk"
  | "circumstances"
  | "doubled-risk-and-circumstances";

export interface ResolvedSideTotal {
  rawTotal: number;
  modifiers: ResolutionModifier[];
  modifierTotal: number;
  modifiedTotal: number;
  /**
   * Fumble produced during the roll itself by matching Risk after doubling.
   * This may have propagated outward from a deeper Risk contest.
   */
  doubledRiskFumbleSeverity: number | null;
  /**
   * Fumble produced during resolution because circumstances reduce the
   * modified total to 0 or below.
   */
  circumstancesFumbleSeverity: number | null;
  /**
   * Worst fumble after combining both possible sources.
   */
  fumbleSeverity: number | null;
  /** Narrative provenance retained for the GM. */
  fumbleCause: FumbleCause | null;
}

export type OrdinaryOpposedResult =
  | {
      type: "equal";
      difference: 0;
    }
  | {
      type: "carryover";
      side: Side;
      difference: 1;
    }
  | {
      type: "success";
      side: Side;
      difference: number;
      effectModifiers: ResolutionModifier[];
      effectModifierTotal: number;
      effectMargin: number;
      provisionalLevel: number;
      riskPenalty: 0 | 1;
      level: number;
    };

export type ResolutionEffectCause =
  | "ordinary"
  | "fumble"
  | "ordinary-and-fumble";

export interface ResolutionEffect {
  sufferedBy: Side;
  level: number;
  cause: ResolutionEffectCause;
  /** Ordinary success level before applying a fumble floor, when present. */
  ordinaryLevel: number | null;
  /** Fumble severity acting as a minimum effect level, when present. */
  fumbleFloor: number | null;
  /** Why the fumble existed, retained for narration. */
  fumbleCause: FumbleCause | null;
}

export interface OpposedResolutionResult {
  source: OpposedReturnResult;
  a: ResolvedSideTotal;
  b: ResolvedSideTotal;
  difference: number;
  ordinary: OrdinaryOpposedResult;
  /**
   * Effects actually suffered by sides. Normally there is at most one, but a
   * fumble can create an effect on the ordinary winner and double fumbles can
   * therefore produce effects on both sides.
   */
  effects: ResolutionEffect[];
}

function validateModifier(modifier: ResolutionModifier): void {
  if (modifier.name.trim().length === 0) {
    throw new Error("Resolution modifier name must not be empty.");
  }
  if (!Number.isFinite(modifier.value) || !Number.isInteger(modifier.value)) {
    throw new Error(
      `Resolution modifier '${modifier.name}' must have an integer value; got ${modifier.value}.`,
    );
  }
}

function copyModifiers(
  modifiers: readonly ResolutionModifier[] | undefined,
): ResolutionModifier[] {
  if (modifiers === undefined) {
    return [];
  }

  return modifiers.map((modifier) => {
    validateModifier(modifier);
    return { ...modifier };
  });
}

function sumModifiers(modifiers: readonly ResolutionModifier[]): number {
  return modifiers.reduce((total, modifier) => total + modifier.value, 0);
}

function worseFumble(
  existing: number | null,
  generated: number | null,
): number | null {
  if (existing === null) {
    return generated;
  }
  if (generated === null) {
    return existing;
  }
  return Math.max(existing, generated);
}

function resolveSideTotal(
  rawTotal: number,
  doubledRiskFumbleSeverity: number | null,
  suppliedModifiers: readonly ResolutionModifier[] | undefined,
): ResolvedSideTotal {
  const modifiers = copyModifiers(suppliedModifiers);
  const modifierTotal = sumModifiers(modifiers);
  const modifiedTotal = rawTotal + modifierTotal;

  /*
   * A doubled-Risk fumble has already forced the returned total to 0. Merely
   * seeing that 0 again during resolution must not relabel it as a
   * circumstances fumble. Circumstances become an additional fumble source
   * only when they actually push that already-fumbled total downward.
   *
   * Without a pre-existing doubled-Risk fumble, any final total of 0 or below
   * is a circumstances fumble, even if no explicit modifier was required to
   * reach it.
   */
  const circumstancesFumbleSeverity =
    modifiedTotal <= 0 &&
    (doubledRiskFumbleSeverity === null || modifierTotal < 0)
      ? 1 - modifiedTotal
      : null;

  const fumbleSeverity = worseFumble(
    doubledRiskFumbleSeverity,
    circumstancesFumbleSeverity,
  );

  let fumbleCause: FumbleCause | null = null;
  if (
    doubledRiskFumbleSeverity !== null &&
    circumstancesFumbleSeverity !== null
  ) {
    fumbleCause = "doubled-risk-and-circumstances";
  } else if (doubledRiskFumbleSeverity !== null) {
    fumbleCause = "doubled-risk";
  } else if (circumstancesFumbleSeverity !== null) {
    fumbleCause = "circumstances";
  }

  return {
    rawTotal,
    modifiers,
    modifierTotal,
    modifiedTotal,
    doubledRiskFumbleSeverity,
    circumstancesFumbleSeverity,
    fumbleSeverity,
    fumbleCause,
  };
}

function sideRisk(source: OpposedReturnResult, side: Side): boolean {
  return side === "A" ? source.riskA : source.riskB;
}

function effectModifiersForWinner(
  supplied: SideEffectModifiers | undefined,
  winner: Side,
): ResolutionModifier[] {
  if (winner === "A") {
    return copyModifiers(supplied?.aWins);
  }
  return copyModifiers(supplied?.bWins);
}

interface EffectAccumulator {
  sufferedBy: Side;
  ordinaryLevel: number | null;
  fumbleFloor: number | null;
  fumbleCause: FumbleCause | null;
}

function finalizeEffect(effect: EffectAccumulator): ResolutionEffect {
  let level: number;
  let cause: ResolutionEffectCause;

  if (effect.ordinaryLevel !== null && effect.fumbleFloor !== null) {
    level = Math.max(effect.ordinaryLevel, effect.fumbleFloor);
    cause = "ordinary-and-fumble";
  } else if (effect.ordinaryLevel !== null) {
    level = effect.ordinaryLevel;
    cause = "ordinary";
  } else if (effect.fumbleFloor !== null) {
    level = effect.fumbleFloor;
    cause = "fumble";
  } else {
    throw new Error("Resolution effect has neither ordinary level nor fumble floor.");
  }

  return {
    sufferedBy: effect.sufferedBy,
    level,
    cause,
    ordinaryLevel: effect.ordinaryLevel,
    fumbleFloor: effect.fumbleFloor,
    fumbleCause: effect.fumbleCause,
  };
}

/**
 * Resolve one returned opposed contest.
 *
 * Order:
 * 1. apply selected roll-total modifiers;
 * 2. create/worsen circumstances fumbles from totals of 0 or below while
 *    preserving whether any fumble already came from doubled Risk;
 * 3. compare modified totals;
 * 4. difference 0 => Equal, 1 => Carryover, 2+ => ordinary Success;
 * 5. for Success, apply signed Effect modifiers and divide by 2, floored;
 * 6. Risk on the winner reduces the Success Level by 1;
 * 7. each fumble imposes a minimum effect level equal to its severity.
 */
export function resolveOpposedReturn(
  input: OpposedResolutionInput,
): OpposedResolutionResult {
  const { source } = input;

  const a = resolveSideTotal(
    source.aTotal,
    source.aFumbleSeverity,
    input.aRollModifiers,
  );
  const b = resolveSideTotal(
    source.bTotal,
    source.bFumbleSeverity,
    input.bRollModifiers,
  );

  const difference = Math.abs(a.modifiedTotal - b.modifiedTotal);
  let ordinary: OrdinaryOpposedResult;
  let ordinaryEffect: EffectAccumulator | null = null;

  if (difference === 0) {
    ordinary = {
      type: "equal",
      difference: 0,
    };
  } else {
    const winner: Side =
      a.modifiedTotal > b.modifiedTotal ? "A" : "B";

    if (difference === 1) {
      ordinary = {
        type: "carryover",
        side: winner,
        difference: 1,
      };
    } else {
      const effectModifiers = effectModifiersForWinner(
        input.effectModifiers,
        winner,
      );
      const effectModifierTotal = sumModifiers(effectModifiers);
      const effectMargin = difference + effectModifierTotal;
      const provisionalLevel = Math.floor(effectMargin / 2);
      const riskPenalty: 0 | 1 = sideRisk(source, winner) ? 1 : 0;
      const level = provisionalLevel - riskPenalty;

      ordinary = {
        type: "success",
        side: winner,
        difference,
        effectModifiers,
        effectModifierTotal,
        effectMargin,
        provisionalLevel,
        riskPenalty,
        level,
      };

      ordinaryEffect = {
        sufferedBy: winner === "A" ? "B" : "A",
        ordinaryLevel: level,
        fumbleFloor: null,
        fumbleCause: null,
      };
    }
  }

  const bySide: Partial<Record<Side, EffectAccumulator>> = {};

  if (ordinaryEffect !== null) {
    bySide[ordinaryEffect.sufferedBy] = ordinaryEffect;
  }

  if (a.fumbleSeverity !== null) {
    const existing = bySide.A;
    bySide.A = {
      sufferedBy: "A",
      ordinaryLevel: existing?.ordinaryLevel ?? null,
      fumbleFloor: a.fumbleSeverity,
      fumbleCause: a.fumbleCause,
    };
  }

  if (b.fumbleSeverity !== null) {
    const existing = bySide.B;
    bySide.B = {
      sufferedBy: "B",
      ordinaryLevel: existing?.ordinaryLevel ?? null,
      fumbleFloor: b.fumbleSeverity,
      fumbleCause: b.fumbleCause,
    };
  }

  const effects: ResolutionEffect[] = [];
  if (bySide.A !== undefined) {
    effects.push(finalizeEffect(bySide.A));
  }
  if (bySide.B !== undefined) {
    effects.push(finalizeEffect(bySide.B));
  }

  return {
    source,
    a,
    b,
    difference,
    ordinary,
    effects,
  };
}
