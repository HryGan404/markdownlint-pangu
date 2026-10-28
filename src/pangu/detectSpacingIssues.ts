import pangu from "pangu";

export interface SpacingIssue {
  original: string;
  fixed: string;
  start: number;
  end: number;
  diagnosticOffset: number;
}

interface PanguLike {
  spacingText(text: string): string;
}

interface ProtectedSpacingSyntax {
  value: string;
  delimiter: string;
  values: string[];
}

interface SyntaxToken {
  start: number;
  value: string;
}

const PAIRED_PUNCTUATION = [
  ["“", "”"],
  ["‘", "’"],
  ["「", "」"],
  ["『", "』"],
  ["《", "》"],
  ["〈", "〉"],
  ["（", "）"],
  ["【", "】"],
  ["〔", "〕"],
] as const;

export function detectSpacingIssue(text: string, start: number, end: number): SpacingIssue | null {
  const protectedText = protectSpacingSyntax(text);
  const rawFixed = restoreSpacingSyntax(
    (pangu as unknown as PanguLike).spacingText(protectedText.value),
    protectedText,
  );
  const afterSlash = preserveOriginalSlashSpacing(text, rawFixed);
  const fixed = preserveOriginalPairedPunctuationSpacing(text, afterSlash);
  if (fixed === text) {
    return null;
  }
  const firstDiffIndex = findFirstDiffIndex(text, fixed);

  return {
    original: text,
    fixed,
    start,
    end,
    diagnosticOffset: start + firstDiffIndex,
  };
}

function findFirstDiffIndex(original: string, fixed: string): number {
  const limit = Math.min(original.length, fixed.length);
  for (let index = 0; index < limit; index += 1) {
    if (original[index] !== fixed[index]) {
      return index;
    }
  }

  return limit;
}

function protectSpacingSyntax(text: string): ProtectedSpacingSyntax {
  const values: string[] = [];
  const protectedTokens: SyntaxToken[] = [];
  const delimiter = choosePlaceholderDelimiter(text);

  for (let index = 0; index < text.length; index += 1) {
    const previous = text[index - 1];
    const current = text[index];
    const next = text[index + 1];

    if (
      current === "(" &&
      previous != null &&
      next != null &&
      isAsciiLetterOrDigit(previous) &&
      isAsciiLetterOrDigit(next)
    ) {
      protectedTokens.push({ start: index, value: current });
    }
  }

  const doubleAsterisks = collectUnescapedDoubleAsteriskIndices(text);
  const protectedDoubleAsterisks = new Set<number>();

  for (let index = doubleAsterisks.length - 1; index > 0; index -= 1) {
    const closeIndex = doubleAsterisks[index]!;
    if (protectedDoubleAsterisks.has(closeIndex)) {
      continue;
    }

    const openIndex = findPreviousUnprotectedDoubleAsterisk(
      text,
      doubleAsterisks,
      index,
      protectedDoubleAsterisks,
    );
    if (openIndex == null) {
      continue;
    }

    protectedTokens.push({ start: openIndex, value: "**" });
    protectedTokens.push({ start: closeIndex, value: "**" });
    protectedDoubleAsterisks.add(openIndex);
    protectedDoubleAsterisks.add(closeIndex);
  }

  protectedTokens.sort((left, right) => left.start - right.start);
  const pieces: string[] = [];
  let cursor = 0;
  for (const token of protectedTokens) {
    pieces.push(text.slice(cursor, token.start));
    pieces.push(`${delimiter}${values.length}${delimiter}`);
    values.push(token.value);
    cursor = token.start + token.value.length;
  }
  pieces.push(text.slice(cursor));

  return { value: pieces.join(""), delimiter, values };
}

function choosePlaceholderDelimiter(text: string): string {
  for (let codePoint = 0xe100; codePoint <= 0xf8ff; codePoint += 1) {
    const delimiter = String.fromCodePoint(codePoint);
    if (!text.includes(delimiter)) {
      return delimiter;
    }
  }

  throw new Error("Unable to allocate syntax placeholders");
}

function restoreSpacingSyntax(
  text: string,
  protectedText: ProtectedSpacingSyntax,
): string {
  const placeholderPattern = new RegExp(
    `${escapeRegExp(protectedText.delimiter)}(\\d+)${escapeRegExp(protectedText.delimiter)}`,
    "g",
  );
  return text.replace(placeholderPattern, (placeholder, index: string) => {
    return protectedText.values[Number(index)] ?? placeholder;
  });
}

