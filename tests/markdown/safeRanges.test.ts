import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { collectSafeRanges } from "../../src/markdown/safeRanges.js";

function sliceRanges(markdown: string): string[] {
  return collectSafeRanges(markdown).map((range) => markdown.slice(range.start, range.end));
}

describe("collectSafeRanges", () => {
  it("includes visible text but excludes code and front matter", async () => {
    const markdown = await readFile("tests/fixtures/markdown/safe-ranges.md", "utf8");
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("MarkdownWorld"))).toBe(true);
    expect(slices.some((slice) => slice.includes("README文档"))).toBe(true);
    expect(slices.some((slice) => slice.includes("项目主页Homepage"))).toBe(true);
    expect(slices.some((slice) => slice.includes("不要处理CodeSpan"))).toBe(false);
    expect(slices.some((slice) => slice.includes("不要处理CodeFence"))).toBe(false);
    expect(slices.some((slice) => slice.includes("title: test"))).toBe(false);
  });

  it("skips autolink url text", () => {
    const markdown = "访问 https://example.com/HelloWorld";
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("访问"))).toBe(true);
    expect(slices.some((slice) => slice.includes("https://example.com/HelloWorld"))).toBe(false);
  });

  it("skips footnote definition text", () => {
    const markdown = "正文[^1]\n\n[^1]: 脚注Footnote文本";
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("正文"))).toBe(true);
    expect(slices.some((slice) => slice.includes("脚注Footnote文本"))).toBe(false);
  });

  it("includes image alt text", () => {
    const markdown = "![图片AltText](https://example.com/a.png)";
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("图片AltText"))).toBe(true);
  });

  it("includes image reference alt text but skips definition url", () => {
    const markdown = "![图片AltText][logo]\n\n[logo]: https://example.com/a.png";
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("图片AltText"))).toBe(true);
    expect(slices.some((slice) => slice.includes("https://example.com/a.png"))).toBe(false);
  });

  it("supports image alt ending with escaped closing bracket", () => {
    const markdown = String.raw`![foo\\\\](u)`;
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice === String.raw`foo\\\\`)).toBe(true);
  });

  it("skips block HTML content", () => {
    const markdown = "<div>中文Div文本</div>\n\n正文Text";
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("正文Text"))).toBe(true);
    expect(slices.some((slice) => slice.includes("中文Div文本"))).toBe(false);
  });

  it("skips text between inline HTML tags", () => {
    const markdown = '正文<a href="#">中文Link</a>结尾';
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("正文"))).toBe(true);
    expect(slices.some((slice) => slice.includes("结尾"))).toBe(true);
    expect(slices.some((slice) => slice.includes("中文Link"))).toBe(false);
  });

  it("skips nested inline HTML content", () => {
    const markdown = "前<b>中<i>文X</i>字</b>后";
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("前"))).toBe(true);
    expect(slices.some((slice) => slice.includes("后"))).toBe(true);
    expect(slices.some((slice) => slice.includes("文X"))).toBe(false);
  });

  it.each([
    ["void element", "前<br>中<b>x</b>后"],
    ["self-closing tag", "前<x/>中<b>x</b>后"],
    ["comment", "前<!-- c -->中<b>x</b>后"],
  ])(
    "does not let a %s unbalance following tag pairs",
    (_label, markdown) => {
      const slices = sliceRanges(markdown);

      expect(slices.some((slice) => slice.includes("前"))).toBe(true);
      expect(slices.some((slice) => slice.includes("中"))).toBe(true);
      expect(slices.some((slice) => slice.includes("后"))).toBe(true);
      expect(slices.some((slice) => slice === "x")).toBe(false);
    },
  );

  it("skips inline HTML whose attribute value contains a close tag", () => {
    const markdown = '文字A<a title="x</y">中A文</a>文字B';
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("文字A"))).toBe(true);
    expect(slices.some((slice) => slice.includes("文字B"))).toBe(true);
    expect(slices.some((slice) => slice.includes("中A文"))).toBe(false);
  });

  it("does not swallow text after an unmatched HTML tag", () => {
    const unclosed = "前<b>中文未闭合";
    const strayClose = "结尾</b>中文";

    expect(sliceRanges(unclosed).some((slice) => slice.includes("中文未闭合"))).toBe(true);
    expect(sliceRanges(strayClose).some((slice) => slice.includes("中文"))).toBe(true);
  });

  it("skips inline math and math blocks", () => {
    const inline = "行内$数学Math$文本";
    const block = "$$\n中文Math文本\n$$\n\n正文Text";
    const inlineSlices = sliceRanges(inline);
    const blockSlices = sliceRanges(block);

    expect(inlineSlices.some((slice) => slice.includes("数学Math"))).toBe(false);
    expect(blockSlices.some((slice) => slice.includes("中文Math文本"))).toBe(false);
    expect(blockSlices.some((slice) => slice.includes("正文Text"))).toBe(true);
  });

  it("does not recognize TOML front matter and treats it as body text", () => {
    const markdown = '+++\ntitle = "中文Title"\n+++\n\n正文Text';
    const slices = sliceRanges(markdown);

    expect(slices.some((slice) => slice.includes("中文Title"))).toBe(true);
  });

  it("skips reference-style link text while processing inline link text", () => {
    const reference = "[中文English][ref]\n\n[ref]: https://example.com";
    const inline = "[中文English](https://example.com)";

    expect(sliceRanges(reference).some((slice) => slice.includes("中文English"))).toBe(false);
    expect(sliceRanges(inline).some((slice) => slice.includes("中文English"))).toBe(true);
  });

  it("processes inline footnote text while skipping the definition block", () => {
    const inline = "正文text^[脚注Note]";
    const definition = "正文[^1]\n\n[^1]: 脚注Note";

    expect(sliceRanges(inline).some((slice) => slice.includes("脚注Note"))).toBe(true);
    expect(sliceRanges(definition).some((slice) => slice.includes("脚注Note"))).toBe(false);
  });

  it("includes list item, blockquote, and table cell text", () => {
    const listItem = "- 列表Item内容";
    const blockquote = "> 引用Quote文本";
    const table = "| 表头Header |\n| --- |\n| 单元Cell |";

    expect(sliceRanges(listItem).some((slice) => slice.includes("列表Item内容"))).toBe(true);
    expect(sliceRanges(blockquote).some((slice) => slice.includes("引用Quote文本"))).toBe(true);

    const tableSlices = sliceRanges(table);
    expect(tableSlices.some((slice) => slice.includes("表头Header"))).toBe(true);
    expect(tableSlices.some((slice) => slice.includes("单元Cell"))).toBe(true);
  });
});
