import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { ConfigError } from "../../src/shared/errors.js";
import { loadMarkdownlintConfig } from "../../src/config/loadMarkdownlintConfig.js";
import { loadPanguConfig } from "../../src/config/loadPanguConfig.js";
import { mergeOptions } from "../../src/config/mergeOptions.js";

function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdownlint-pangu-config-"));
}

describe("mergeOptions", () => {
  it("prefers CLI options over config file values", async () => {
    const cwd = await makeTempDir();
    const configPath = join(cwd, ".markdownlint-pangu.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          pangu: {
            enabled: true,
            ignorePatterns: ["README"],
            ignoreBlocks: ["skip this block"],
          },
        },
        null,
        2,
      ),
    );

    const fileConfig = await loadPanguConfig(configPath);
    const merged = mergeOptions({
      command: "check",
      cwd,
      cli: {
        format: "json",
        panguOff: true,
      },
      markdownlintConfig: {},
      panguConfig: fileConfig,
    });

    expect(merged.command).toBe("check");
    expect(merged.output.format).toBe("json");
    expect(merged.pangu).toEqual({
      enabled: false,
      ignorePatterns: ["README"],
      ignoreBlocks: ["skip this block"],
    });
  });

  it("discovers default .markdownlint-pangu.json", async () => {
    const cwd = await makeTempDir();
    const configPath = join(cwd, ".markdownlint-pangu.json");

    await writeFile(
      configPath,
      JSON.stringify({ pangu: { enabled: false } }, null, 2),
    );

    const fileConfig = await loadPanguConfig(undefined, cwd);
    expect(fileConfig.pangu?.enabled).toBe(false);
  });

  it("discovers default .markdownlint.json", async () => {
    const cwd = await makeTempDir();
    const configPath = join(cwd, ".markdownlint.json");

    await writeFile(configPath, JSON.stringify({ default: true }, null, 2));

    const fileConfig = await loadMarkdownlintConfig(undefined, cwd);
    expect(fileConfig.default).toBe(true);
  });

  it("wraps invalid pangu configs as ConfigError", async () => {
    const cwd = await makeTempDir();
    const configPath = join(cwd, ".markdownlint-pangu.json");

    await writeFile(configPath, "{ invalid json }");

    await expect(loadPanguConfig(undefined, cwd)).rejects.toBeInstanceOf(ConfigError);
  });

  it("wraps missing markdownlint configs as ConfigError when path is provided", async () => {
    const cwd = await makeTempDir();
    const missingPath = join(cwd, "does-not-exist.json");

    await expect(loadMarkdownlintConfig(missingPath)).rejects.toBeInstanceOf(ConfigError);
  });

  it("does not auto-load other config file names or formats", async () => {
    const cwd = await makeTempDir();

    await writeFile(join(cwd, ".markdownlint.jsonc"), JSON.stringify({ default: false }), "utf8");
    await writeFile(join(cwd, ".markdownlint.yaml"), "default: false\n", "utf8");
    await writeFile(join(cwd, "package.json"), JSON.stringify({ markdownlint: { default: false } }), "utf8");

    expect(await loadMarkdownlintConfig(undefined, cwd)).toEqual({});
  });

  it("does not search parent directories for markdownlint config", async () => {
    const root = await makeTempDir();
    const child = join(root, "nested");
    await mkdir(child);

    await writeFile(join(root, ".markdownlint.json"), JSON.stringify({ default: false }), "utf8");

    expect(await loadMarkdownlintConfig(undefined, child)).toEqual({});
  });
});
