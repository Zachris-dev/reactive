declare const process: {
  argv: string[];
  exitCode?: number;
};

import {
  LogLevel,
  OpposedRollResult,
  RandomDiceSource,
  SimpleRollResult,
  rollOpposed,
  rollSimple,
  resolveOpposedReturn,
} from "../../../packages/rules_engine/src";

type EdgePolicy = "always" | "never";

interface ParsedArgs {
  command: "roll";
  aSkills: number[];
  bSkills: number[] | null;
  log: LogLevel;
  edgePolicy: EdgePolicy;
}

const LOG_LEVELS = new Set<LogLevel>(["trace", "verbose", "summary", "quiet"]);
const EDGE_POLICIES = new Set<EdgePolicy>(["always", "never"]);

function usage(): string {
  return [
    "Reactive dice tester",
    "",
    "Usage:",
    "  npm run roll -- roll 33",
    "  npm run roll -- roll 33 25",
    '  npm run roll -- roll --a-skills "40,32,11" --b-skills "36,23"',
    "",
    "Options:",
    "  --a-skills LIST   A-side skill sequence in integer tenths.",
    "  --b-skills LIST   B-side skill sequence in integer tenths.",
    "  --edge POLICY     always | never for optional one-sided Edge (default: never)",
    "  --log LEVEL       trace | verbose | summary | quiet (default: verbose)",
    "",
    "Examples:",
    "  40 means skill 4.0; 33 means skill 3.3.",
    "  Later list entries are used by nested Risk contests.",
    "  When a skill sequence is exhausted, later Risk tests use Skill 0.",
    "  Both-sides Edge is always automatic double Risk regardless of --edge.",
  ].join("\n");
}

function parseSkill(value: string): number {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`Invalid skill '${value}'. Use integer tenths, e.g. 33 for 3.3.`);
  }
  return Number(value);
}

