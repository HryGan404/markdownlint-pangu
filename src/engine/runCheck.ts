import type { Diagnostic } from "../diagnostics/types.js";
import { mergeDiagnostics } from "../diagnostics/mergeDiagnostics.js";
import { normalizeMarkdownlintResults } from "../lint/normalizeMarkdownlintResults.js";
import { runMarkdownlint } from "../lint/runMarkdownlint.js";
import { collectSpacingRanges } from "../markdown/safeRanges.js";
import { applyRangePatches } from "../markdown/applyRangePatches.js";
import { hasEquivalentMarkdownStructure } from "../markdown/hasEquivalentMarkdownStructure.js";
import { buildMaskedSpacingPatchesWithDiagnostics } from "../pangu/buildSpacingPatches.js";
import { filterIgnoredSpacingRanges } from "../pangu/filterIgnoredRanges.js";
import type { ResolvedOptions } from "../shared/types.js";

interface RunCheckInput {
  filePath: string;
  content: string;
  options: ResolvedOptions;
}

export async function runCheck(input: RunCheckInput): Promise<{ diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];

  if (input.options.pangu.enabled) {
    const ranges = filterIgnoredSpacingRanges(input.content, collectSpacingRanges(input.content), {
      ignorePatterns: input.options.pangu.ignorePatterns,
      ignoreBlocks: input.options.pangu.ignoreBlocks,
    });
    const patches = buildMaskedSpacingPatchesWithDiagnostics(input.content, ranges);
    const fixedContent = applyRangePatches(
      input.content,
      patches.map(({ start, end, text }) => ({ start, end, text })),
    );
    const structuralPatches = hasEquivalentMarkdownStructure(
      input.content,
      fixedContent,
    )
      ? patches
      : [];

    const lineStarts = collectLineStarts(input.content);

    for (const patch of structuralPatches) {
      const position = offsetToLineColumn(lineStarts, patch.diagnosticOffset);
      diagnostics.push({
        source: "pangu",
        rule: "pangu/spacing",
        message: "Insert spacing between CJK and Latin text",
        severity: "error",
        filePath: input.filePath,
        line: position.line,
        column: position.column,
        fixable: true,
      });
    }
  }

  if (input.options.markdownlint.enabled) {
    const results = await runMarkdownlint(
      input.filePath,
      input.content,
      input.options.markdownlint.config,
      {
        rules: input.options.markdownlint.rules,
        disable: input.options.markdownlint.disable,
      },
    );
    const issues = results[input.filePath] ?? [];
    diagnostics.push(...normalizeMarkdownlintResults(input.filePath, issues));
  }

  return {
    diagnostics: mergeDiagnostics(diagnostics),
  };
}

function collectLineStarts(content: string): number[] {
  const starts = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\r" && content[index + 1] === "\n") {
      index += 1;
      starts.push(index + 1);
      continue;
    }

    if (content[index] === "\r" || content[index] === "\n") {
      starts.push(index + 1);
    }
  }

  return starts;
}

function offsetToLineColumn(
  lineStarts: number[],
  offset: number,
): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle]! <= offset) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const lineStart = lineStarts[low]!;
  return {
    line: low + 1,
    column: offset - lineStart + 1,
  };
}
