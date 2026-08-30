// CommandSpec is the single source of truth for a command: the parser
// validates against it, --help renders from it, and SKILL.md docs cite it.

export interface ArgSpec {
  name: string;
  required: boolean;
  description: string;
}

export interface FlagSpec {
  /** kebab-case, without the leading --. */
  name: string;
  type: "string" | "boolean";
  default?: string | boolean;
  /** When set, string values are validated against this list. */
  values?: string[];
  description: string;
}

export interface CommandSpec {
  /** Full command path, e.g. "principles show". Empty string for the root. */
  name: string;
  summary: string;
  args?: ArgSpec[];
  flags: FlagSpec[];
  examples: string[];
}
