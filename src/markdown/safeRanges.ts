import type { Content, Image, ImageReference, Link, Root, Text } from "mdast";

import { parseMarkdown } from "./parseMarkdown.js";

export interface TextRange {
  start: number;
  end: number;
}
export interface SpacingRange extends TextRange {
  blocked: BlockedRange[];
}

export interface BlockedRange extends TextRange {
  allowInsertionAtBoundary?: boolean;
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

const INLINE_CONTAINER_TYPES = new Set([
  "paragraph",
  "heading",
  "tableCell",
]);

export function collectSafeRanges(markdown: string): TextRange[] {
  const tree = parseMarkdown(markdown);
  const deniedHtmlRanges = collectHtmlDeniedRanges(tree);
  const ranges: TextRange[] = [];

  walkNode(tree, [], markdown, deniedHtmlRanges, ranges);

  return ranges.sort((left, right) => left.start - right.start);
}

export function collectSpacingRanges(markdown: string): SpacingRange[] {
  const tree = parseMarkdown(markdown);
  const deniedHtmlRanges = collectHtmlDeniedRanges(tree);
  const ranges: SpacingRange[] = [];
  collectSpacingContainers(
    tree,
    [],
    markdown,
    deniedHtmlRanges,
    ranges,
  );

  return ranges.sort((left, right) => left.start - right.start);
}

function collectSpacingContainers(
  node: Root | Content,
  ancestors: Array<Root | Content>,
  markdown: string,
  deniedHtmlRanges: TextRange[],
  ranges: SpacingRange[],
): void {
  if (INLINE_CONTAINER_TYPES.has(node.type)) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start != null && end != null && start < end) {
      const masks: BlockedRange[] = [];
      collectBlockedRanges(node, ancestors, markdown, deniedHtmlRanges, masks);
      ranges.push({ start, end, blocked: mergeNestedRanges(masks) });
    }
  }

  if (!("children" in node) || !Array.isArray(node.children)) {
    return;
  }

  const nextAncestors = [...ancestors, node];
  for (const child of node.children as Content[]) {
    collectSpacingContainers(
      child,
      nextAncestors,
      markdown,
      deniedHtmlRanges,
      ranges,
    );
  }
}

function collectBlockedRanges(
  node: Root | Content,
  ancestors: Array<Root | Content>,
  markdown: string,
  deniedHtmlRanges: TextRange[],
  ranges: BlockedRange[],
): void {
  if (node.type === "image" || node.type === "imageReference") {
    const imageRange = nodeSpan(node);
    const altRange = imageRange ? extractImageAltRange(markdown, node) : null;
    if (imageRange) {
      ranges.push({ start: imageRange.start, end: imageRange.start + 2 });
      if (altRange) {
        ranges.push(...collectHtmlDeniedRangesInImageAlt(markdown.slice(altRange.start, altRange.end), altRange.start));
        const suffixStart = altRange.end + 1;
        if (suffixStart < imageRange.end) {
          ranges.push({ start: suffixStart, end: imageRange.end });
        }
      } else {
        ranges.push({ start: imageRange.start + 2, end: imageRange.end });
      }
    }
    return;
  }

  if (node.type === "link") {
    const span = nodeSpan(node);
    const child = node.children[0];
    const childSpan = child ? nodeSpan(child) : null;
    if (span && childSpan) {
      if (isAutolink(node, markdown)) {
        ranges.push(span);
        return;
      }
      ranges.push({
        start: span.start,
        end: childSpan.start,
        allowInsertionAtBoundary: true,
      });
      ranges.push({
        start: childSpan.end,
        end: span.end,
        allowInsertionAtBoundary: true,
      });
    } else if (span) {
      ranges.push(span);
    }
    return;
  }

  if (
    node.type === "linkReference" ||
    node.type === "inlineCode" ||
    node.type === "inlineMath" ||
    node.type === "footnoteReference"
  ) {
    const span = nodeSpan(node);
    if (span) {
      ranges.push(span);
    }
    return;
  }

  if (node.type === "html") {
    const span = nodeSpan(node);
    if (span) {
      ranges.push(span);
    }
    return;
  }

  if (node.type === "text") {
    const span = nodeSpan(node);
    if (!span) {
      return;
    }
    const blocked = deniedHtmlRanges.filter(
      (range) => range.start < span.end && range.end > span.start,
    );
    ranges.push(...blocked);
    return;
  }

  if (
    node.type === "emphasis" ||
    node.type === "strong" ||
    node.type === "delete"
  ) {
    const span = nodeSpan(node);
    const first = "children" in node && node.children.length > 0
      ? nodeSpan(node.children[0]!)
      : null;
    const last = "children" in node && node.children.length > 0
      ? nodeSpan(node.children.at(-1)!)
      : null;
    if (span && first && last) {
      ranges.push({ start: span.start, end: first.start });
      ranges.push({ start: last.end, end: span.end });
    }
  }

  if ("children" in node && Array.isArray(node.children)) {
    const nextAncestors = [...ancestors, node];
    for (const child of node.children as Content[]) {
      collectBlockedRanges(child, nextAncestors, markdown, deniedHtmlRanges, ranges);
    }
  }
}

function mergeNestedRanges(ranges: BlockedRange[]): BlockedRange[] {
  const sorted = [...ranges].sort((left, right) => {
    return left.start - right.start || right.end - left.end;
  });
  const merged: BlockedRange[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start >= previous.start && range.end <= previous.end) {
      previous.allowInsertionAtBoundary =
        previous.allowInsertionAtBoundary === true && range.allowInsertionAtBoundary === true;
      continue;
    }
    merged.push(range);
  }

  return merged;
}

function walkNode(
  node: Root | Content,
  ancestors: Array<Root | Content>,
  markdown: string,
  deniedHtmlRanges: TextRange[],
  ranges: TextRange[],
): void {
  if (node.type === "text") {
    collectTextRange(node, ancestors, markdown, deniedHtmlRanges, ranges);
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
  markdown: string,
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

  if (parent.type === "link" && isAutolinkText(parent, node, markdown)) {
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

function nodeSpan(node: Root | Content): TextRange | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start == null || end == null || start >= end ? null : { start, end };
}

function isAutolink(node: Content, markdown: string): boolean {
  if (node.type !== "link" || node.children.length !== 1) {
    return false;
  }
  const child = node.children[0];
  const span = nodeSpan(node);
  if (!span || child?.type !== "text" || node.url !== child.value) {
    return false;
  }
  const source = markdown.slice(span.start, span.end);
  return source.startsWith("<") && source.endsWith(">");
}

function isAutolinkText(parent: Link, node: Text, markdown: string): boolean {
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

  if (parentStart === textStart && parentEnd === textEnd) {
    return true;
  }

  const source = markdown.slice(parentStart, parentEnd);
  return source.startsWith("<") && source.endsWith(">");
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
  let depth = 1;
  for (let index = from; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "[") {
      depth += 1;
      continue;
    }
    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function collectHtmlDeniedRangesInImageAlt(source: string, offset: number): TextRange[] {
  const tags: Array<TextRange & { kind: HtmlTagKind }> = [];
  const pattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g;

  for (const match of source.matchAll(pattern)) {
    tags.push({
      start: offset + match.index,
      end: offset + match.index + match[0].length,
      kind: classifyHtmlTag(match[0]),
    });
  }

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
