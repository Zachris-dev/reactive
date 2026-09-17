declare const process: {
  argv: string[];
  exitCode?: number;
};

import {
  LogLevel,
  OpposedContestResult,
  RandomDiceSource,
  SimpleRollResult,
  SkillSequence,
  rollOpposedContest,
  rollSimple,
} from "../../../packages/rules_engine/src";

interface ParsedArgs {
  command: "roll";
  aSkills: number[];
  bSkills: number[] | null;
  log: LogLevel;
}

const LOG_LEVELS = new Set<LogLevel>(["trace", "verbose", "summary", "quiet"]);

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
    "  --log LEVEL       trace | verbose | summary | quiet (default: verbose)",
    "",
    "Examples:",
    "  40 means skill 4.0; 33 means skill 3.3.",
    "  Later list entries are reserved for nested Risk contests.",
    "  When a skill sequence is exhausted, later Risk tests use Skill 0.",
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

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--a-skills" || arg === "--b-skills" || arg === "--log") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`${arg} requires a value.`);
      }
      i += 1;

      if (arg === "--a-skills") {
        aSkills = parseSkillList(value);
      } else if (arg === "--b-skills") {
        bSkills = parseSkillList(value);
      } else {
        if (!LOG_LEVELS.has(value as LogLevel)) {
          throw new Error(`Unknown log level '${value}'.`);
        }
        log = value as LogLevel;
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

  return { command: "roll", aSkills, bSkills, log };
}

function formatSkill(stored: number): string {
  return (stored / 10).toFixed(1);
}

function printSimple(label: string, result: SimpleRollResult, level: LogLevel): void {
  if (level === "quiet") {
    return;
  }

  console.log(`${label}: skill ${formatSkill(result.skill.storedSkill)} (${result.skill.storedSkill})`);

  if (level === "summary") {
    console.log(
      `  total=${result.finalTotal} risk=${result.pendingRisk} edge=${result.edgeAvailable} ` +
        `fumble=${result.fumbleSeverity ?? "none"}`,
    );
    return;
  }

  if (result.skill.fraction === 0) {
    console.log(`  Fractional check: none -> rounded skill ${result.skill.roundedSkill}`);
  } else {
    console.log(
      `  Fractional check: d10=${result.skill.fractionDie}, fraction=${result.skill.fraction} ` +
        `-> rounded skill ${result.skill.roundedSkill}`,
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

function printOpposed(result: OpposedContestResult, level: LogLevel): void {
  printSimple("Side A", result.a, level);
  if (level !== "quiet") {
    console.log("");
  }
  printSimple("Side B", result.b, level);

  if (level === "quiet") {
    return;
  }

  console.log("");
  console.log("Opposed interaction:");
  console.log(`  Risk against A: ${result.riskAgainstA ? "yes" : "no"}`);
  console.log(`  Risk against B: ${result.riskAgainstB ? "yes" : "no"}`);
  console.log(`  Both sides have Edge: ${result.bothHaveEdge ? "yes" : "no"}`);
  if (result.oneSidedEdgeDecision !== null) {
    console.log(
      `  Edge decision required: Side ${result.oneSidedEdgeDecision.sideWithEdge} may add Risk ` +
        `against Side ${result.oneSidedEdgeDecision.target}.`,
    );
  }
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const aSequence = new SkillSequence(args.aSkills);
    const aSkill = aSequence.next();

    if (args.log !== "quiet") {
      console.log("Reactive dice tester");
      console.log(`A skills: ${args.aSkills.join(", ")}`);
      if (args.bSkills !== null) {
        console.log(`B skills: ${args.bSkills.join(", ")}`);
      }
      console.log(`Log level: ${args.log}`);
      console.log("");
    }

    if (args.bSkills === null) {
      const result = rollSimple(aSkill, new RandomDiceSource());
      printSimple("Roll", result, args.log);
      return;
    }

    const bSequence = new SkillSequence(args.bSkills);
    const bSkill = bSequence.next();
    const result = rollOpposedContest(
      aSkill,
      bSkill,
      new RandomDiceSource(),
      new RandomDiceSource(),
    );
    printOpposed(result, args.log);

    if (args.log !== "quiet") {
      if (aSequence.remaining().length > 0 || bSequence.remaining().length > 0) {
        console.log("");
        console.log(
          "Remaining supplied skills are retained conceptually for nested Risk contests; " +
            "the higher-level Risk state machine is the next implementation step.",
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

main();
