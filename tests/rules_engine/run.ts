declare const process: {
  argv: string[];
};

type TestSuite = "all" | "roll" | "result";

function parseTestSuite(args: string[]): TestSuite {
  if (args.length === 0) {
    return "all";
  }
  if (args.length === 1 && (args[0] === "roll" || args[0] === "result")) {
    return args[0];
  }
  throw new Error("Test suite must be 'roll' or 'result'.");
}

const requestedSuite = parseTestSuite(process.argv.slice(2));

import {
  SequenceDiceSource,
  SkillSequence,
  advanceOpposedSession,
  rollOpposed,
  rollOpposedContest,
  rollSimple,
  resolveOpposedReturn,
  startOpposedSession,
} from "../../packages/rules_engine/src";

function equal<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function test(
  suite: Exclude<TestSuite, "all">,
  name: string,
  fn: () => void,
): void {
  if (requestedSuite !== "all" && requestedSuite !== suite) {
    return;
  }
  fn();
  console.log(`PASS ${name}`);
}

test("roll", "fractional skill rounds up when d10 <= fraction", () => {
  const result = rollSimple(33, new SequenceDiceSource([2, 3, 6], [3]));
  equal(result.skill.supplied, 33, "supplied skill");
  equal(result.skill.rounded, 4, "rounded skill");
  equal(result.skill.fractionDie, 3, "fraction die");
});

test("roll", "fractional skill rounds down when d10 > fraction", () => {
  const result = rollSimple(33, new SequenceDiceSource([2, 3, 6], [4]));
  equal(result.skill.rounded, 3, "rounded skill");
  equal(result.skill.fractionDie, 4, "fraction die");
});

test("roll", "numeric skill input receives a generated display name from its unrounded value", () => {
  const result = rollSimple(44, new SequenceDiceSource([2, 3, 6], [9]));
  equal(result.skill.name, "Skill 4.4", "generated skill name");
  equal(result.skill.supplied, 44, "supplied skill");
  equal(result.skill.rounded, 4, "rounded skill");
});

test("roll", "supplied skill name is preserved through fractional rounding", () => {
  const result = rollSimple(
    { name: "Longsword", supplied: 44 },
    new SequenceDiceSource([2, 3, 6], [2]),
  );
  equal(result.skill.name, "Longsword", "skill name");
  equal(result.skill.supplied, 44, "supplied skill");
  equal(result.skill.rounded, 5, "rounded skill");
  equal(result.skill.fractionDie, 2, "fraction die");
});

test("roll", "structured skill without a name receives the same generated display name", () => {
  const result = rollSimple(
    { supplied: 44 },
    new SequenceDiceSource([2, 3, 6], [9]),
  );
  equal(result.skill.name, "Skill 4.4", "generated skill name");
});

test("roll", "exact skill presentation has supplied and rounded values without a fraction die", () => {
  const result = rollSimple(40, new SequenceDiceSource([2, 3, 6]));
  equal(result.skill.supplied, 40, "supplied skill");
  equal(result.skill.rounded, 4, "rounded skill");
  equal("fractionDie" in result.skill, false, "fraction die absent");
});

test("roll", "Risk check uses signed sum-10, not absolute value", () => {
  const result = rollSimple(70, new SequenceDiceSource([1, 1, 1, 2, 3, 6]));
  equal(result.steps[0].signedDifference, -7, "signed difference");
  equal(result.steps[0].riskMatch, false, "Risk match");
});

test("roll", "Edge uses raw sum and survives a doubling chain", () => {
  const result = rollSimple(30, new SequenceDiceSource([1, 1, 1, 2, 3, 4]));
  equal(result.steps[0].edgeMatch, true, "first-step Edge");
  equal(result.edgeAvailable, true, "final Edge availability");
});

test("roll", "Risk can be pending before doubling and survives if no fumble occurs", () => {
  const result = rollSimple(20, new SequenceDiceSource([4, 4, 4, 2, 3, 6]));
  equal(result.pendingRisk, true, "pending Risk");
  equal(result.fumbleSeverity, null, "fumble severity");
});

test("roll", "Risk match after one doubling records Fumble 1 and forces total zero", () => {
  const result = rollSimple(
    20,
    new SequenceDiceSource([4, 4, 4, 4, 4, 4, 2, 3, 6]),
  );
  equal(result.fumbleSeverity, 1, "fumble severity");
  equal(result.finalTotal, 0, "final total");
  equal(result.pendingRisk, false, "pending Risk cancelled");
  equal(result.edgeAvailable, false, "Edge lost");
});

