export type CommandName = "check" | "fix";
export const OUTPUT_FORMATS = ["text", "json"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export const DEFAULT_OUTPUT_FORMAT: OutputFormat = "text";
export type Severity = "error";

export interface CliOptions {
  format?: OutputFormat;
  panguOff?: boolean;
  markdownlintOff?: boolean;
  configPath?: string;
  panguConfigPath?: string;
  rules?: string[];
  disable?: string[];
  stdin?: boolean;
  stdinFilepath?: string;
  quiet?: boolean;
}

export interface PanguConfig {
  pangu?: {
    enabled?: boolean;
    ignorePatterns?: string[];
    ignoreBlocks?: string[];
  };
}

export interface ResolvedOptions {
  command: CommandName;
  cwd: string;
  markdownlint: {
    enabled: boolean;
    config: Record<string, unknown>;
    rules?: string[];
    disable?: string[];
  };
  pangu: {
    enabled: boolean;
    ignorePatterns: string[];
    ignoreBlocks: string[];
  };
  output: {
    format: OutputFormat;
    quiet: boolean;
  };
  input: {
    stdin: boolean;
    stdinFilepath?: string;
  };
}
