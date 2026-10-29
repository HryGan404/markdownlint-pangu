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

  it("keeps compact ASCII brackets inside CJK text", () => {
    const markdown = "HTTP(S)协议";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("HTTP(S) 协议");
  });

  it("preserves each mixed compact parenthetical independently", () => {
    const markdown = "HTTP (S)和HTTP(S)协议";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("HTTP (S) 和 HTTP(S) 协议");
  });

  it("restores many compact parentheticals without changing their order", () => {
    const markdown = "HTTP(S)协议 ".repeat(20_000).trimEnd();

    const startedAt = performance.now();
    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);
    const elapsed = performance.now() - startedAt;

    expect(fixed).toBe("HTTP(S) 协议 ".repeat(20_000).trimEnd());
    expect(elapsed).toBeLessThan(5_000);
  });

  it("keeps normal CJK spacing while preserving compact ASCII brackets", () => {
    const markdown = "使用HTTP(S)访问API接口";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("使用 HTTP(S) 访问 API 接口");
  });

  it("keeps pangu spacing after a compact ASCII parenthetical", () => {
    const markdown = "HTTP(S)API测试";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("HTTP(S) API 测试");
  });

  it("round-trips private-use placeholder characters from the input", () => {
    const markdown = "HTTP(S)测试\uE1000\uE1001";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("HTTP(S) 测试\uE1000\uE1001");
  });

  it("throws when no private-use delimiter is available", () => {
    let privateUseCharacters = "";
    for (let codePoint = 0xe100; codePoint <= 0xf8ff; codePoint += 1) {
      privateUseCharacters += String.fromCodePoint(codePoint);
    }
    const markdown = `HTTP(S)${privateUseCharacters}测试`;

    expect(() => {
      buildSpacingPatches(markdown, collectSafeRanges(markdown));
    }).toThrow("Unable to allocate syntax placeholders");
  });

  it("does not add spacing around a literal double-asterisk boundary", () => {
    const markdown = "**原文事实：**团队";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe(markdown);
  });

  it("keeps spacing fixes inside literal double-asterisk delimiters", () => {
    const markdown = "**中文readme：**团队";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("**中文 readme：**团队");
  });

  it("keeps a following literal marker after an unmatched double asterisk", () => {
    const markdown = "**未闭合，**原文事实：**团队";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toContain("**原文事实：**团队");
    expect(fixed).not.toContain("**原文事实：** 团队");
  });

  it("keeps unmatched emphasis-like punctuation subject to normal spacing", () => {
    const markdown = "这是a*b测试";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("这是 a * b 测试");
  });

  it("keeps underscore punctuation subject to normal spacing", () => {
    const markdown = "这是a_b测试";

    const patches = buildSpacingPatches(markdown, collectSafeRanges(markdown));
    const fixed = applyRangePatches(markdown, patches);

    expect(fixed).toBe("这是 a_b 测试");
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

  it("keeps additional fullwidth paired punctuation untouched in Chinese text", () => {
    const markdown = [
      "前面‘quoted’后面",
      "前面「quoted」后面",
      "前面『quoted』后面",
      "前面〈书名〉后面",
      "前面〔备注〕后面",
    ].join("\n");

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toBe(markdown);
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

  it("keeps mixed nested fullwidth punctuation stable", () => {
    const markdown = "前面「a『b』c」后面";

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toBe("前面「a『b』c」后面");
  });

  it("handles a large paragraph of paired punctuation without quadratic slowdown", () => {
    const markdown = "前面“a”后面 ".repeat(8_000).trimEnd();
    const startedAt = performance.now();

    const fixed = applyRangePatches(
      markdown,
      buildSpacingPatches(markdown, collectSafeRanges(markdown)),
    );

    expect(fixed).toBe(markdown);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
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
  it("applies many patches in linear time", () => {
    const original = "中文ABC\n".repeat(10_000);
    const patches = Array.from({ length: 10_000 }, (_, index) => {
      const start = index * 6 + 2;
      return { start, end: start + 3, text: "ABC" };
    });
    const startedAt = performance.now();

    const result = applyRangePatches(original, patches);

    expect(result).toBe(original);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it("builds masked spacing patches for an inline link", async () => {
    const { buildMaskedSpacingPatchesWithDiagnostics } = await import(
      "../../src/pangu/buildSpacingPatches.js"
    );
    const markdown = "中文[English](https://example.com)测试";

    const patches = buildMaskedSpacingPatchesWithDiagnostics(markdown, [
      {
        start: 0,
        end: markdown.length,
        blocked: [
          { start: 2, end: 3, allowInsertionAtBoundary: true },
          { start: 10, end: 32, allowInsertionAtBoundary: true },
        ],
      },
    ]);

    expect(applyRangePatches(markdown, patches)).toBe(
      "中文 [English](https://example.com) 测试",
    );
  });

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
