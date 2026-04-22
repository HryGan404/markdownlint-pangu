import { describe, expect, it } from "vitest";

import { applyRangePatches } from "../../src/markdown/applyRangePatches.js";
import { collectSafeRanges } from "../../src/markdown/safeRanges.js";
import { buildSpacingPatches } from "../../src/pangu/buildSpacingPatches.js";

describe("buildSpacingPatches", () => {
  it("only patches safe slices and leaves code untouched", () => {
    const markdown = [
      "# 歡迎來到MarkdownWorld",
      "",
      "這是一個README文件。",
      "",
      "`const value = \"HelloWorld\"`",
    ].join("\n");

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe(
      [
        "# 歡迎來到 MarkdownWorld",
        "",
        "這是一個 README 文件。",
        "",
        "`const value = \"HelloWorld\"`",
      ].join("\n"),
    );
    expect(patches).toHaveLength(2);

    const paragraphStart = markdown.indexOf("這是一個README文件。");
    const paragraphEnd = paragraphStart + "這是一個README文件。".length;
    const readmePatch = patches.find(
      (patch) => patch.start === paragraphStart && patch.end === paragraphEnd,
    );

    expect(readmePatch).toEqual({
      start: paragraphStart,
      end: paragraphEnd,
      text: "這是一個 README 文件。",
    });
  });

  it("keeps original slash spacing while preserving other pangu fixes", () => {
    const markdown = "這是A/B測試";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("這是 A/B 測試");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.text).toBe("這是 A/B 測試");
  });

  it("does not add outer spacing around fullwidth double quotes", () => {
    const markdown = "前面“quoted”后面";

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toBe("前面“quoted”后面");
  });

  it("preserves nested fullwidth double quotes without adding outer spacing", () => {
    const markdown = "前面“a“b”c”后面";

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toBe("前面“a“b”c”后面");
  });

  it("keeps fullwidth paired punctuation untouched in Chinese text", () => {
    const markdown = ["前面《书名》后面", "前面（备注）后面", "前面【重点】后面"].join("\n");

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toBe(["前面《书名》后面", "前面（备注）后面", "前面【重点】后面"].join("\n"));
  });

  it("keeps spacing fixes inside fullwidth paired punctuation", () => {
    const markdown = "前面（Test备注）后面";

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toBe("前面（Test 备注）后面");
  });

  it("keeps later matched quotes stable when an earlier quote is unmatched", () => {
    const markdown = "前面“未闭合 后面“quoted”结尾";

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toContain("后面“quoted”结尾");
    expect(fixed).not.toContain("后面 “quoted”");
    expect(fixed).not.toContain("“quoted” 结尾");
  });

  it("still fixes regular CJK-Latin spacing outside fullwidth paired punctuation", () => {
    const markdown = "这是Test（备注）段落";

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toBe("这是 Test（备注）段落");
  });
});

describe("applyRangePatches", () => {
  it("throws when a patch range is out of bounds", () => {
    expect(() => {
      applyRangePatches("abc", [{ start: -1, end: 1, text: "x" }]);
    }).toThrow("invalid patch range");
  });

  it("throws when patch ranges overlap", () => {
    expect(() => {
      applyRangePatches("abcdef", [
        { start: 1, end: 4, text: "x" },
        { start: 3, end: 5, text: "y" },
      ]);
    }).toThrow("overlapping patch ranges");
  });
});
