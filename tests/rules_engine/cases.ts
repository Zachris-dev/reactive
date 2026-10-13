declare const process: {
  argv: string[];
  exitCode?: number;
};

import { LogLevel } from "../../packages/rules_engine/src";
import {
  DeterministicSuite,
  runDeterministicCases,
} from "./deterministicCases";

const levels = new Set<LogLevel>(["trace", "verbose", "summary", "quiet"]);

interface CaseOptions {
  log: LogLevel;
  suite: DeterministicSuite;
}

function parseOptions(args: string[]): CaseOptions {
  let log: LogLevel = "verbose";
  let suite: DeterministicSuite = "all";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--log") {
      const value = args[i + 1];
      if (value === undefined || !levels.has(value as LogLevel)) {
        throw new Error("--log must be trace, verbose, summary, or quiet.");
      }
      log = value as LogLevel;
      i += 1;
      continue;
    }

    if (args[i] === "--suite") {
      const value = args[i + 1];
      if (value !== "roll" && value !== "result") {
        throw new Error("--suite must be roll or result.");
      }
      suite = value;
      i += 1;
      continue;
    }

    throw new Error(
      "Unknown option '" + args[i] + "'. Supported options are --log and --suite.",
    );
  }

  return { log, suite };
}

try {
  const options = parseOptions(process.argv.slice(2));
  runDeterministicCases(options.log, options.suite);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
