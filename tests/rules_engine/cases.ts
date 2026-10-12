declare const process: {
  argv: string[];
  exitCode?: number;
};

import { LogLevel } from "../../packages/rules_engine/src";
import { runDeterministicCases } from "./deterministicCases";

const levels = new Set<LogLevel>(["trace", "verbose", "summary", "quiet"]);

function parseLog(args: string[]): LogLevel {
  let level: LogLevel = "verbose";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--log") {
      throw new Error("Unknown option '" + args[i] + "'. Only --log is supported.");
    }

    const value = args[i + 1];
    if (value === undefined || !levels.has(value as LogLevel)) {
      throw new Error("--log must be trace, verbose, summary, or quiet.");
    }

    level = value as LogLevel;
    i += 1;
  }

  return level;
}

try {
  runDeterministicCases(parseLog(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
