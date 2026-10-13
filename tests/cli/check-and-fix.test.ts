import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const spawnOptions = {
  cwd: process.cwd(),
  encoding: "utf8" as const,
};

const LONG_LINE =
  "This line has many short words that continue far beyond the eighty column limit for markdownlint.";

describe("CLI check/fix", () => {
  it("checks and fixes a Markdown file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-cli-"));
    const filePath = join(cwd, "README.md");

    await writeFile(filePath, "# 歡迎來到MarkdownWorld\n\n這是一個README文件。", "utf8");

    const check = spawnSync(
      "node",
      ["dist/cli/index.js", "check", filePath],
      spawnOptions,
    );
    expect(check.status).toBe(1);
    expect(check.stdout).toContain("pangu/spacing");

    const fix = spawnSync(
      "node",
      ["dist/cli/index.js", "fix", filePath],
      spawnOptions,
    );
    expect(fix.status).toBe(0);

    const content = await readFile(filePath, "utf8");
    expect(content).toContain("歡迎來到 MarkdownWorld");
    expect(content).toContain("README 文件");
  });

  it("checks markdown from stdin", () => {
    const result = spawnSync(
      "node",
      [
        "dist/cli/index.js",
        "check",
        "--stdin",
        "--stdin-filepath",
        "README.md",
      ],
      {
        ...spawnOptions,
        input: "# 歡迎來到MarkdownWorld\n",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("pangu/spacing");
  });

  it("prints machine-readable diagnostics with --format json", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-cli-json-"));
    const filePath = join(cwd, "README.md");

    await writeFile(filePath, "# 歡迎來到MarkdownWorld\n", "utf8");

    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "check", filePath, "--format", "json"],
      spawnOptions,
    );

    expect(result.status).toBe(1);

    const parsed = JSON.parse(result.stdout) as Array<{
      source: string;
      rule: string;
      filePath: string;
    }>;

    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]?.source).toBe("pangu");
    expect(parsed[0]?.rule).toBe("pangu/spacing");
    expect(parsed[0]?.filePath).toBe(filePath);
  });

  it("applies --rules to markdownlint checks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-cli-rules-"));
    const filePath = join(cwd, "RULES.md");

    await writeFile(filePath, "# Title\n\nLine with trailing space \n", "utf8");

    const baseline = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--pangu-off", filePath],
      spawnOptions,
    );
    expect(baseline.status).toBe(1);
    expect(baseline.stdout).toContain("MD009");

    const withRules = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--pangu-off", "--rules", "MD041", filePath],
      spawnOptions,
    );

    expect(withRules.status).toBe(0);
    expect(withRules.stdout).not.toContain("MD009");
  });

  it("ignores markdownlint line length by default", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-cli-line-length-"));
    const filePath = join(cwd, "LINE_LENGTH.md");

    await writeFile(filePath, `# Title\n\n${LONG_LINE}\n`, "utf8");

    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--pangu-off", filePath],
      spawnOptions,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("MD013");
  });

  it("allows markdownlint line length when explicitly selected", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-cli-line-length-rules-"));
    const filePath = join(cwd, "LINE_LENGTH_RULES.md");

    await writeFile(filePath, `# Title\n\n${LONG_LINE}\n`, "utf8");

    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--pangu-off", "--rules", "MD013", filePath],
      spawnOptions,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MD013");
  });

  it.each(["line_length", "line-length"])(
    "respects the %s alias of MD013 in config",
    async (alias) => {
      const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-cli-line-length-config-"));
      const filePath = join(cwd, "LINE_LENGTH.md");
      const configPath = join(cwd, ".markdownlint.json");

      await writeFile(filePath, `# Title\n\n${LONG_LINE}\n`, "utf8");
      await writeFile(configPath, JSON.stringify({ [alias]: true }, null, 2), "utf8");

      const result = spawnSync(
        "node",
        ["dist/cli/index.js", "check", "--pangu-off", "--config", configPath, filePath],
        spawnOptions,
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("MD013");
    },
  );

  it("applies --disable to markdownlint checks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-cli-disable-"));
    const filePath = join(cwd, "DISABLE.md");

    await writeFile(filePath, "# Title\n\nLine with trailing space \n", "utf8");

    const baseline = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--pangu-off", filePath],
      spawnOptions,
    );
    expect(baseline.status).toBe(1);
    expect(baseline.stdout).toContain("MD009");

    const withDisable = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--pangu-off", "--disable", "MD009", filePath],
      spawnOptions,
    );

    expect(withDisable.status).toBe(0);
    expect(withDisable.stdout).not.toContain("MD009");
  });

  it("keeps fix --stdin stdout clean from diagnostics", () => {
    const result = spawnSync(
      "node",
      [
        "dist/cli/index.js",
        "fix",
        "--stdin",
        "--stdin-filepath",
        "README.md",
        "--markdownlint-off",
      ],
      {
        ...spawnOptions,
        input: "# 歡迎來到MarkdownWorld\n",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("# 歡迎來到 MarkdownWorld\n");
    expect(result.stdout).not.toContain("pangu/spacing");
    expect(result.stderr).toBe("");
  });

  it("does not write partially fixed files when recheck still fails", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "markdownlint-pangu-cli-no-partial-"));
    const filePath = join(cwd, "PARTIAL.md");
    const original = "textREADME文本 \n";

    await writeFile(filePath, original, "utf8");

    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "fix", "--pangu-off", filePath],
      spawnOptions,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MD041");
    expect(await readFile(filePath, "utf8")).toBe(original);
  });

  it("returns 2 when no files match the pattern", () => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "no-such-dir/**/*.md"],
      spawnOptions,
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("No files matched the provided patterns.");
  });

  it("returns 2 when --stdin is missing --stdin-filepath", () => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--stdin"],
      { ...spawnOptions, input: "text\n" },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--stdin requires --stdin-filepath");
  });

  it("returns 2 when paths are passed together with --stdin", () => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--stdin", "--stdin-filepath", "a.md", "extra.md"],
      { ...spawnOptions, input: "text\n" },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Do not pass file paths when using --stdin.");
  });

  it("returns 1 for a commander parse error such as an unknown option", () => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--bogus", "README.md"],
      spawnOptions,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown option");
  });

  it("returns 1 for an invalid --format value", () => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "check", "--format", "xml", "README.md"],
      spawnOptions,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--format");
  });

  it("returns 1 from fix --stdin when diagnostics remain", () => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "fix", "--stdin", "--stdin-filepath", "a.md", "--pangu-off"],
      { ...spawnOptions, input: "textREADME文本\n" },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("textREADME文本\n");
    expect(result.stderr).toContain("MD041");
  });
});
