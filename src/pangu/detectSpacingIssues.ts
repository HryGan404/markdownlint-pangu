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
  const rawFixed = (pangu as unknown as PanguLike).spacingText(text);
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
