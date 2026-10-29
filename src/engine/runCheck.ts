import type { Diagnostic } from "../diagnostics/types.js";
import { mergeDiagnostics } from "../diagnostics/mergeDiagnostics.js";
import { normalizeMarkdownlintResults } from "../lint/normalizeMarkdownlintResults.js";
import { runMarkdownlint } from "../lint/runMarkdownlint.js";
import { collectSpacingRanges } from "../markdown/safeRanges.js";
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

    for (const patch of patches) {
      const position = offsetToLineColumn(input.content, patch.diagnosticOffset);
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

function offsetToLineColumn(content: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset; index += 1) {
    if (content[index] === "\r" || content[index] === "\n") {
      if (content[index] === "\r" && content[index + 1] === "\n") {
        continue;
      }
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    line,
    column: offset - lineStart + 1,
  };
}