function parseSkillList(value: string): number[] {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    throw new Error("Skill list must contain at least one value.");
  }
  return parts.map(parseSkill);
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0 || argv[0] !== "roll") {
    throw new Error(usage());
  }

  const positional: string[] = [];
  let aSkills: number[] | null = null;
  let bSkills: number[] | null = null;
  let log: LogLevel = "verbose";
  let edgePolicy: EdgePolicy = "never";

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (
      arg === "--a-skills" ||
      arg === "--b-skills" ||
      arg === "--log" ||
      arg === "--edge"
    ) {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`${arg} requires a value.`);
      }
      i += 1;

      if (arg === "--a-skills") {
        aSkills = parseSkillList(value);
      } else if (arg === "--b-skills") {
        bSkills = parseSkillList(value);
      } else if (arg === "--log") {
        if (!LOG_LEVELS.has(value as LogLevel)) {
          throw new Error(`Unknown log level '${value}'.`);
        }
        log = value as LogLevel;
      } else {
        if (!EDGE_POLICIES.has(value as EdgePolicy)) {
          throw new Error(`Unknown Edge policy '${value}'. Use always or never.`);
        }
        edgePolicy = value as EdgePolicy;
      }
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option '${arg}'.`);
    }
    positional.push(arg);
  }

  const namedSkillsUsed = aSkills !== null || bSkills !== null;
  if (namedSkillsUsed && positional.length > 0) {
    throw new Error("Do not mix positional skills with --a-skills/--b-skills.");
  }

  if (!namedSkillsUsed) {
    if (positional.length < 1 || positional.length > 2) {
      throw new Error("roll expects one or two positional skills.");
    }
    aSkills = [parseSkill(positional[0])];
    bSkills = positional.length === 2 ? [parseSkill(positional[1])] : null;
  }

  if (aSkills === null) {
    throw new Error("A-side skill is required.");
  }

  return { command: "roll", aSkills, bSkills, log, edgePolicy };
}

function formatSkill(stored: number): string {
  return (stored / 10).toFixed(1);
}

function printSimple(label: string, result: SimpleRollResult, level: LogLevel): void {
  if (level === "quiet") {
    return;
  }

  console.log(`${label}: ${result.skill.name} (${result.skill.supplied})`);

  if (level === "summary") {
    console.log(
      `  total=${result.finalTotal} risk=${result.pendingRisk} edge=${result.edgeAvailable} ` +
        `fumble=${result.fumbleSeverity ?? "none"}`,
    );
    return;
  }

  const fraction = result.skill.supplied % 10;
  if (fraction === 0) {
    console.log(`  Fractional check: none -> rounded skill ${result.skill.rounded}`);
  } else {
    console.log(
      `  Fractional check: d10=${result.skill.fractionDie}, fraction=${fraction} ` +
        `-> rounded skill ${result.skill.rounded}`,
    );
  }

  for (const step of result.steps) {
    console.log(
      `  3d6: ${step.dice.join(" ")}  sum=${step.sum}  sum-10=${step.signedDifference} ` +
        `level=${step.doublingLevel} x${step.multiplier}`,
    );
    console.log(
      `    Risk/Fumble match: ${step.riskMatch ? "yes" : "no"}; ` +
        `Edge: ${step.edgeMatch ? "yes" : "no"}; ` +
        `Triple: ${step.isTriple ? "yes" : "no"}`,
    );
    if (step.rollValue !== null) {
      console.log(`    Roll value: ${step.rollValue}`);
    }
  }

  console.log(`  Pending Risk: ${result.pendingRisk ? "yes" : "no"}`);
  console.log(`  Edge available: ${result.edgeAvailable ? "yes" : "no"}`);
  console.log(`  Fumble: ${result.fumbleSeverity === null ? "none" : result.fumbleSeverity}`);
  console.log(`  Final roll value: ${result.finalRollValue}`);
  console.log(`  Final total: ${result.finalTotal}`);

  if (level === "trace") {
    console.log("  Event trace:");
    for (const event of result.events) {
      console.log(`    ${JSON.stringify(event)}`);
    }
  }
}

function printOpposed(result: OpposedRollResult, level: LogLevel): void {
  if (level === "quiet") {
    return;
  }

  if (level === "summary") {
    console.log(
      `Opposed roll: frames=${result.frames.length} returns=${result.returns.length} ` +
        `Risk(A/B)=${result.riskA}/${result.riskB} ` +
        `Fumble(A/B)=${result.aFumbleSeverity ?? "none"}/${result.bFumbleSeverity ?? "none"}`,
    );
    for (const returned of result.returns) {
      const resolved = resolveOpposedReturn({ source: returned });
      const outcome =
        resolved.ordinary.type === "equal"
          ? "Equal"
          : resolved.ordinary.type === "carryover"
            ? `Carryover ${resolved.ordinary.side}`
            : `Success ${resolved.ordinary.side} SL ${resolved.ordinary.level}`;
      console.log(
        `  return depth ${returned.depth}: A=${returned.aTotal} B=${returned.bTotal} ` +
          `Risk=${returned.riskA}/${returned.riskB} ` +
          `Fumble=${resolved.a.fumbleSeverity ?? "none"}/${resolved.b.fumbleSeverity ?? "none"} ` +
          `source=${resolved.a.fumbleCause ?? "none"}/${resolved.b.fumbleCause ?? "none"} ` +
          `-> ${outcome}`,
      );
    }
    return;
  }

  console.log("Roll order:");
  for (const frame of result.frames) {
    console.log(frame.depth === 0 ? "Initial contest" : `Risk contest ${frame.depth}`);
    if (frame.depth > 0) {
      console.log(
        `  Entered with cumulative Risk: A=${frame.enteredWithRiskA ? "yes" : "no"}, ` +
          `B=${frame.enteredWithRiskB ? "yes" : "no"}`,
      );
    }
    if (frame.aSkillFallback) {
      console.log("  A skill list exhausted -> Skill 0");
    }
    if (frame.bSkillFallback) {
      console.log("  B skill list exhausted -> Skill 0");
    }

    printSimple("  Side A", frame.contest.a, level);
    console.log("");
    printSimple("  Side B", frame.contest.b, level);

    console.log("  Interaction:");
    if (frame.contest.bothHaveEdge) {
      console.log("    Both sides have Edge -> automatic double Risk.");
    } else if (frame.contest.oneSidedEdgeDecision !== null) {
      const offered = frame.contest.oneSidedEdgeDecision;
      const used = frame.edgeUsedBy === offered.sideWithEdge;
      console.log(
        `    Side ${offered.sideWithEdge} Edge against ${offered.target}: ` +
          (used ? "used" : "declined by Edge policy"),
      );
    }
    console.log(`    New Risk on A: ${frame.riskStartedForA ? "yes" : "no"}`);
    console.log(`    New Risk on B: ${frame.riskStartedForB ? "yes" : "no"}`);
    console.log("");
  }

  console.log("Resolution return order (deepest first):");
  result.returns.forEach((returned, index) => {
    const label =
      returned.depth === 0 ? "original contest" : `Risk contest ${returned.depth}`;
    console.log(`  Return ${index + 1}: ${label}`);
    console.log(`    A total: ${returned.aTotal}`);
    console.log(`    B total: ${returned.bTotal}`);
    console.log(
      `    Risk A/B: ${returned.riskA ? "yes" : "no"}/${returned.riskB ? "yes" : "no"}`,
    );
    const resolved = resolveOpposedReturn({ source: returned });
    console.log(
      `    Fumble A/B: ${resolved.a.fumbleSeverity ?? "none"}/${resolved.b.fumbleSeverity ?? "none"}`,
    );
    console.log(
      `    Fumble source A/B: ${resolved.a.fumbleCause ?? "none"}/${resolved.b.fumbleCause ?? "none"}`,
    );
    if (resolved.ordinary.type === "equal") {
      console.log("    Result: Equal");
    } else if (resolved.ordinary.type === "carryover") {
      console.log(`    Result: Carryover to side ${resolved.ordinary.side}`);
    } else {
      console.log(
        `    Result: Success for side ${resolved.ordinary.side}, SL ${resolved.ordinary.level}`,
      );
    }

    for (const effect of resolved.effects) {
      console.log(
        `    Effect on ${effect.sufferedBy}: SL ${effect.level} (${effect.cause}` +
          (effect.fumbleCause === null ? ")" : `, fumble=${effect.fumbleCause})`),
      );
    }
  });
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (args.log !== "quiet") {
      console.log("Reactive dice tester");
      console.log(`A skills: ${args.aSkills.join(", ")}`);
      if (args.bSkills !== null) {
        console.log(`B skills: ${args.bSkills.join(", ")}`);
        console.log(`One-sided Edge policy: ${args.edgePolicy}`);
      }
      console.log(`Log level: ${args.log}`);
      console.log("");
    }

    if (args.bSkills === null) {
      const result = rollSimple(args.aSkills[0], new RandomDiceSource());
      printSimple("Roll", result, args.log);
      return;
    }

    const result = rollOpposed(
      args.aSkills,
      args.bSkills,
      new RandomDiceSource(),
      new RandomDiceSource(),
      {
        edgeDecision: () => args.edgePolicy === "always",
      },
    );
    printOpposed(result, args.log);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

main();
