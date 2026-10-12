import {
  SequenceDiceSource,
  SkillSequence,
  rollOpposed,
  rollOpposedContest,
  rollSimple,
} from "../../packages/rules_engine/src";

function equal<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function test(name: string, fn: () => void): void {
  fn();
  console.log(`PASS ${name}`);
}

test("fractional skill rounds up when d10 <= fraction", () => {
  const result = rollSimple(33, new SequenceDiceSource([2, 3, 6], [3]));
  equal(result.skill.roundedSkill, 4, "rounded skill");
});

test("fractional skill rounds down when d10 > fraction", () => {
  const result = rollSimple(33, new SequenceDiceSource([2, 3, 6], [4]));
  equal(result.skill.roundedSkill, 3, "rounded skill");
});

test("Risk check uses signed sum-10, not absolute value", () => {
  const result = rollSimple(70, new SequenceDiceSource([1, 1, 1, 2, 3, 6]));
  equal(result.steps[0].signedDifference, -7, "signed difference");
  equal(result.steps[0].riskMatch, false, "Risk match");
});

test("Edge uses raw sum and survives a doubling chain", () => {
  const result = rollSimple(30, new SequenceDiceSource([1, 1, 1, 2, 3, 4]));
  equal(result.steps[0].edgeMatch, true, "first-step Edge");
  equal(result.edgeAvailable, true, "final Edge availability");
});

test("Risk can be pending before doubling and survives if no fumble occurs", () => {
  const result = rollSimple(20, new SequenceDiceSource([4, 4, 4, 2, 3, 6]));
  equal(result.pendingRisk, true, "pending Risk");
  equal(result.fumbleSeverity, null, "fumble severity");
});

test("Risk match after one doubling records Fumble 1 and forces total zero", () => {
  const result = rollSimple(
    20,
    new SequenceDiceSource([4, 4, 4, 4, 4, 4, 2, 3, 6]),
  );
  equal(result.fumbleSeverity, 1, "fumble severity");
  equal(result.finalTotal, 0, "final total");
  equal(result.pendingRisk, false, "pending Risk cancelled");
  equal(result.edgeAvailable, false, "Edge lost");
});

test("later fumble severity replaces earlier lower severity", () => {
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

test("roll values are calculated after checks with the correct multiplier", () => {
  const result = rollSimple(20, new SequenceDiceSource([1, 1, 1, 2, 3, 6]));
  equal(result.steps[0].rollValue, 7, "initial roll value");
  equal(result.steps[1].rollValue, 2, "doubled roll value");
  equal(result.finalRollValue, 7, "highest roll value");
  equal(result.finalTotal, 9, "final total");
});

test("skill sequence falls back to Skill 0 after supplied values are exhausted", () => {
  const sequence = new SkillSequence([40, 32, 11]);
  equal(sequence.next(), 40, "first skill");
  equal(sequence.next(), 32, "second skill");
  equal(sequence.next(), 11, "third skill");
  equal(sequence.next(), 0, "first fallback");
  equal(sequence.next(), 0, "second fallback");
});

test("a side's normal Risk belongs to that same side", () => {
  const result = rollOpposedContest(
    20,
    40,
    new SequenceDiceSource([4, 4, 4, 2, 3, 6]),
    new SequenceDiceSource([2, 3, 6]),
  );
  equal(result.riskAgainstA, true, "Risk on A");
  equal(result.riskAgainstB, false, "Risk on B");
});

test("normal Risk starts a nested contest and exhausted skill lists use Skill 0", () => {
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
  equal(result.frames[1].aSkill, 0, "nested A skill");
  equal(result.frames[1].bSkill, 0, "nested B skill");
  equal(result.frames[1].aSkillFallback, true, "nested A fallback marker");
  equal(result.frames[1].bSkillFallback, true, "nested B fallback marker");
});

test("both sides can create Risk in one frame and open one double-Risk contest", () => {
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

test("Risk flags remain cumulative in deeper contest frames and on return", () => {
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

test("nested fumble propagates outward through return values", () => {
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

test("one-sided Edge may add Risk to the opponent", () => {
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

test("optional one-sided Edge is declined when no decision callback is supplied", () => {
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

test("both sides Edge creates automatic double Risk without a callback", () => {
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

test("Edge cannot add pending Risk to a target that fumbled in that frame", () => {
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

test("five contest frames produce five resolution returns in reverse order", () => {
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

console.log("All rules-engine tests passed.");
