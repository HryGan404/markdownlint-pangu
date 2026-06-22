import type { LintResults } from "markdownlint";
import { lint } from "markdownlint/promise";

interface MarkdownlintRuleOptions {
  rules?: string[];
  disable?: string[];
}

const DEFAULT_DISABLED_RULES = [
  {
    name: "MD013",
    aliases: ["line-length", "line_length"],
  },
];

export async function runMarkdownlint(
  filePath: string,
  content: string,
  config: Record<string, unknown>,
  ruleOptions: MarkdownlintRuleOptions = {},
): Promise<LintResults> {
  const effectiveConfig = resolveMarkdownlintConfig(config, ruleOptions);

  return lint({
    config: effectiveConfig,
    strings: {
      [filePath]: content,
    },
  });
}

function resolveMarkdownlintConfig(
  config: Record<string, unknown>,
  ruleOptions: MarkdownlintRuleOptions,
): Record<string, unknown> {
  const rules = sanitizeRuleNames(ruleOptions.rules);
  const disable = sanitizeRuleNames(ruleOptions.disable);

  const nextConfig: Record<string, unknown> =
    rules.length > 0
      ? buildRulesOnlyConfig(config, rules)
      : withDefaultDisabledRules(config);

  for (const ruleName of disable) {
    nextConfig[ruleName] = false;
  }

  return nextConfig;
}

function withDefaultDisabledRules(config: Record<string, unknown>): Record<string, unknown> {
  const nextConfig = { ...config };

  for (const rule of DEFAULT_DISABLED_RULES) {
    if (!hasRuleConfig(config, rule.name, rule.aliases)) {
      nextConfig[rule.name] = false;
    }
  }

  return nextConfig;
}

function hasRuleConfig(
  config: Record<string, unknown>,
  ruleName: string,
  aliases: string[],
): boolean {
  const names = new Set([ruleName, ...aliases].map((name) => name.toUpperCase()));

  return Object.keys(config).some((key) => names.has(key.toUpperCase()));
}

function buildRulesOnlyConfig(
  config: Record<string, unknown>,
  rules: string[],
): Record<string, unknown> {
  const nextConfig: Record<string, unknown> = {
    default: false,
  };

  for (const ruleName of rules) {
    if (Object.hasOwn(config, ruleName)) {
      nextConfig[ruleName] = config[ruleName];
      continue;
    }

    nextConfig[ruleName] = true;
  }

  return nextConfig;
}

function sanitizeRuleNames(value?: string[]): string[] {
  if (!value || value.length === 0) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const ruleName = item.trim();
    if (ruleName.length > 0) {
      unique.add(ruleName);
    }
  }

  return [...unique];
}
