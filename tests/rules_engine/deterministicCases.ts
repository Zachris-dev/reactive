import {
  LogLevel,
  OpposedRollResult,
  SequenceDiceSource,
  SimpleRollResult,
  rollOpposed,
  rollSimple,
} from "../../packages/rules_engine/src";

interface CaseResult {
  id: string;
  name: string;
  details: string[];
  trace: string[];
}

interface DeterministicCase {
  id: string;
  name: string;
  run: () => CaseResult;
}

function equal<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(label + ": expected " + String(expected) + ", got " + String(actual));
  }
}

function simpleDetails(result: SimpleRollResult): string[] {
  const lines: string[] = [];
  lines.push(
    "skill=" + result.skill.supplied +
      " rounded=" + result.skill.rounded +
      " final=" + result.finalTotal,
  );
  for (const step of result.steps) {
    lines.push(
      "3d6=" + step.dice.join(",") +
        " sum=" + step.sum +
        " sum-10=" + step.signedDifference +
        " level=" + step.doublingLevel +
        " x" + step.multiplier +
        " risk/fumble=" + step.riskMatch +
        " edge=" + step.edgeMatch +
        " triple=" + step.isTriple +
        " rollValue=" + (step.rollValue === null ? "-" : step.rollValue),
    );
  }
  lines.push(
    "pendingRisk=" + result.pendingRisk +
      " edge=" + result.edgeAvailable +
      " fumble=" + (result.fumbleSeverity === null ? "none" : result.fumbleSeverity) +
      " finalRollValue=" + result.finalRollValue,
  );
  return lines;
}

function simpleTrace(result: SimpleRollResult): string[] {
  return result.events.map((event) => JSON.stringify(event));
}

function opposedDetails(result: OpposedRollResult): string[] {
  const lines: string[] = [];
  for (const frame of result.frames) {
    const label = frame.depth === 0 ? "initial" : "risk-" + frame.depth;
    lines.push(
      label +
        ": skills A/B=" +
        frame.aSkill.supplied + "->" + frame.aSkill.rounded + "/" +
        frame.bSkill.supplied + "->" + frame.bSkill.rounded +
        " enteredRisk A/B=" + frame.enteredWithRiskA + "/" + frame.enteredWithRiskB,
    );
    lines.push(
      "  A total=" + frame.contest.a.finalTotal +
        " risk=" + frame.contest.a.pendingRisk +
        " edge=" + frame.contest.a.edgeAvailable +
        " fumble=" + (frame.contest.a.fumbleSeverity === null ? "none" : frame.contest.a.fumbleSeverity) +
        " steps=" + frame.contest.a.steps.length,
    );
    lines.push(
      "  B total=" + frame.contest.b.finalTotal +
        " risk=" + frame.contest.b.pendingRisk +
        " edge=" + frame.contest.b.edgeAvailable +
        " fumble=" + (frame.contest.b.fumbleSeverity === null ? "none" : frame.contest.b.fumbleSeverity) +
        " steps=" + frame.contest.b.steps.length,
    );
    lines.push(
      "  startsRisk A/B=" + frame.riskStartedForA + "/" + frame.riskStartedForB +
        " edgeUsedBy=" + (frame.edgeUsedBy === null ? "none" : frame.edgeUsedBy),
    );
  }
  lines.push("resolution returns, deepest first:");
  for (const returned of result.returns) {
    lines.push(
      "  depth=" + returned.depth +
        " totals A/B=" + returned.aTotal + "/" + returned.bTotal +
        " Risk A/B=" + returned.riskA + "/" + returned.riskB +
        " Fumble A/B=" +
        (returned.aFumbleSeverity === null ? "none" : returned.aFumbleSeverity) +
        "/" +
        (returned.bFumbleSeverity === null ? "none" : returned.bFumbleSeverity),
    );
  }
  return lines;
}

function opposedTrace(result: OpposedRollResult): string[] {
  const lines: string[] = [];
  for (const frame of result.frames) {
    lines.push("frame depth=" + frame.depth);
    for (const event of frame.contest.a.events) {
      lines.push("A " + JSON.stringify(event));
    }
    for (const event of frame.contest.b.events) {
      lines.push("B " + JSON.stringify(event));
    }
  }
  return lines;
}

