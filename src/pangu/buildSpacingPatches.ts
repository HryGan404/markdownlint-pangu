import { detectSpacingIssue } from "./detectSpacingIssues.js";

export interface RangePatch {
  start: number;
  end: number;
  text: string;
}

export interface DiagnosableRangePatch extends RangePatch {
  diagnosticOffset: number;
}

export interface MaskedSpacingRange {
  start: number;
  end: number;
  blocked: Array<{
    start: number;
    end: number;
    allowInsertionAtBoundary?: boolean;
  }>;
}

export function buildSpacingPatches(
  markdown: string,
  ranges: Array<{ start: number; end: number }>,
): RangePatch[] {
  return buildSpacingPatchesWithDiagnostics(markdown, ranges).map((patch) => ({
    start: patch.start,
    end: patch.end,
    text: patch.text,
  }));
}

export function buildSpacingPatchesWithDiagnostics(
  markdown: string,
  ranges: Array<{ start: number; end: number }>,
): DiagnosableRangePatch[] {
  const patches: DiagnosableRangePatch[] = [];

  for (const range of ranges) {
    const original = markdown.slice(range.start, range.end);
    const issue = detectSpacingIssue(original, range.start, range.end);
    if (!issue) {
      continue;
    }

    patches.push({
      start: range.start,
      end: range.end,
      text: issue.insertions && issue.insertions.length > 0
        ? insertSpaces(original, issue.insertions)
        : issue.fixed,
      diagnosticOffset: issue.diagnosticOffset,
    });
  }

  return patches;
}

export function buildMaskedSpacingPatchesWithDiagnostics(
  markdown: string,
  ranges: MaskedSpacingRange[],
): DiagnosableRangePatch[] {
  const patches: DiagnosableRangePatch[] = [];

  for (const range of ranges) {
    const original = markdown.slice(range.start, range.end);
    const issue = detectSpacingIssue(original, range.start, range.end);
    if (!issue || !issue.insertions || issue.insertions.length === 0) {
      continue;
    }

    const filteredInsertions = issue.insertions.filter((offset) => {
      return !isBlockedInsertion(range.start + offset, range.blocked);
    });

    if (filteredInsertions.length === 0) {
      continue;
    }

    patches.push({
      start: range.start,
      end: range.end,
      text: insertSpaces(original, filteredInsertions),
      diagnosticOffset: range.start + filteredInsertions[0]!,
    });
  }

  return patches;
}

function isBlockedInsertion(
  offset: number,
  blocked: MaskedSpacingRange["blocked"],
): boolean {
  return blocked.some((range) => {
    if (range.allowInsertionAtBoundary) {
      return offset > range.start && offset < range.end;
    }
    return offset >= range.start && offset <= range.end;
  });
}

function insertSpaces(text: string, insertions: number[]): string {
  const pieces: string[] = [];
  let cursor = 0;
  for (const insertion of [...insertions].sort((left, right) => left - right)) {
    pieces.push(text.slice(cursor, insertion), " ");
    cursor = insertion;
  }
  pieces.push(text.slice(cursor));
  return pieces.join("");
}
