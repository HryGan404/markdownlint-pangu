import fg from "fast-glob";

import { CliUsageError } from "./errors.js";

export async function expandMarkdownPaths(patterns: string[]): Promise<string[]> {
  if (patterns.some((pattern) => pattern.trim().length === 0)) {
    throw new CliUsageError("Input paths must not be empty.");
  }

  return fg(patterns, {
    onlyFiles: true,
    unique: true,
  });
}