function simpleCase(
  id: string,
  name: string,
  skill: number,
  d6: number[],
  d10: number[],
  verify: (result: SimpleRollResult) => void,
): DeterministicCase {
  return {
    id,
    name,
    run: () => {
      const result = rollSimple(skill, new SequenceDiceSource(d6, d10));
      verify(result);
      return { id, name, details: simpleDetails(result), trace: simpleTrace(result) };
    },
  };
}

const CASES: DeterministicCase[] = [
  simpleCase("01", "ordinary simple roll", 40, [2, 3, 4], [], (result) => {
    equal(result.finalTotal, 5, "final total");
    equal(result.pendingRisk, false, "Risk");
    equal(result.edgeAvailable, false, "Edge");
    equal(result.fumbleSeverity, null, "fumble");
  }),

  simpleCase("02", "fractional simple roll", 33, [2, 3, 4], [2], (result) => {
    equal(result.skill.rounded, 4, "rounded skill");
    equal(result.finalTotal, 5, "final total");
  }),

  simpleCase("03", "Edge without doubling", 40, [1, 1, 2], [], (result) => {
    equal(result.edgeAvailable, true, "Edge");
    equal(result.steps.length, 1, "step count");
    equal(result.steps[0].isTriple, false, "triple");
  }),

  simpleCase("04", "Risk without doubling", 20, [3, 4, 5], [], (result) => {
    equal(result.pendingRisk, true, "Risk");
    equal(result.steps.length, 1, "step count");
    equal(result.steps[0].isTriple, false, "triple");
  }),

  simpleCase("05", "one doubling with no special result", 40, [2, 2, 2, 2, 3, 4], [], (result) => {
    equal(result.steps.length, 2, "step count");
    equal(result.steps[1].multiplier, 2, "second multiplier");
    equal(result.finalRollValue, 4, "highest roll value");
    equal(result.finalTotal, 8, "final total");
  }),

  simpleCase("06", "fumble after a doubling", 20, [2, 2, 2, 3, 4, 5], [], (result) => {
    equal(result.fumbleSeverity, 1, "fumble severity");
    equal(result.finalTotal, 0, "final total");
    equal(result.pendingRisk, false, "Risk cancelled");
    equal(result.edgeAvailable, false, "Edge lost");
  }),

  {
    id: "07",
    name: "ordinary opposed roll",
    run: () => {
      const result = rollOpposed(
        [40],
        [30],
        new SequenceDiceSource([2, 3, 4]),
        new SequenceDiceSource([2, 3, 4]),
      );
      equal(result.frames.length, 1, "frame count");
      equal(result.returns.length, 1, "return count");
      equal(result.returns[0].aTotal, 5, "A returned total");
      equal(result.returns[0].bTotal, 4, "B returned total");
      return { id: "07", name: "ordinary opposed roll", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "08",
    name: "single Risk, one nested contest, then return to initial totals",
    run: () => {
      const result = rollOpposed(
        [20, 40],
        [40, 40],
        new SequenceDiceSource([3, 4, 5, 2, 3, 4]),
        new SequenceDiceSource([2, 3, 4, 2, 3, 4]),
      );
      equal(result.frames.length, 2, "frame count");
      equal(result.frames[1].enteredWithRiskA, true, "nested A Risk");
      equal(result.riskA, true, "A Risk");
      equal(result.riskB, false, "B Risk");
      equal(result.returns.length, 2, "return count");
      equal(result.returns[0].depth, 1, "first return is Risk contest");
      equal(result.returns[1].depth, 0, "second return is original contest");
      equal(result.returns[1].aTotal, result.frames[0].contest.a.finalTotal, "A returned initial total");
      equal(result.returns[1].bTotal, result.frames[0].contest.b.finalTotal, "B returned initial total");
      return { id: "08", name: "single Risk, one nested contest, then return to initial totals", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "09",
    name: "one-sided Edge creates Risk on the opponent",
    run: () => {
      const result = rollOpposed(
        [40, 40],
        [40, 40],
        new SequenceDiceSource([1, 1, 2, 2, 3, 4]),
        new SequenceDiceSource([2, 3, 4, 2, 3, 4]),
        { edgeDecision: () => true },
      );
      equal(result.frames.length, 2, "frame count");
      equal(result.frames[0].edgeUsedBy, "A", "Edge user");
      equal(result.frames[1].enteredWithRiskB, true, "Risk against B");
      equal(result.riskB, true, "B accumulated Risk");
      return { id: "09", name: "one-sided Edge creates Risk on the opponent", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "10",
    name: "both sides Risk in the same initial contest",
    run: () => {
      const result = rollOpposed(
        [20, 40],
        [20, 40],
        new SequenceDiceSource([3, 4, 5, 2, 3, 4]),
        new SequenceDiceSource([3, 4, 5, 2, 3, 4]),
      );
      equal(result.frames.length, 2, "frame count");
      equal(result.frames[1].enteredWithRiskA, true, "nested A Risk");
      equal(result.frames[1].enteredWithRiskB, true, "nested B Risk");
      equal(result.riskA, true, "A accumulated Risk");
      equal(result.riskB, true, "B accumulated Risk");
      return { id: "10", name: "both sides Risk in the same initial contest", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "11",
    name: "both sides Edge causes automatic double Risk",
    run: () => {
      const result = rollOpposed(
        [40, 40],
        [40, 40],
        new SequenceDiceSource([1, 1, 2, 2, 3, 4]),
        new SequenceDiceSource([1, 1, 2, 2, 3, 4]),
      );
      equal(result.frames.length, 2, "frame count");
      equal(result.frames[0].contest.bothHaveEdge, true, "double Edge");
      equal(result.frames[1].enteredWithRiskA, true, "nested A Risk");
      equal(result.frames[1].enteredWithRiskB, true, "nested B Risk");
      return { id: "11", name: "both sides Edge causes automatic double Risk", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "12",
    name: "Risk inside a Risk contest creates a deeper nested contest",
    run: () => {
      const result = rollOpposed(
        [20, 40, 40],
        [40, 20, 40],
        new SequenceDiceSource([3, 4, 5, 2, 3, 4, 2, 3, 4]),
        new SequenceDiceSource([2, 3, 4, 3, 4, 5, 2, 3, 4]),
      );
      equal(result.frames.length, 3, "frame count");
      equal(result.frames[1].enteredWithRiskA, true, "first nested A Risk");
      equal(result.frames[2].enteredWithRiskA, true, "second nested retains A Risk");
      equal(result.frames[2].enteredWithRiskB, true, "second nested B Risk");
      equal(result.returns.length, 3, "return count");
      equal(result.returns[0].depth, 2, "deepest return");
      equal(result.returns[2].depth, 0, "original return");
      equal(result.riskA, true, "A accumulated Risk");
      equal(result.riskB, true, "B accumulated Risk");
      return { id: "12", name: "Risk inside a Risk contest creates a deeper nested contest", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "13",
    name: "doubling inside a nested Risk contest",
    run: () => {
      const result = rollOpposed(
        [20, 40],
        [40, 40],
        new SequenceDiceSource([3, 4, 5, 2, 2, 2, 2, 3, 4]),
        new SequenceDiceSource([2, 3, 4, 2, 3, 4]),
      );
      equal(result.frames.length, 2, "frame count");
      equal(result.frames[1].contest.a.steps.length, 2, "nested A step count");
      equal(result.frames[1].contest.a.steps[1].multiplier, 2, "nested multiplier");
      equal(result.aFumbleSeverity, null, "A fumble");
      return { id: "13", name: "doubling inside a nested Risk contest", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "14",
    name: "two doublings then Fumble 2 inside nested Risk",
    run: () => {
      const result = rollOpposed(
        [20, 20],
        [40, 40],
        new SequenceDiceSource([3, 4, 5, 2, 2, 2, 2, 2, 2, 3, 4, 5]),
        new SequenceDiceSource([2, 3, 4, 2, 3, 4]),
      );
      equal(result.frames.length, 2, "frame count");
      equal(result.frames[1].contest.a.steps.length, 3, "nested A step count");
      equal(result.aFumbleSeverity, 2, "A propagated fumble");
      equal(result.returns.length, 2, "return count");
      equal(result.returns[0].aTotal, 0, "nested A fumble total");
      equal(result.returns[1].aTotal, 0, "A propagated original total");
      equal(result.riskA, true, "already-started A Risk retained");
      return { id: "14", name: "two doublings then Fumble 2 inside nested Risk", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "15",
    name: "double Risk followed by both sides fumbling in the nested contest",
    run: () => {
      const result = rollOpposed(
        [20, 20],
        [20, 20],
        new SequenceDiceSource([3, 4, 5, 2, 2, 2, 3, 4, 5]),
        new SequenceDiceSource([3, 4, 5, 2, 2, 2, 3, 4, 5]),
      );
      equal(result.frames.length, 2, "frame count");
      equal(result.aFumbleSeverity, 1, "A fumble");
      equal(result.bFumbleSeverity, 1, "B fumble");
      equal(result.returns.length, 2, "return count");
      equal(result.returns[0].aTotal, 0, "nested A total");
      equal(result.returns[0].bTotal, 0, "nested B total");
      equal(result.returns[1].aTotal, 0, "original A propagated total");
      equal(result.returns[1].bTotal, 0, "original B propagated total");
      equal(result.riskA, true, "A accumulated Risk");
      equal(result.riskB, true, "B accumulated Risk");
      return { id: "15", name: "double Risk followed by both sides fumbling in the nested contest", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "16",
    name: "four nested Risks produce five return values",
    run: () => {
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
      equal(result.returns[0].depth, 4, "first return is deepest");
      equal(result.returns[1].depth, 3, "second return");
      equal(result.returns[2].depth, 2, "third return");
      equal(result.returns[3].depth, 1, "fourth return");
      equal(result.returns[4].depth, 0, "last return is original");
      return { id: "16", name: "four nested Risks produce five return values", details: opposedDetails(result), trace: opposedTrace(result) };
    },
  },

  {
    id: "17",
    name: "new fractional skills are rounded separately in a Risk contest",
    run: () => {
      const result = rollOpposed(
        [20, 33],
        [40, 27],
        new SequenceDiceSource(
          [3, 4, 5, 2, 3, 4],
          [2],
        ),
        new SequenceDiceSource(
          [2, 3, 4, 2, 3, 4],
          [8],
        ),
      );
      equal(result.frames.length, 2, "frame count");
      equal(result.frames[0].aSkill.supplied, 20, "original A supplied skill");
      equal(result.frames[0].aSkill.rounded, 2, "original A rounded skill");
      equal(result.frames[1].aSkill.supplied, 33, "Risk A supplied skill");
      equal(result.frames[1].aSkill.rounded, 4, "Risk A rounded skill");
      equal(result.frames[1].aSkill.fractionDie, 2, "Risk A fraction die");
      equal(result.frames[1].bSkill.supplied, 27, "Risk B supplied skill");
      equal(result.frames[1].bSkill.rounded, 2, "Risk B rounded skill");
      equal(result.frames[1].bSkill.fractionDie, 8, "Risk B fraction die");
      return {
        id: "17",
        name: "new fractional skills are rounded separately in a Risk contest",
        details: opposedDetails(result),
        trace: opposedTrace(result),
      };
    },
  },
];

export function runDeterministicCases(level: LogLevel = "verbose"): void {
  for (const scenario of CASES) {
    const result = scenario.run();

    if (level === "quiet") {
      continue;
    }

    if (level === "summary") {
      console.log("PASS " + result.id + " - " + result.name);
      continue;
    }

    console.log("");
    console.log("CASE " + result.id + " - " + result.name);
    for (const line of result.details) {
      console.log("  " + line);
    }

    if (level === "trace") {
      console.log("  trace:");
      for (const line of result.trace) {
        console.log("    " + line);
      }
    }

    console.log("  PASS");
  }

  console.log("");
  console.log("All " + CASES.length + " deterministic engine cases passed.");
}
