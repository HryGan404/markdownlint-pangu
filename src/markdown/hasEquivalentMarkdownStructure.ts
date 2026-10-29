import type { Content, Root } from "mdast";

import { parseMarkdown } from "./parseMarkdown.js";

export function hasEquivalentMarkdownStructure(
  original: string,
  candidate: string,
): boolean {
  return (
    serializeMarkdownStructure(parseMarkdown(original)) ===
    serializeMarkdownStructure(parseMarkdown(candidate))
  );
}

function serializeMarkdownStructure(tree: Root): string {
  return JSON.stringify(canonicalizeNode(tree));
}

function canonicalizeNode(node: Root | Content): unknown {
  return canonicalizeValue(node);
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const type = record.type;
    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(record)) {
      if (key === "position") {
        continue;
      }

      if (
        key === "value" &&
        (type === "text" || type === "code" || type === "inlineCode") &&
        typeof entry === "string"
      ) {
        result[key] = entry.replaceAll(" ", "");
        continue;
      }

      if (key === "alt" && (type === "image" || type === "imageReference") && typeof entry === "string") {
        result[key] = entry.replaceAll(" ", "");
        continue;
      }

      result[key] = canonicalizeValue(entry);
    }

    return result;
  }

  return value;
}
