#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";

import { runCheckCommand } from "./commands/check.js";
import { runFixCommand } from "./commands/fix.js";
import {
  DEFAULT_OUTPUT_FORMAT,
  OUTPUT_FORMATS,
  type CliOptions,
  type OutputFormat,
} from "../shared/types.js";
import { CliUsageError, ConfigError } from "../shared/errors.js";

const program = new Command();
const outputFormatList = OUTPUT_FORMATS.join("|");
const outputFormatErrorList = OUTPUT_FORMATS.join(", ");

program
  .name("markdownlint-pangu")
  .description("markdownlint wrapper with safe pangu spacing for Markdown")
  .option("-V, --version", "output the version number");

program.on("option:version", () => {
  process.stdout.write(`${readPackageVersion()}\n`);
  process.exit(0);
});

const checkCommand = program
  .command("check")
  .description("Check Markdown files")
  .argument("[paths...]", "Markdown files or glob patterns");

addCommonOptions(checkCommand)
  .action(async (paths: string[], commandOptions: CommanderCliOptions) => {
    process.exitCode = await runCheckCommand({
      paths,
      cli: normalizeCliOptions(commandOptions),
    });
  });

const fixCommand = program
  .command("fix")
  .description("Fix spacing and markdownlint issues")
  .argument("[paths...]", "Markdown files or glob patterns");

addCommonOptions(fixCommand)
  .action(async (paths: string[], commandOptions: CommanderCliOptions) => {
    process.exitCode = await runFixCommand({
      paths,
      cli: normalizeCliOptions(commandOptions),
    });
  });

void program.parseAsync().catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }

  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  process.stderr.write("Unknown error\n");
  process.exit(1);
});

interface CommanderCliOptions {
  config?: string;
  panguConfig?: string;
  format?: OutputFormat;
  panguOff?: boolean;
  markdownlintOff?: boolean;
  quiet?: boolean;
  stdin?: boolean;
  stdinFilepath?: string;
  rules?: string[];
  disable?: string[];
}

function addCommonOptions(command: Command): Command {
  return command
    .option("--config <path>", "Path to markdownlint config")
    .option("--pangu-config <path>", "Path to pangu config file")
    .option(
      `--format <${outputFormatList}>`,
      "Output format",
      parseOutputFormat,
      DEFAULT_OUTPUT_FORMAT,
    )
    .option("--pangu-off", "Disable pangu checks and fixes")
    .option("--markdownlint-off", "Disable markdownlint checks and fixes")
    .option("--quiet", "Do not print diagnostics")
    .option("--stdin", "Read Markdown content from stdin")
    .option("--stdin-filepath <path>", "Virtual file path used for stdin input")
    .option(
      "--rules <items>",
      "Only enable specified markdownlint rules (comma-separated)",
      parseCommaSeparatedList,
    )
    .option(
      "--disable <items>",
      "Disable markdownlint rules (comma-separated)",
      parseCommaSeparatedList,
    );
}

function normalizeCliOptions(input: CommanderCliOptions): CliOptions {
  return {
    configPath: input.config,
    panguConfigPath: input.panguConfig,
    format: input.format,
    panguOff: input.panguOff,
    markdownlintOff: input.markdownlintOff,
    quiet: input.quiet,
    stdin: input.stdin,
    stdinFilepath: input.stdinFilepath,
    rules: input.rules,
    disable: input.disable,
  };
}

function parseOutputFormat(value: string): OutputFormat {
  if (isOutputFormat(value)) {
    return value;
  }

  throw new InvalidArgumentError(
    `Expected --format to be one of: ${outputFormatErrorList}`,
  );
}

function isOutputFormat(value: string): value is OutputFormat {
  return OUTPUT_FORMATS.includes(value as OutputFormat);
}

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("Unable to read package version");
  }

  return packageJson.version;
}
