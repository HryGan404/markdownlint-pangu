import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { runCheck } from "../../src/engine/runCheck.js";

function createCheckOptions() {
  return {
    command: "check" as const,
    cwd: process.cwd(),
    markdownlint: {
      enabled: true,
      config: {
        default: false,
        MD009: true,
      },
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

describe("runCheck", () => {
  it("reports both pangu and markdownlint diagnostics", async () => {
    const filePath = "tests/fixtures/markdown/check-input.md";
    const content = await readFile(filePath, "utf8");
    const result = await runCheck({
      filePath,
      content,
      options: createCheckOptions(),
    });

    expect(result.diagnostics.some((item) => item.source === "pangu")).toBe(true);
    expect(result.diagnostics.some((item) => item.source === "markdownlint")).toBe(true);
  });

  it("reports pangu diagnostics at first missing-space positions in fixture", async () => {
    const filePath = "tests/fixtures/markdown/check-input.md";
    const content = await readFile(filePath, "utf8");
    const result = await runCheck({
      filePath,
      content,
      options: createCheckOptions(),
    });

    const panguDiagnostics = result.diagnostics.filter((item) => item.source === "pangu");
    expect(panguDiagnostics).toHaveLength(2);
    expect(
      panguDiagnostics.map((item) => ({
        line: item.line,
        column: item.column,
      })),
    ).toEqual([
      { line: 1, column: 7 },
      { line: 3, column: 5 },
    ]);
  });

  it("reports pangu diagnostics on the actual line in multi-line paragraphs", async () => {
    const filePath = "tests/fixtures/markdown/multiline.md";
    const content = "A\r\n中文ABC";
    const result = await runCheck({
      filePath,
      content,
      options: createCheckOptions(),
    });

    const panguDiagnostics = result.diagnostics.filter((item) => item.source === "pangu");
    expect(panguDiagnostics).toHaveLength(1);
    expect(panguDiagnostics[0]).toMatchObject({
      line: 2,
      column: 3,
    });
  });

  it("reports CR-only line endings at the correct line and column", async () => {
    const filePath = "tests/fixtures/markdown/cr.md";
    const content = "plain\r中文ABC";
    const result = await runCheck({
      filePath,
      content,
      options: createCheckOptions(),
    });

    const panguDiagnostics = result.diagnostics.filter((item) => item.source === "pangu");
    expect(panguDiagnostics).toHaveLength(1);
    expect(panguDiagnostics[0]).toMatchObject({
      line: 2,
      column: 3,
    });
  });

  it("respects ignorePatterns and ignoreBlocks when checking pangu diagnostics", async () => {
    const filePath = "tests/fixtures/markdown/check-input.md";
    const content = await readFile(filePath, "utf8");
    const result = await runCheck({
      filePath,
      content,
      options: {
        ...createCheckOptions(),
        markdownlint: {
          enabled: false,
          config: {},
        },
        pangu: {
          enabled: true,
          ignorePatterns: ["MarkdownWorld"],
          ignoreBlocks: ["README"],
        },
      },
    });

    expect(result.diagnostics).toEqual([]);
  });
});
