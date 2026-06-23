import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

const spawnOptions = {
  cwd: process.cwd(),
  encoding: "utf8",
};

describe("CLI smoke tests", () => {
  it("prints help with check and fix commands from dist", () => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "--help"],
      spawnOptions,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("markdownlint-pangu");
    expect(result.stdout).toContain("-V, --version");
    expect(result.stdout).toContain("check");
    expect(result.stdout).toContain("fix");
  });

  it.each(["check", "fix"])("prints shared options for %s", (command) => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", command, "--help"],
      spawnOptions,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--format <text|json>");
    expect(result.stdout).toContain("--stdin-filepath <path>");
    expect(result.stdout).toContain("--rules <items>");
    expect(result.stdout).toContain("--disable <items>");
  });

  it("prints the package version from dist", () => {
    const result = spawnSync(
      "node",
      ["dist/cli/index.js", "--version"],
      spawnOptions,
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  it("fails fast when check has no input", () => {
    const result = spawnSync("node", ["dist/cli/index.js", "check"], spawnOptions);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("No input paths");
  });
});
