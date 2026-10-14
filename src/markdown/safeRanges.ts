import type { Content, Image, ImageReference, Link, Root, Text } from "mdast";

import { parseMarkdown } from "./parseMarkdown.js";

export interface TextRange {
  start: number;
  end: number;
}

const SAFE_TEXT_PARENTS = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "tableCell",
  "emphasis",
  "strong",
  "delete",
  "link",
]);

const DENY_ANCESTOR_TYPES = new Set([
  "footnoteDefinition",
  "definition",
  "code",
  "inlineCode",
  "math",
  "inlineMath",
  "html",
]);

export function collectSafeRanges(markdown: string): TextRange[] {
  const tree = parseMarkdown(markdown);
  const deniedHtmlRanges = collectHtmlDeniedRanges(tree);
  const ranges: TextRange[] = [];

  walkNode(tree, [], markdown, deniedHtmlRanges, ranges);

  return ranges.sort((left, right) => left.start - right.start);
}

function walkNode(
  node: Root | Content,
  ancestors: Array<Root | Content>,
  markdown: string,
  deniedHtmlRanges: TextRange[],
  ranges: TextRange[],
): void {
  if (node.type === "text") {
    collectTextRange(node, ancestors, deniedHtmlRanges, ranges);
  }

  if (node.type === "image" || node.type === "imageReference") {
    collectImageAltRange(node, ancestors, markdown, ranges);
  }

  if (!("children" in node) || !Array.isArray(node.children)) {
    return;
  }

  const nextAncestors = [...ancestors, node];
  for (const child of node.children as Content[]) {
    walkNode(child, nextAncestors, markdown, deniedHtmlRanges, ranges);
  }
}

function collectTextRange(
  node: Text,
  ancestors: Array<Root | Content>,
  deniedHtmlRanges: TextRange[],
  ranges: TextRange[],
): void {
  const parent = ancestors.at(-1);
  if (!parent || !SAFE_TEXT_PARENTS.has(parent.type)) {
    return;
  }

  if (hasDenyAncestor(ancestors)) {
    return;
  }

  if (parent.type === "link" && isAutolinkText(parent, node)) {
    return;
  }

  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start == null || end == null) {
    return;
  }

  if (isWithinRanges(start, end, deniedHtmlRanges)) {
    return;
  }

  ranges.push({ start, end });
}

function collectImageAltRange(
  node: Image | ImageReference,
  ancestors: Array<Root | Content>,
  markdown: string,
  ranges: TextRange[],
): void {
  if (!node.alt || hasDenyAncestor(ancestors)) {
    return;
  }

  const range = extractImageAltRange(markdown, node);
  if (!range) {
    return;
  }

  ranges.push(range);
}

function hasDenyAncestor(ancestors: Array<Root | Content>): boolean {
  return ancestors.some((ancestor) => DENY_ANCESTOR_TYPES.has(ancestor.type));
}

const HTML_VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

type HtmlTagKind = "open" | "close" | "neutral";

interface HtmlTag {
  start: number;
  end: number;
  kind: HtmlTagKind;
}

function collectHtmlDeniedRanges(tree: Root): TextRange[] {
  const tags: HtmlTag[] = [];
  collectHtmlTags(tree, tags);
  tags.sort((left, right) => left.start - right.start);

  const ranges: TextRange[] = [];
  let depth = 0;
  let openStart = 0;

  for (const tag of tags) {
    if (tag.kind === "open") {
      if (depth === 0) {
        openStart = tag.start;
      }
      depth += 1;
      continue;
    }

    if (tag.kind === "close" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        ranges.push({ start: openStart, end: tag.end });
      }
    }
  }

  return ranges;
}

function collectHtmlTags(node: Root | Content, tags: HtmlTag[]): void {
  if (node.type === "html") {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start != null && end != null) {
      tags.push({ start, end, kind: classifyHtmlTag(node.value) });
    }
  }

  if (!("children" in node) || !Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children as Content[]) {
    collectHtmlTags(child, tags);
  }
}

function classifyHtmlTag(value: string): HtmlTagKind {
  const trimmed = value.trim();

  if (
    trimmed.startsWith("<!--") ||
    trimmed.startsWith("<![CDATA[") ||
    trimmed.startsWith("<!") ||
    trimmed.startsWith("<?")
  ) {
    return "neutral";
  }

  if (trimmed.startsWith("</")) {
    return "close";
  }

  if (trimmed.endsWith("/>")) {
    return "neutral";
  }

  if (hasEmbeddedCloseTag(trimmed)) {
    return "neutral";
  }

  const name = readTagName(trimmed);
  if (name && HTML_VOID_ELEMENTS.has(name)) {
    return "neutral";
  }

  return trimmed.startsWith("<") ? "open" : "neutral";
}

function hasEmbeddedCloseTag(value: string): boolean {
  const withoutQuotedAttributes = value.replace(/"[^"]*"|'[^']*'/g, "");
  return withoutQuotedAttributes.includes("</");
}

function readTagName(value: string): string | null {
  if (!value.startsWith("<")) {
    return null;
  }

  let name = "";
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === "/" || character === ">" || /\s/.test(character)) {
      break;
    }
    name += character;
  }

  return name.length > 0 ? name.toLowerCase() : null;
}

function isWithinRanges(start: number, end: number, ranges: TextRange[]): boolean {
  return ranges.some((range) => start >= range.start && end <= range.end);
}

function isAutolinkText(parent: Link, node: Text): boolean {
  if (parent.url !== node.value) {
    return false;
  }

  const parentStart = parent.position?.start.offset;
  const parentEnd = parent.position?.end.offset;
  const textStart = node.position?.start.offset;
  const textEnd = node.position?.end.offset;
  if (parentStart == null || parentEnd == null || textStart == null || textEnd == null) {
    return false;
  }

  return parentStart === textStart && parentEnd === textEnd;
}

function extractImageAltRange(markdown: string, node: Image | ImageReference): TextRange | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start == null || end == null) {
    return null;
  }

  const imageSource = markdown.slice(start, end);
  if (!imageSource.startsWith("![")) {
    return null;
  }

  const altStartOffset = 2;
  const altEndOffset = findImageAltEnd(imageSource, altStartOffset);
  if (altEndOffset <= altStartOffset) {
    return null;
  }

  return {
    start: start + altStartOffset,
    end: start + altEndOffset,
  };
}

function findImageAltEnd(source: string, from: number): number {
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === "]" && !isEscapedByOddBackslashes(source, index)) {
      return index;
    }
  }

  return -1;
}

function isEscapedByOddBackslashes(source: string, index: number): boolean {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}