test("roll", "later fumble severity replaces earlier lower severity", () => {
  const result = rollSimple(
    20,
    new SequenceDiceSource([
      4, 4, 4,
      4, 4, 4,
      4, 4, 4,
      2, 3, 6,
    ]),
  );
  equal(result.fumbleSeverity, 2, "fumble severity");
});

test("roll", "roll values are calculated after checks with the correct multiplier", () => {
  const result = rollSimple(20, new SequenceDiceSource([1, 1, 1, 2, 3, 6]));
  equal(result.steps[0].rollValue, 7, "initial roll value");
  equal(result.steps[1].rollValue, 2, "doubled roll value");
  equal(result.finalRollValue, 7, "highest roll value");
  equal(result.finalTotal, 9, "final total");
});

test("roll", "skill sequence falls back to Skill 0 after supplied values are exhausted", () => {
  const sequence = new SkillSequence([40, 32, 11]);
  equal(sequence.next(), 40, "first skill");
  equal(sequence.next(), 32, "second skill");
  equal(sequence.next(), 11, "third skill");
  equal(sequence.next(), 0, "first fallback");
  equal(sequence.next(), 0, "second fallback");
});

test("roll", "opposed roll preserves character-sheet skill names on both sides", () => {
  const result = rollOpposed(
    [{ name: "Longsword", supplied: 40 }],
    [{ name: "Spear", supplied: 30 }],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  equal(result.frames[0].aSkill.name, "Longsword", "A skill name");
  equal(result.frames[0].bSkill.name, "Spear", "B skill name");
});

test("roll", "a side's normal Risk belongs to that same side", () => {
  const result = rollOpposedContest(
    20,
    40,
    new SequenceDiceSource([4, 4, 4, 2, 3, 6]),
    new SequenceDiceSource([2, 3, 6]),
  );
  equal(result.riskAgainstA, true, "Risk on A");
  equal(result.riskAgainstB, false, "Risk on B");
});

test("roll", "normal Risk starts a nested contest and exhausted skill lists use Skill 0", () => {
  const result = rollOpposed(
    [20],
    [40],
    new SequenceDiceSource([4, 4, 4, 2, 3, 6, 2, 3, 6]),
    new SequenceDiceSource([2, 3, 6, 2, 3, 6]),
  );
  equal(result.frames.length, 2, "frame count");
  equal(result.returns.length, 2, "return count");
  equal(result.returns[0].depth, 1, "first return is nested Risk");
  equal(result.returns[1].depth, 0, "second return is original contest");
  equal(result.riskA, true, "accumulated A Risk");
  equal(result.riskB, false, "accumulated B Risk");
  equal(result.frames[1].aSkill.supplied, 0, "nested A skill");
  equal(result.frames[1].bSkill.supplied, 0, "nested B skill");
  equal(result.frames[1].aSkillFallback, true, "nested A fallback marker");
  equal(result.frames[1].bSkillFallback, true, "nested B fallback marker");
});

test("roll", "both sides can create Risk in one frame and open one double-Risk contest", () => {
  const result = rollOpposed(
    [20],
    [20],
    new SequenceDiceSource([4, 4, 4, 2, 3, 6, 2, 3, 6]),
    new SequenceDiceSource([4, 4, 4, 2, 3, 6, 2, 3, 6]),
  );
  equal(result.frames.length, 2, "frame count");
  equal(result.returns.length, 2, "return count");
  equal(result.riskA, true, "A Risk");
  equal(result.riskB, true, "B Risk");
  equal(result.frames[1].enteredWithRiskA, true, "nested A incoming Risk");
  equal(result.frames[1].enteredWithRiskB, true, "nested B incoming Risk");
});

test("roll", "Risk flags remain cumulative in deeper contest frames and on return", () => {
  const result = rollOpposed(
    [20, 0],
    [40, 20],
    new SequenceDiceSource([
      4, 4, 4, 2, 3, 6,
      2, 3, 6,
      2, 3, 6,
    ]),
    new SequenceDiceSource([
      2, 3, 6,
      4, 4, 4, 2, 3, 6,
      2, 3, 6,
    ]),
  );
  equal(result.frames.length, 3, "frame count");
  equal(result.returns.length, 3, "return count");
  equal(result.riskA, true, "A Risk propagated");
  equal(result.riskB, true, "B Risk propagated");
  equal(result.frames[1].enteredWithRiskA, true, "first nested has A Risk");
  equal(result.frames[1].enteredWithRiskB, false, "first nested lacks B Risk");
  equal(result.frames[2].enteredWithRiskA, true, "deeper nested retains A Risk");
  equal(result.frames[2].enteredWithRiskB, true, "deeper nested gains B Risk");
  equal(result.returns[0].riskA, true, "deepest return A Risk");
  equal(result.returns[0].riskB, true, "deepest return B Risk");
  equal(result.returns[2].riskA, true, "original return A Risk");
  equal(result.returns[2].riskB, true, "original return B Risk");
});

test("roll", "nested fumble propagates outward through return values", () => {
  const result = rollOpposed(
    [20, 20],
    [40, 40],
    new SequenceDiceSource([
      4, 4, 4, 2, 3, 6,
      4, 4, 4, 4, 4, 4, 2, 3, 6,
    ]),
    new SequenceDiceSource([
      2, 3, 6,
      2, 3, 6,
    ]),
  );
  equal(result.frames.length, 2, "frame count");
  equal(result.returns.length, 2, "return count");
  equal(result.aFumbleSeverity, 1, "A propagated fumble");
  equal(result.returns[0].depth, 1, "nested return depth");
  equal(result.returns[0].aTotal, 0, "nested A total");
  equal(result.returns[0].aFumbleSeverity, 1, "nested A fumble");
  equal(result.returns[1].depth, 0, "original return depth");
  equal(result.returns[1].aTotal, 0, "original A total after propagation");
  equal(result.returns[1].aFumbleSeverity, 1, "original A propagated fumble");
  equal(result.riskA, true, "already-started A Risk remains");
});

test("roll", "one-sided Edge may add Risk to the opponent", () => {
  const result = rollOpposed(
    [30],
    [40],
    new SequenceDiceSource([1, 1, 1, 2, 3, 6, 2, 3, 6]),
    new SequenceDiceSource([2, 3, 6, 2, 3, 6]),
    { edgeDecision: () => true },
  );
  equal(result.frames.length, 2, "frame count");
  equal(result.returns.length, 2, "return count");
  equal(result.frames[0].edgeUsedBy, "A", "Edge user");
  equal(result.riskA, false, "A Risk");
  equal(result.riskB, true, "B Risk from A Edge");
});

test("roll", "optional one-sided Edge is declined when no decision callback is supplied", () => {
  const result = rollOpposed(
    [30],
    [40],
    new SequenceDiceSource([1, 1, 1, 2, 3, 6]),
    new SequenceDiceSource([2, 3, 6]),
  );
  equal(result.frames.length, 1, "frame count");
  equal(result.returns.length, 1, "return count");
  equal(result.frames[0].edgeUsedBy, null, "Edge not used");
  equal(result.riskB, false, "no B Risk");
});

test("roll", "both sides Edge creates automatic double Risk without a callback", () => {
  const result = rollOpposed(
    [30],
    [30],
    new SequenceDiceSource([1, 1, 1, 2, 3, 6, 2, 3, 6]),
    new SequenceDiceSource([1, 1, 1, 2, 3, 6, 2, 3, 6]),
  );
  equal(result.frames.length, 2, "frame count");
  equal(result.returns.length, 2, "return count");
  equal(result.frames[0].contest.bothHaveEdge, true, "double Edge detected");
  equal(result.riskA, true, "A Risk");
  equal(result.riskB, true, "B Risk");
});

test("roll", "Edge cannot add pending Risk to a target that fumbled in that frame", () => {
  const result = rollOpposedContest(
    30,
    20,
    new SequenceDiceSource([1, 1, 1, 2, 3, 6]),
    new SequenceDiceSource([4, 4, 4, 4, 4, 4, 2, 3, 6]),
  );
  equal(result.a.edgeAvailable, true, "A Edge");
  equal(result.b.fumbleSeverity, 1, "B fumble");
  equal(result.oneSidedEdgeDecision, null, "no Edge decision against fumbled B");
  equal(result.riskAgainstB, false, "no pending B Risk");
});

test("roll", "five contest frames produce five resolution returns in reverse order", () => {
  const result = rollOpposed(
    [20, 40, 20, 40, 40],
    [40, 20, 40, 20, 40],
    new SequenceDiceSource([
      3, 4, 5,
      2, 3, 4,
      3, 4, 5,
      2, 3, 4,
      2, 3, 4,
    ]),
    new SequenceDiceSource([
      2, 3, 4,
      3, 4, 5,
      2, 3, 4,
      3, 4, 5,
      2, 3, 4,
    ]),
  );
  equal(result.frames.length, 5, "frame count");
  equal(result.returns.length, 5, "return count");
  equal(result.returns[0].depth, 4, "first return depth");
  equal(result.returns[1].depth, 3, "second return depth");
  equal(result.returns[2].depth, 2, "third return depth");
  equal(result.returns[3].depth, 1, "fourth return depth");
  equal(result.returns[4].depth, 0, "last return depth");
});

test("roll", "resumable session presents exact skills without inventing a fraction die", () => {
  const session = startOpposedSession(40, 50);
  equal(session.request.type, "roll-dice", "first request");
  equal(session.activeFrame?.a.skill?.supplied, 40, "A supplied skill");
  equal(session.activeFrame?.a.skill?.rounded, 4, "A rounded skill");
  equal(session.activeFrame?.b.skill?.supplied, 50, "B supplied skill");
  equal(session.activeFrame?.b.skill?.rounded, 5, "B rounded skill");
  const exactASkill = session.activeFrame?.a.skill;
  if (exactASkill === null || exactASkill === undefined) {
    throw new Error("A exact skill was not presented.");
  }
  equal("fractionDie" in exactASkill, false, "A fraction die absent");
});

test("roll", "resumable session rounds each newly presented fractional skill once", () => {
  let session = startOpposedSession(
    { name: "Athletics", supplied: 33 },
    { name: "Footwork", supplied: 27 },
  );
  equal(session.request.type, "fraction-die", "A fraction request");
  if (session.request.type === "fraction-die") {
    equal(session.request.skill.name, "Athletics", "A requested skill name");
    equal(session.request.skill.supplied, 33, "A requested supplied skill");
  }

  session = advanceOpposedSession(session, {
    type: "fraction-die",
    side: "A",
    value: 2,
  });
  equal(session.activeFrame?.a.skill?.name, "Athletics", "A skill name");
  equal(session.activeFrame?.a.skill?.supplied, 33, "A supplied");
  equal(session.activeFrame?.a.skill?.rounded, 4, "A rounded");
  equal(session.activeFrame?.a.skill?.fractionDie, 2, "A fraction die");
  equal(session.request.type, "fraction-die", "B fraction request");
  if (session.request.type === "fraction-die") {
    equal(session.request.skill.name, "Footwork", "B requested skill name");
    equal(session.request.skill.supplied, 27, "B requested supplied skill");
  }

  session = advanceOpposedSession(session, {
    type: "fraction-die",
    side: "B",
    value: 8,
  });
  equal(session.activeFrame?.b.skill?.name, "Footwork", "B skill name");
  equal(session.activeFrame?.b.skill?.supplied, 27, "B supplied");
  equal(session.activeFrame?.b.skill?.rounded, 2, "B rounded");
  equal(session.activeFrame?.b.skill?.fractionDie, 8, "B fraction die");
  equal(session.request.type, "roll-dice", "3d6 request after rounding");
});

test("roll", "resumable session preserves the rounded skill and prior dice through doubling", () => {
  let session = startOpposedSession(40, 40);

  session = advanceOpposedSession(session, {
    type: "roll-dice",
    side: "A",
    dice: [4, 4, 4],
  });
  equal(session.request.type, "roll-dice", "doubling request");
  if (session.request.type === "roll-dice") {
    equal(session.request.side, "A", "doubling side");
    equal(session.request.doublingLevel, 1, "doubling level");
  }
  equal(session.activeFrame?.a.steps.length, 1, "preserved first step");
  equal(session.activeFrame?.a.skill?.rounded, 4, "preserved rounded skill");

  session = advanceOpposedSession(session, {
    type: "roll-dice",
    side: "A",
    dice: [2, 3, 4],
  });
  equal(session.activeFrame?.a.steps.length, 2, "preserved doubling chain");
  equal(session.activeFrame?.a.skill?.rounded, 4, "same rounded skill after doubling");
  equal(session.request.type, "roll-dice", "B roll request");
});

test("roll", "resumable session pauses for Risk skills and preserves the original frame", () => {
  let session = startOpposedSession(20, 40);

  session = advanceOpposedSession(session, {
    type: "roll-dice",
    side: "A",
    dice: [3, 4, 5],
  });
  session = advanceOpposedSession(session, {
    type: "roll-dice",
    side: "B",
    dice: [2, 3, 4],
  });

  equal(session.request.type, "risk-skills", "Risk skill request");
  equal(session.frames.length, 1, "original frame preserved");
  equal(session.frames[0].aSkill.supplied, 20, "original A skill preserved");
  equal(session.frames[0].contest.a.steps.length, 1, "original A roll preserved");

  session = advanceOpposedSession(session, {
    type: "risk-skills",
    aSkill: { name: "Athletics", supplied: 33 },
    bSkill: { name: "Shield", supplied: 40 },
  });
  equal(session.request.type, "fraction-die", "new Risk skill rounding request");

  session = advanceOpposedSession(session, {
    type: "fraction-die",
    side: "A",
    value: 2,
  });
  equal(session.activeFrame?.depth, 1, "Risk frame depth");
  equal(session.activeFrame?.a.skill?.name, "Athletics", "Risk skill name");
  equal(session.activeFrame?.a.skill?.supplied, 33, "Risk supplied skill");
  equal(session.activeFrame?.a.skill?.rounded, 4, "Risk rounded skill");
  equal(session.frames[0].aSkill.rounded, 2, "original rounded skill unchanged");
});

test("roll", "resumable session pauses for one-sided Edge before deciding whether Risk starts", () => {
  let passSession = startOpposedSession(40, 40);
  passSession = advanceOpposedSession(passSession, {
    type: "roll-dice",
    side: "A",
    dice: [1, 1, 2],
  });
  passSession = advanceOpposedSession(passSession, {
    type: "roll-dice",
    side: "B",
    dice: [2, 3, 4],
  });
  equal(passSession.request.type, "edge-choice", "Edge choice request");

  passSession = advanceOpposedSession(passSession, {
    type: "edge-decision",
    use: false,
  });
  equal(passSession.request.type, "scores", "scores after passing Edge");
  equal(passSession.frames[0].edgeUsedBy, null, "Edge declined");

  let useSession = startOpposedSession(40, 40);
  useSession = advanceOpposedSession(useSession, {
    type: "roll-dice",
    side: "A",
    dice: [1, 1, 2],
  });
  useSession = advanceOpposedSession(useSession, {
    type: "roll-dice",
    side: "B",
    dice: [2, 3, 4],
  });
  useSession = advanceOpposedSession(useSession, {
    type: "edge-decision",
    use: true,
  });
  equal(useSession.request.type, "risk-skills", "Risk skills after using Edge");
  equal(useSession.frames[0].edgeUsedBy, "A", "Edge used by A");
  equal(useSession.frames[0].riskStartedForB, true, "Risk started for B");
});

test("roll", "resumable session returns nested scores first and original scores afterward", () => {
  let session = startOpposedSession(20, 40);

  session = advanceOpposedSession(session, {
    type: "roll-dice",
    side: "A",
    dice: [3, 4, 5],
  });
  session = advanceOpposedSession(session, {
    type: "roll-dice",
    side: "B",
    dice: [2, 3, 4],
  });
  session = advanceOpposedSession(session, {
    type: "risk-skills",
    aSkill: 40,
    bSkill: 40,
  });
  session = advanceOpposedSession(session, {
    type: "roll-dice",
    side: "A",
    dice: [2, 3, 4],
  });
  session = advanceOpposedSession(session, {
    type: "roll-dice",
    side: "B",
    dice: [2, 3, 4],
  });

  equal(session.request.type, "scores", "first score return");
  if (session.request.type === "scores") {
    equal(session.request.result.depth, 1, "nested scores first");
    equal(session.request.total, 2, "two score results");
    equal(session.request.results.length, 2, "all score results exposed together");
    equal(session.request.results[0].depth, 1, "display stack begins deepest");
    equal(session.request.results[1].depth, 0, "display stack includes original");
  }

  session = advanceOpposedSession(session, { type: "scores-resolved" });
  equal(session.request.type, "scores", "second score return");
  if (session.request.type === "scores") {
    equal(session.request.result.depth, 0, "original scores second");
  }

  session = advanceOpposedSession(session, { type: "scores-resolved" });
  equal(session.request.type, "complete", "session complete");
});


test("result", "resolution reports Equal after selected roll modifiers", () => {
  const rolled = rollOpposed(
    [30],
    [30],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const resolved = resolveOpposedReturn({
    source: rolled.returns[0],
    aRollModifiers: [{ name: "Rain", value: -1 }],
    bRollModifiers: [{ name: "Rain", value: -1 }],
  });

  equal(resolved.a.rawTotal, 4, "A raw total");
  equal(resolved.a.modifiedTotal, 3, "A modified total");
  equal(resolved.b.modifiedTotal, 3, "B modified total");
  equal(resolved.ordinary.type, "equal", "ordinary result");
  equal(resolved.effects.length, 0, "equal has no ordinary effect");
});

test("result", "resolution reports Carryover at difference one and does not apply Effect modifiers", () => {
  const rolled = rollOpposed(
    [40],
    [30],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const resolved = resolveOpposedReturn({
    source: rolled.returns[0],
    effectModifiers: {
      aWins: [{ name: "Halberd", value: 3 }],
    },
  });

  equal(resolved.difference, 1, "difference");
  equal(resolved.ordinary.type, "carryover", "ordinary result");
  if (resolved.ordinary.type === "carryover") {
    equal(resolved.ordinary.side, "A", "carryover side");
  }
  equal(resolved.effects.length, 0, "carryover has no ordinary effect");
});

test("result", "resolution calculates Success Level from difference, Effect modifiers, and Risk", () => {
  const rolled = rollOpposed(
    [50],
    [20],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const source = { ...rolled.returns[0], riskA: true };
  const resolved = resolveOpposedReturn({
    source,
    effectModifiers: {
      aWins: [
        { name: "Sword", value: 1 },
        { name: "Medium armour", value: -2 },
        { name: "Good leverage", value: 2 },
      ],
    },
  });

  equal(resolved.difference, 3, "difference");
  equal(resolved.ordinary.type, "success", "ordinary result");
  if (resolved.ordinary.type === "success") {
    equal(resolved.ordinary.side, "A", "winner");
    equal(resolved.ordinary.effectModifierTotal, 1, "Effect modifier total");
    equal(resolved.ordinary.effectMargin, 4, "Effect margin");
    equal(resolved.ordinary.provisionalLevel, 2, "provisional level");
    equal(resolved.ordinary.riskPenalty, 1, "Risk penalty");
    equal(resolved.ordinary.level, 1, "final Success Level");
  }
  equal(resolved.effects.length, 1, "one ordinary effect");
  equal(resolved.effects[0].sufferedBy, "B", "effect target");
  equal(resolved.effects[0].level, 1, "effect level");
});

test("result", "Risk does not reduce Success Level supplied by opponent fumble", () => {
  const rolled = rollOpposed(
    [30],
    [30],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const source = {
    ...rolled.returns[0],
    aTotal: 4,
    bTotal: 0,
    riskA: true,
    bFumbleSeverity: 2,
  };
  const resolved = resolveOpposedReturn({ source });

  equal(resolved.ordinary.type, "success", "ordinary result");
  if (resolved.ordinary.type === "success") {
    equal(resolved.ordinary.side, "A", "winner");
    equal(resolved.ordinary.provisionalLevel, 2, "ordinary provisional level");
    equal(resolved.ordinary.riskPenalty, 1, "ordinary Risk penalty");
    equal(resolved.ordinary.level, 1, "ordinary level after Risk");
  }
  equal(resolved.effects.length, 1, "one effect");
  equal(resolved.effects[0].sufferedBy, "B", "effect target");
  equal(resolved.effects[0].ordinaryLevel, 1, "Risk-reduced ordinary component");
  equal(resolved.effects[0].fumbleFloor, 2, "opponent fumble floor");
  equal(resolved.effects[0].level, 2, "fumble-caused Success Level is not reduced");
});

test("result", "modified total zero creates Fumble 1 and combines with ordinary effect", () => {
  const rolled = rollOpposed(
    [30],
    [30],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const resolved = resolveOpposedReturn({
    source: rolled.returns[0],
    aRollModifiers: [{ name: "Wounded", value: -4 }],
  });

  equal(resolved.a.modifiedTotal, 0, "A modified total");
  equal(resolved.a.circumstancesFumbleSeverity, 1, "A circumstances Fumble");
  equal(resolved.a.fumbleCause, "circumstances", "A Fumble cause");
  equal(resolved.a.fumbleSeverity, 1, "A Fumble severity");
  equal(resolved.ordinary.type, "success", "B ordinary success");
  if (resolved.ordinary.type === "success") {
    equal(resolved.ordinary.side, "B", "winner");
    equal(resolved.ordinary.level, 2, "ordinary level");
  }
  equal(resolved.effects.length, 1, "one effect on A");
  equal(resolved.effects[0].sufferedBy, "A", "effect target");
  equal(resolved.effects[0].cause, "ordinary-and-fumble", "combined cause");
  equal(resolved.effects[0].level, 2, "ordinary level remains above fumble floor");
});

test("result", "total modifiers can worsen an existing fumble", () => {
  const rolled = rollOpposed(
    [30],
    [30],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const source = {
    ...rolled.returns[0],
    aTotal: 0,
    aFumbleSeverity: 1,
  };
  const resolved = resolveOpposedReturn({
    source,
    aRollModifiers: [{ name: "Crushed", value: -2 }],
  });

  equal(resolved.a.modifiedTotal, -2, "A modified total");
  equal(resolved.a.doubledRiskFumbleSeverity, 1, "doubled-Risk fumble");
  equal(resolved.a.circumstancesFumbleSeverity, 3, "circumstances fumble");
  equal(
    resolved.a.fumbleCause,
    "doubled-risk-and-circumstances",
    "combined Fumble cause",
  );
  equal(resolved.a.fumbleSeverity, 3, "worsened fumble");
  equal(resolved.effects[0].sufferedBy, "A", "A suffers effect");
  equal(resolved.effects[0].level, 3, "Fumble 3 floor");
});

test("result", "an existing doubled-Risk fumble is not relabelled as circumstances", () => {
  const rolled = rollOpposed(
    [30],
    [30],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const source = {
    ...rolled.returns[0],
    aTotal: 0,
    aFumbleSeverity: 2,
  };
  const resolved = resolveOpposedReturn({ source });

  equal(resolved.a.doubledRiskFumbleSeverity, 2, "doubled-Risk severity");
  equal(resolved.a.circumstancesFumbleSeverity, null, "no circumstances Fumble");
  equal(resolved.a.fumbleCause, "doubled-risk", "Fumble cause");
  equal(resolved.a.fumbleSeverity, 2, "final severity");
  equal(resolved.effects[0].fumbleCause, "doubled-risk", "effect Fumble cause");
});

test("result", "double fumble can produce effects on both sides", () => {
  const rolled = rollOpposed(
    [30],
    [30],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const source = {
    ...rolled.returns[0],
    aTotal: 0,
    bTotal: 0,
    aFumbleSeverity: 1,
    bFumbleSeverity: 2,
  };
  const resolved = resolveOpposedReturn({ source });

  equal(resolved.ordinary.type, "equal", "ordinary result");
  equal(resolved.effects.length, 2, "two fumble effects");
  equal(resolved.effects[0].sufferedBy, "A", "first target");
  equal(resolved.effects[0].level, 1, "A fumble floor");
  equal(resolved.effects[0].fumbleCause, "doubled-risk", "A Fumble cause");
  equal(resolved.effects[1].sufferedBy, "B", "second target");
  equal(resolved.effects[1].level, 2, "B fumble floor");
  equal(resolved.effects[1].fumbleCause, "doubled-risk", "B Fumble cause");
});

test("result", "resolution preserves the exact modifier entries submitted by the UI", () => {
  const rolled = rollOpposed(
    [40],
    [30],
    new SequenceDiceSource([2, 3, 4]),
    new SequenceDiceSource([2, 3, 4]),
  );
  const resolved = resolveOpposedReturn({
    source: rolled.returns[0],
    aRollModifiers: [
      { id: "scene-shrub", name: "Heavy shrub (mitigated)", value: -1 },
    ],
  });

  equal(resolved.a.modifiers.length, 1, "modifier count");
  equal(resolved.a.modifiers[0].id, "scene-shrub", "modifier id");
  equal(resolved.a.modifiers[0].name, "Heavy shrub (mitigated)", "modifier name");
  equal(resolved.a.modifiers[0].value, -1, "effective modifier value");
  equal(resolved.a.modifierTotal, -1, "selected adjustment");
});

console.log(
  requestedSuite === "all"
    ? "All rules-engine tests passed."
    : `All rules-engine ${requestedSuite} tests passed.`,
);
