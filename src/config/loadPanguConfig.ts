import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { ConfigError } from "../shared/errors.js";
import type { PanguConfig } from "../shared/types.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPanguFile(path: string): Promise<PanguConfig> {
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new ConfigError(`Failed to load pangu config from ${path}`, { cause: error as Error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(`Failed to load pangu config from ${path}`, { cause: error as Error });
  }

  return validatePanguConfig(parsed, path);
}

export async function loadPanguConfig(path?: string, cwd = process.cwd()): Promise<PanguConfig> {
  if (path) {
    return readPanguFile(path);
  }

  const defaultPath = join(cwd, ".markdownlint-pangu.json");

  if (!(await fileExists(defaultPath))) {
    return {};
  }

  return readPanguFile(defaultPath);
}

function validatePanguConfig(value: unknown, path: string): PanguConfig {
  if (!isRecord(value)) {
    throw invalidConfig(path, "root", "must be an object");
  }

  if (value.pangu === undefined) {
    return {};
  }

  if (!isRecord(value.pangu)) {
    throw invalidConfig(path, "pangu", "must be an object");
  }

  const pangu = value.pangu;
  if (pangu.enabled !== undefined && typeof pangu.enabled !== "boolean") {
    throw invalidConfig(path, "pangu.enabled", "must be a boolean");
  }

  if (
    pangu.ignorePatterns !== undefined &&
    !isStringArray(pangu.ignorePatterns)
  ) {
    throw invalidConfig(path, "pangu.ignorePatterns", "must be an array of strings");
  }

  if (
    pangu.ignoreBlocks !== undefined &&
    !isStringArray(pangu.ignoreBlocks)
  ) {
    throw invalidConfig(path, "pangu.ignoreBlocks", "must be an array of strings");
  }

  return {
    pangu: {
      enabled: pangu.enabled,
      ignorePatterns: pangu.ignorePatterns,
      ignoreBlocks: pangu.ignoreBlocks,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function invalidConfig(path: string, field: string, detail: string): ConfigError {
  return new ConfigError(
    `Invalid pangu config from ${path}: ${field} ${detail}.`,
  );
}
