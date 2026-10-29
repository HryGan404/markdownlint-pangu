import { describe, expect, it } from "vitest";

import { hasEquivalentMarkdownStructure } from "../../src/markdown/hasEquivalentMarkdownStructure.js";

describe("hasEquivalentMarkdownStructure", () => {
  it("allows inserted text spaces without changing Markdown structure", () => {
    expect(
      hasEquivalentMarkdownStructure(
        "中文ABC\n\n[English](https://example.com)",
        "中文 ABC\n\n[English](https://example.com)",
      ),
    ).toBe(true);
  });

  it.each([
    ["中文ABC\n-中", "中文 ABC\n- 中"],
    ["中文ABC\n#中", "中文 ABC\n# 中"],
    ["访问https://e.test/中文ABC", "访问 https://e.test/中文 ABC"],
    ["[**中文ABC**](u)", "[** 中文 ABC**](u)"],
  ])("rejects a structural change from %j", (original, candidate) => {
    expect(hasEquivalentMarkdownStructure(original, candidate)).toBe(false);
  });
});