function isAsciiLetterOrDigit(value: string): boolean {
  return /^[A-Za-z0-9]$/.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectUnescapedDoubleAsteriskIndices(text: string): number[] {
  const indices: number[] = [];
  let searchFrom = 0;

  while (true) {
    const index = text.indexOf("**", searchFrom);
    if (index === -1) {
      return indices;
    }

    if (!isEscaped(text, index)) {
      indices.push(index);
    }

    searchFrom = index + 2;
  }
}

function isEscaped(value: string, index: number): boolean {
  let backslashCount = 0;
  for (let current = index - 1; current >= 0 && value[current] === "\\"; current -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function isCjkOrFullwidthPunctuation(value: string): boolean {
  return /^[\u2E80-\u30FF\u3100-\u312F\u31F0-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]$/.test(
    value,
  );
}

function findPreviousUnprotectedDoubleAsterisk(
  text: string,
  doubleAsterisks: number[],
  closePosition: number,
  protectedDoubleAsterisks: Set<number>,
): number | null {
  const closeIndex = doubleAsterisks[closePosition]!;
  const following = text[closeIndex + 2];
  if (following == null || !isCjkOrFullwidthPunctuation(following)) {
    return null;
  }

  for (let openPosition = closePosition - 1; openPosition >= 0; openPosition -= 1) {
    const openIndex = doubleAsterisks[openPosition]!;
    if (!protectedDoubleAsterisks.has(openIndex)) {
      return openIndex;
    }
  }

  return null;
}

function preserveOriginalSlashSpacing(original: string, fixed: string): string {
  let nextOriginalSearchIndex = 0;
  let nextFixedSearchIndex = 0;
  let normalized = fixed;

  while (true) {
    const originalSlashIndex = original.indexOf("/", nextOriginalSearchIndex);
    const fixedSlashIndex = normalized.indexOf("/", nextFixedSearchIndex);
    if (originalSlashIndex === -1 || fixedSlashIndex === -1) {
      return normalized;
    }

    const originalSpan = getSlashSpacingSpan(original, originalSlashIndex);
    const fixedSpan = getSlashSpacingSpan(normalized, fixedSlashIndex);
    const replacement = original.slice(originalSpan.start, originalSpan.end);

    normalized =
      normalized.slice(0, fixedSpan.start) +
      replacement +
      normalized.slice(fixedSpan.end);

    nextOriginalSearchIndex = originalSlashIndex + 1;
    nextFixedSearchIndex = fixedSpan.start + replacement.length;
  }
}

function preserveOriginalPairedPunctuationSpacing(original: string, fixed: string): string {
  let normalized = fixed;

  for (const [open, close] of PAIRED_PUNCTUATION) {
    const originalPairs = getMatchedPairedPunctuationRanges(original, open, close);
    for (let index = originalPairs.length - 1; index >= 0; index -= 1) {
      const fixedPairs = getMatchedPairedPunctuationRanges(normalized, open, close);
      if (index >= fixedPairs.length) {
        continue;
      }

      const originalPair = originalPairs[index]!;
      const fixedPair = fixedPairs[index]!;
      const originalLeading = original.slice(originalPair.leadingSpaceStart, originalPair.openStart);
      const originalTrailing = original.slice(originalPair.closeEnd, originalPair.trailingSpaceEnd);
      const fixedContent = normalized.slice(fixedPair.openStart, fixedPair.closeEnd);

      normalized =
        normalized.slice(0, fixedPair.leadingSpaceStart) +
        originalLeading +
        fixedContent +
        originalTrailing +
        normalized.slice(fixedPair.trailingSpaceEnd);
    }
  }

  return normalized;
}

function getSlashSpacingSpan(
  value: string,
  slashIndex: number,
): { start: number; end: number } {
  let start = slashIndex;
  let end = slashIndex + 1;

  while (start > 0 && value[start - 1] === " ") {
    start -= 1;
  }

  while (end < value.length && value[end] === " ") {
    end += 1;
  }

  return { start, end };
}

function getMatchedPairedPunctuationRanges(
  value: string,
  open: string,
  close: string,
): Array<{
  leadingSpaceStart: number;
  openStart: number;
  closeEnd: number;
  trailingSpaceEnd: number;
}> {
  const pairs: Array<{
    leadingSpaceStart: number;
    openStart: number;
    closeEnd: number;
    trailingSpaceEnd: number;
  }> = [];
  const stack: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith(open, index)) {
      stack.push(index);
      index += open.length - 1;
      continue;
    }

    if (!value.startsWith(close, index) || stack.length === 0) {
      continue;
    }

    const openStart = stack.pop()!;
    let leadingSpaceStart = openStart;
    let trailingSpaceEnd = index + close.length;

    while (leadingSpaceStart > 0 && value[leadingSpaceStart - 1] === " ") {
      leadingSpaceStart -= 1;
    }

    while (trailingSpaceEnd < value.length && value[trailingSpaceEnd] === " ") {
      trailingSpaceEnd += 1;
    }

    pairs.push({
      leadingSpaceStart,
      openStart,
      closeEnd: index + close.length,
      trailingSpaceEnd,
    });
    index += close.length - 1;
  }

  pairs.sort((left, right) => left.openStart - right.openStart);
  return pairs;
}
