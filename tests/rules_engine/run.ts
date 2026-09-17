import {
  SequenceDiceSource,
  SkillSequence,
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

console.log("All rules-engine tests passed.");
