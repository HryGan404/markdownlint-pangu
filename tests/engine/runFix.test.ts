import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("runFix", () => {
  it("applies pangu fix and markdownlint fixes before recheck", async () => {
    const filePath = "tests/fixtures/markdown/check-input.md";
    const content = await readFile(filePath, "utf8");
    const { runFix } = await import("../../src/engine/runFix.js");
    const result = await runFix({
      filePath,
      content,
      options: {
        command: "fix",
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
          format: "text",
          quiet: false,
        },
        input: {
          stdin: false,
        },
      },
    });

    expect(result.fixedContent).toBe(
      ["# 歡迎來到 MarkdownWorld", "", "這是一個 README 文件。"].join("\n"),
    );
    expect(result.recheckDiagnostics).toEqual([]);
  });

  it("runs fixes in order: pangu -> markdownlint -> recheck", async () => {
    const callOrder: string[] = [];
    const filePath = "tests/fixtures/markdown/check-input.md";

    vi.doMock("../../src/pangu/buildSpacingPatches.js", () => ({
      buildMaskedSpacingPatchesWithDiagnostics: vi.fn(() => {
        callOrder.push("buildSpacingPatches");
        return [{ start: 0, end: 1, text: "A" }];
      }),
    }));

    vi.doMock("../../src/pangu/filterIgnoredRanges.js", () => ({
      filterIgnoredSpacingRanges: vi.fn((_markdown: string, ranges: unknown[]) => ranges),
    }));

    vi.doMock("../../src/markdown/safeRanges.js", () => ({
      collectSpacingRanges: vi.fn(() => [{ start: 0, end: 1, blocked: [] }]),
    }));

    vi.doMock("../../src/markdown/applyRangePatches.js", () => ({
      applyRangePatches: vi.fn(() => {
        callOrder.push("applyRangePatches");
        return "after-pangu";
      }),
    }));

    vi.doMock("../../src/lint/runMarkdownlint.js", () => ({
      runMarkdownlint: vi.fn(async () => {
        callOrder.push("runMarkdownlint");
        return { [filePath]: [] };
      }),
    }));

    vi.doMock("markdownlint", () => ({
      applyFixes: vi.fn(() => {
        callOrder.push("applyFixes");
        return "after-lint";
      }),
    }));

    vi.doMock("../../src/engine/runCheck.js", () => ({
      runCheck: vi.fn(async () => {
        callOrder.push("runCheck");
        return { diagnostics: [] };
      }),
    }));

    const { runFix } = await import("../../src/engine/runFix.js");
    const result = await runFix({
      filePath,
      content: "# title",
      options: {
        command: "fix",
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
          format: "text",
          quiet: false,
        },
        input: {
          stdin: false,
        },
      },
    });

    expect(callOrder).toEqual([
      "buildSpacingPatches",
      "applyRangePatches",
      "runMarkdownlint",
      "applyFixes",
      "runCheck",
    ]);
    expect(result.fixedContent).toBe("after-lint");
    expect(result.recheckDiagnostics).toEqual([]);
  });
});
