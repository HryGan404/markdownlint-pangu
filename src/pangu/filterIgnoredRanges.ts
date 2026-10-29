import type { SpacingRange } from "../markdown/safeRanges.js";

interface Range {
  start: number;
  end: number;
}

interface IgnoreOptions {
  ignorePatterns: string[];
  ignoreBlocks: string[];
}

export function filterIgnoredRanges(
  markdown: string,
  ranges: Range[],
  options: IgnoreOptions,
): Range[] {
  const ignorePatterns = sanitizeTokens(options.ignorePatterns);
  const ignoreBlocks = sanitizeTokens(options.ignoreBlocks);

  const filtered: Range[] = [];

  for (const range of ranges) {
    const text = markdown.slice(range.start, range.end);
    if (matchesAnyToken(text, ignoreBlocks)) {
      continue;
    }

    const ignoredSpans = collectIgnoredSpans(text, ignorePatterns);
    if (ignoredSpans.length === 0) {
      filtered.push(range);
      continue;
    }

    let cursor = 0;
    for (const span of ignoredSpans) {
      if (cursor < span.start) {
        filtered.push({
          start: range.start + cursor,
          end: range.start + span.start,
        });
      }
      cursor = span.end;
    }

    if (cursor < text.length) {
      filtered.push({
        start: range.start + cursor,
        end: range.start + text.length,
      });
    }
  }

  return filtered.filter((range) => range.start < range.end);
}

export function filterIgnoredSpacingRanges(
  markdown: string,
  ranges: SpacingRange[],
  options: IgnoreOptions,
): SpacingRange[] {
  const ignorePatterns = sanitizeTokens(options.ignorePatterns);
  const ignoreBlocks = sanitizeTokens(options.ignoreBlocks);
  const filtered: SpacingRange[] = [];

  for (const range of ranges) {
    const text = markdown.slice(range.start, range.end);
    if (matchesAnyToken(text, ignoreBlocks)) {
      continue;
    }

    const ignoredSpans = collectIgnoredSpans(text, ignorePatterns);
    if (ignoredSpans.length === 0) {
      filtered.push(range);
      continue;
    }
    filtered.push({
      ...range,
      blocked: [
        ...range.blocked,
        ...ignoredSpans.map((span) => ({
          start: range.start + span.start,
          end: range.start + span.end,
          allowInsertionAtBoundary: false,
        })),
      ],
    });
  }

  return filtered.filter((range) => range.start < range.end);
}

function sanitizeTokens(tokens: string[]): string[] {
  return tokens.map((token) => token.trim()).filter((token) => token.length > 0);
}

function matchesAnyToken(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function collectIgnoredSpans(
  text: string,
  tokens: string[],
): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];

  for (const token of tokens) {
    let fromIndex = 0;
    while (fromIndex < text.length) {
      const start = text.indexOf(token, fromIndex);
      if (start === -1) {
        break;
      }

      spans.push({
        start,
        end: start + token.length,
      });
      fromIndex = start + token.length;
    }
  }

  if (spans.length === 0) {
    return [];
  }

  spans.sort((left, right) => left.start - right.start || left.end - right.end);

  const merged = [spans[0]!];
  for (const span of spans.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
      continue;
    }

    merged.push({ ...span });
  }

  return merged;
}
