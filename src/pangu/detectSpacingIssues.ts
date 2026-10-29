import pangu from "pangu";

export interface SpacingIssue {
  original: string;
  fixed: string;
  start: number;
  end: number;
  diagnosticOffset: number;
  insertions?: number[];
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
  const pairedPunctuationPlaceholders = protectPairedPunctuation(protectedText);
  const rawFixed = restoreSpacingSyntax(
    (pangu as unknown as PanguLike).spacingText(pairedPunctuationPlaceholders.value),
    pairedPunctuationPlaceholders,
  );
  const afterAtoms = restoreLiteralAtoms(text, rawFixed);
  const afterSlash = preserveOriginalSlashSpacing(text, afterAtoms);
  const fixed = preservePairedPunctuationEdges(text, afterSlash);
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
    insertions: collectInsertionOffsets(text, fixed),
  };
}

function collectInsertionOffsets(original: string, fixed: string): number[] {
  const insertions: number[] = [];
  let originalIndex = 0;
  let fixedIndex = 0;

  while (fixedIndex < fixed.length) {
    if (originalIndex < original.length && fixed[fixedIndex] === original[originalIndex]) {
      originalIndex += 1;
      fixedIndex += 1;
      continue;
    }
    if (fixed[fixedIndex] !== " ") {
      return [];
    }
    insertions.push(originalIndex);
    fixedIndex += 1;
  }

  return originalIndex === original.length ? insertions : [];
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

function protectPairedPunctuation(text: ProtectedSpacingSyntax): ProtectedSpacingSyntax {
  const values = [...text.values];
  const punctuationAt = collectMatchedPairedPunctuationBoundaries(text.value);
  if (punctuationAt.size === 0) {
    return text;
  }

  const pieces: string[] = [];
  let cursor = 0;

  for (let index = 0; index < text.value.length; index += 1) {
    const punctuation = punctuationAt.get(index);
    if (!punctuation) {
      continue;
    }

    pieces.push(
      text.value.slice(cursor, index),
      `${text.delimiter}${values.length}${text.delimiter}`,
    );
    values.push(punctuation);
    cursor = index + punctuation.length;
    index += punctuation.length - 1;
  }

  pieces.push(text.value.slice(cursor));
  return { value: pieces.join(""), delimiter: text.delimiter, values };
}

function collectMatchedPairedPunctuationBoundaries(value: string): Map<number, string> {
  const boundaries = new Map<number, string>();
  const stack: Array<{ start: number; close: string }> = [];

  for (let index = 0; index < value.length; index += 1) {
    const opening = PAIRED_PUNCTUATION.find(([open]) => value.startsWith(open, index));
    if (opening) {
      stack.push({ start: index, close: opening[1] });
      index += opening[0].length - 1;
      continue;
    }

    const closing = PAIRED_PUNCTUATION.find(([, close]) => value.startsWith(close, index));
    if (!closing || stack.at(-1)?.close !== closing[1]) {
      continue;
    }

    const matchedOpening = stack.pop()!;
    const open = PAIRED_PUNCTUATION.find(([, close]) => close === matchedOpening.close)![0];
    boundaries.set(matchedOpening.start, open);
    boundaries.set(index, closing[1]);
    index += closing[1].length - 1;
  }

  return boundaries;
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

const LITERAL_ATOM =
  /\\([!-/:-@[-`{-~])|&(?:#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;

interface LiteralAtom {
  start: number;
  value: string;
}

interface TextCharacter {
  offset: number;
  value: string;
}

function collectLiteralAtoms(text: string): LiteralAtom[] {
  return [...text.matchAll(LITERAL_ATOM)].map((match) => ({
    start: match.index,
    value: match[0],
  }));
}

function removeAtoms(text: string, atoms: LiteralAtom[]): TextCharacter[] {
  const result: TextCharacter[] = [];
  let atomIndex = 0;

  for (let offset = 0; offset < text.length; offset += 1) {
    const atom = atoms[atomIndex];
    if (atom && offset === atom.start) {
      offset += atom.value.length - 1;
      atomIndex += 1;
      continue;
    }
    result.push({ offset, value: text[offset]! });
  }

  return result;
}

function findInsertionOffsets(original: TextCharacter[], fixed: TextCharacter[]): number[] | null {
  const insertions: number[] = [];
  let originalIndex = 0;
  let fixedIndex = 0;

  while (fixedIndex < fixed.length) {
    if (originalIndex < original.length && fixed[fixedIndex]!.value === original[originalIndex]!.value) {
      originalIndex += 1;
      fixedIndex += 1;
      continue;
    }
    if (fixed[fixedIndex]!.value !== " ") {
      return null;
    }
    insertions.push(originalIndex);
    fixedIndex += 1;
  }

  return originalIndex === original.length ? insertions : null;
}

function isValidBoundary(text: string, atoms: LiteralAtom[], offset: number): boolean {
  const previous = previousExplicitCharacter(text, atoms, offset);
  const next = nextExplicitCharacter(text, atoms, offset);
  if (previous == null || next == null) {
    return false;
  }
  return (
    (isCjkOrFullwidthPunctuation(previous) && /[A-Za-z0-9]/.test(next)) ||
    (/[A-Za-z0-9]/.test(previous) && isCjkOrFullwidthPunctuation(next))
  );
}

function previousExplicitCharacter(text: string, atoms: LiteralAtom[], offset: number): string | null {
  const atomBefore = atoms.find((atom) => atom.start + atom.value.length === offset);
  if (atomBefore) {
    return text[atomBefore.start - 1] ?? null;
  }
  return text[offset - 1] ?? null;
}

function nextExplicitCharacter(text: string, atoms: LiteralAtom[], offset: number): string | null {
  const atomAfter = atoms.find((atom) => atom.start === offset);
  if (atomAfter) {
    return text[atomAfter.start + atomAfter.value.length] ?? null;
  }
  return text[offset] ?? null;
}

function restoreLiteralAtoms(original: string, fixed: string): string {
  const atoms = collectLiteralAtoms(original);
  if (atoms.length === 0) {
    return fixed;
  }

  const changed = findInsertionOffsets(
    removeAtoms(original, atoms),
    removeAtoms(fixed, atoms),
  );
  if (!changed) {
    return original;
  }

  return applyInsertions(original, atoms, changed);
}

function applyInsertions(
  original: string,
  atoms: LiteralAtom[],
  insertionIndexes: number[],
): string {
  const visible = removeAtoms(original, atoms);
  const insertions = insertionIndexes.map((index) => {
    return visible[index]?.offset ?? original.length;
  });

  if (insertions.some((offset) => !isValidBoundary(original, atoms, offset))) {
    return original;
  }

  const pieces: string[] = [];
  let cursor = 0;
  for (const offset of insertions) {
    pieces.push(original.slice(cursor, offset), " ");
    cursor = offset;
  }
  pieces.push(original.slice(cursor));
  return pieces.join("");
}

function preservePairedPunctuationEdges(original: string, fixed: string): string {
  let normalized = fixed;

  for (const [open, close] of PAIRED_PUNCTUATION) {
    normalized = preserveCharacterEdge(original, normalized, open, "before");
    normalized = preserveCharacterEdge(original, normalized, close, "after");
  }

  return normalized;
}

function preserveCharacterEdge(
  original: string,
  fixed: string,
  character: string,
  direction: "before" | "after",
): string {
  let normalized = fixed;
  let originalIndex = 0;
  let fixedIndex = 0;

  while (true) {
    originalIndex = original.indexOf(character, originalIndex);
    fixedIndex = normalized.indexOf(character, fixedIndex);
    if (originalIndex < 0 || fixedIndex < 0) {
      return normalized;
    }

    const originalSpace = direction === "before"
      ? countAdjacentSpaces(original, originalIndex, -1)
      : countAdjacentSpaces(original, originalIndex + character.length, 1);
    const fixedSpace = direction === "before"
      ? countAdjacentSpaces(normalized, fixedIndex, -1)
      : countAdjacentSpaces(normalized, fixedIndex + character.length, 1);

    if (originalSpace !== fixedSpace) {
      const start = direction === "before" ? fixedIndex - fixedSpace : fixedIndex + character.length;
      const end = start + fixedSpace;
      const replacement = " ".repeat(originalSpace);
      normalized = normalized.slice(0, start) + replacement + normalized.slice(end);
      fixedIndex = start + replacement.length;
    }

    originalIndex += character.length;
    fixedIndex += character.length;
  }
}

function countAdjacentSpaces(value: string, index: number, direction: -1 | 1): number {
  let count = 0;
  let cursor = index;
  while (cursor >= 0 && cursor < value.length && value[cursor] === " ") {
    count += 1;
    cursor += direction;
  }
  return count;
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
