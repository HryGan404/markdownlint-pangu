const RULE_NAMES = [
  ["MD001", "heading-increment"],
  ["MD003", "heading-style"],
  ["MD004", "ul-style"],
  ["MD005", "list-indent"],
  ["MD007", "ul-indent"],
  ["MD009", "no-trailing-spaces"],
  ["MD010", "no-hard-tabs"],
  ["MD011", "no-reversed-links"],
  ["MD012", "no-multiple-blanks"],
  ["MD013", "line-length"],
  ["MD014", "commands-show-output"],
  ["MD018", "no-missing-space-atx"],
  ["MD019", "no-multiple-space-atx"],
  ["MD020", "no-missing-space-closed-atx"],
  ["MD021", "no-multiple-space-closed-atx"],
  ["MD022", "blanks-around-headings"],
  ["MD023", "heading-start-left"],
  ["MD024", "no-duplicate-heading"],
  ["MD025", "single-title", "single-h1"],
  ["MD026", "no-trailing-punctuation"],
  ["MD027", "no-multiple-space-blockquote"],
  ["MD028", "no-blanks-blockquote"],
  ["MD029", "ol-prefix"],
  ["MD030", "list-marker-space"],
  ["MD031", "blanks-around-fences"],
  ["MD032", "blanks-around-lists"],
  ["MD033", "no-inline-html"],
  ["MD034", "no-bare-urls"],
  ["MD035", "hr-style"],
  ["MD036", "no-emphasis-as-heading"],
  ["MD037", "no-space-in-emphasis"],
  ["MD038", "no-space-in-code"],
  ["MD039", "no-space-in-links"],
  ["MD040", "fenced-code-language"],
  ["MD041", "first-line-heading", "first-line-h1"],
  ["MD042", "no-empty-links"],
  ["MD043", "required-headings"],
  ["MD044", "proper-names"],
  ["MD045", "no-alt-text"],
  ["MD046", "code-block-style"],
  ["MD047", "single-trailing-newline"],
  ["MD048", "code-fence-style"],
  ["MD049", "emphasis-style"],
  ["MD050", "strong-style"],
  ["MD051", "link-fragments"],
  ["MD052", "reference-links-images"],
  ["MD053", "link-image-reference-definitions"],
  ["MD054", "link-image-style"],
  ["MD055", "table-pipe-style"],
  ["MD056", "table-column-count"],
  ["MD058", "blanks-around-tables"],
  ["MD059", "descriptive-link-text"],
  ["MD060", "table-column-style"],
] as const;

const RULE_TAGS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["MD001", ["headings"]],
  ["MD003", ["headings"]],
  ["MD004", ["bullet", "ul"]],
  ["MD005", ["bullet", "ul", "indentation"]],
  ["MD007", ["bullet", "ul", "indentation"]],
  ["MD009", ["whitespace"]],
  ["MD010", ["whitespace", "hard_tab"]],
  ["MD011", ["links"]],
  ["MD012", ["whitespace", "blank_lines"]],
  ["MD013", ["line_length"]],
  ["MD014", ["code"]],
  ["MD018", ["headings", "atx", "spaces"]],
  ["MD019", ["headings", "atx", "spaces"]],
  ["MD020", ["headings", "atx_closed", "spaces"]],
  ["MD021", ["headings", "atx_closed", "spaces"]],
  ["MD022", ["headings", "blank_lines"]],
  ["MD023", ["headings", "spaces"]],
  ["MD024", ["headings"]],
  ["MD025", ["headings"]],
  ["MD026", ["headings"]],
  ["MD027", ["blockquote", "whitespace", "indentation"]],
  ["MD028", ["blockquote", "whitespace"]],
  ["MD029", ["ol"]],
  ["MD030", ["ol", "ul", "whitespace"]],
  ["MD031", ["code", "blank_lines"]],
  ["MD032", ["bullet", "ul", "ol", "blank_lines"]],
  ["MD033", ["html"]],
  ["MD034", ["links", "url"]],
  ["MD035", ["hr"]],
  ["MD036", ["headings", "emphasis"]],
  ["MD037", ["whitespace", "emphasis"]],
  ["MD038", ["whitespace", "code"]],
  ["MD039", ["whitespace", "links"]],
  ["MD040", ["code", "language"]],
  ["MD041", ["headings"]],
  ["MD042", ["links"]],
  ["MD043", ["headings"]],
  ["MD044", ["spelling"]],
  ["MD045", ["accessibility", "images"]],
  ["MD046", ["code"]],
  ["MD047", ["blank_lines"]],
  ["MD048", ["code"]],
  ["MD049", ["emphasis"]],
  ["MD050", ["emphasis"]],
  ["MD051", ["links"]],
  ["MD052", ["images", "links"]],
  ["MD053", ["images", "links"]],
  ["MD054", ["images", "links"]],
  ["MD055", ["table"]],
  ["MD056", ["table"]],
  ["MD058", ["table"]],
  ["MD059", ["accessibility", "links"]],
  ["MD060", ["table"]],
];

const ALIASES = buildAliases();

export function resolveMarkdownlintRuleName(ruleName: string): string[] {
  return ALIASES.get(ruleName.toUpperCase()) ?? [ruleName];
}

export function resolveMarkdownlintConfigKey(
  config: Record<string, unknown>,
  ruleName: string,
): string | undefined {
  const keysByAlias = new Map<string, string[]>();

  for (const key of Object.keys(config)) {
    const keyUpper = key.toUpperCase();
    for (const resolvedName of resolveMarkdownlintRuleName(key)) {
      const keys = keysByAlias.get(resolvedName.toUpperCase()) ?? [];
      keys.push(key);
      keysByAlias.set(resolvedName.toUpperCase(), keys);
    }
  }

  for (const resolvedName of resolveMarkdownlintRuleName(ruleName)) {
    const keys = keysByAlias.get(resolvedName.toUpperCase());
    if (keys && keys.length > 0) {
      return keys[0];
    }
  }

  return undefined;
}

function buildAliases(): Map<string, string[]> {
  const aliases = new Map<string, string[]>();

  for (const names of RULE_NAMES) {
    const canonical = names[0];
    for (const name of names) {
      aliases.set(name.toUpperCase(), [canonical]);
    }
  }

  for (const [canonical, tags] of RULE_TAGS) {
    for (const tag of tags) {
      const key = tag.toUpperCase();
      const canonicalNames = aliases.get(key) ?? [];
      if (!canonicalNames.includes(canonical)) {
        canonicalNames.push(canonical);
      }
      aliases.set(key, canonicalNames);
    }
  }

  return aliases;
}
