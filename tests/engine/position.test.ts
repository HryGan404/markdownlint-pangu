import { describe, expect, it } from "vitest";

import { runCheck } from "../../src/engine/runCheck.js";

function options() {
  return {
    command: "check" as const,
    cwd: process.cwd(),
    markdownlint: {
      enabled: false,
      config: {},
    },
    pangu: {
      enabled: true,
      ignorePatterns: [],
      ignoreBlocks: [],
    },
    output: {
      format: "text" as const,
      quiet: false,
    },
    input: {
      stdin: false,
    },
  };
}

describe("pangu diagnostic positions", () => {
  it.each([
    ["CRLF", "x\r\n中文ABC\r\n", 2, 3],
    ["CR", "x\r中文ABC\r", 2, 3],
    ["surrogate", "😀中文ABC\n", 1, 5],
    ["BOM", "\uFEFF中文ABC\n", 1, 4],
  ])("maps %s offsets to line and column", async (_label, content, line, column) => {
    const result = await runCheck({
      filePath: "a.md",
      content,
      options: options(),
    });
    const diagnostic = result.diagnostics.find((item) => item.source === "pangu");

    expect(diagnostic).toMatchObject({ line, column });
  });
});
