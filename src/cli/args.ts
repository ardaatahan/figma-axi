// Strict flag parser (AXI principle 6): unknown flags fail loudly with the
// valid flag set inline so an agent can self-correct in one turn.

import type { CommandSpec } from "./spec.js";
import { UsageError } from "../output/errors.js";

export interface Parsed {
  positionals: string[];
  flags: Record<string, string | boolean>;
  help: boolean;
}

export function validFlagsHint(spec: CommandSpec): string {
  const names = spec.flags.map((f) => `--${f.name}`);
  names.push("--help");
  const scope = spec.name ? ` for '${spec.name}'` : "";
  return `valid flags${scope}: ${names.join(", ")}`;
}

function forScope(spec: CommandSpec): string {
  return spec.name ? ` for '${spec.name}'` : "";
}

export function parseArgs(argv: string[], spec: CommandSpec): Parsed {
  const flags: Record<string, string | boolean> = {};
  for (const f of spec.flags) {
    if (f.default !== undefined) flags[f.name] = f.default;
  }
  const positionals: string[] = [];
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok === "--help") {
      help = true;
      continue;
    }
    if (tok.startsWith("--")) {
      let name = tok.slice(2);
      let inline: string | undefined;
      const eq = name.indexOf("=");
      if (eq >= 0) {
        inline = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      const flagSpec = spec.flags.find((f) => f.name === name);
      if (!flagSpec) {
        throw new UsageError(
          `unknown flag --${name}${forScope(spec)}`,
          validFlagsHint(spec),
        );
      }
      if (flagSpec.type === "boolean") {
        if (inline !== undefined) {
          throw new UsageError(
            `flag --${name} does not take a value`,
            validFlagsHint(spec),
          );
        }
        flags[name] = true;
      } else {
        let value = inline;
        if (value === undefined) {
          const next = argv[i + 1];
          if (next === undefined || next.startsWith("--")) {
            throw new UsageError(
              `flag --${name} requires a value`,
              `usage: --${name} <value>`,
            );
          }
          value = next;
          i++;
        }
        if (flagSpec.values && !flagSpec.values.includes(value)) {
          throw new UsageError(
            `invalid value '${value}' for --${name}`,
            `valid values: ${flagSpec.values.join(", ")}`,
          );
        }
        flags[name] = value;
      }
    } else if (tok.startsWith("-") && tok.length > 1) {
      throw new UsageError(
        `unknown flag ${tok}${forScope(spec)}`,
        `${validFlagsHint(spec)} (short flags are not supported)`,
      );
    } else {
      positionals.push(tok);
    }
  }

  if (!help) {
    const required = (spec.args ?? []).filter((a) => a.required);
    if (positionals.length < required.length) {
      const missing = required[positionals.length]!;
      throw new UsageError(
        `missing required argument <${missing.name}>${forScope(spec)}`,
        spec.examples[0] ?? `run '${spec.name} --help'`,
      );
    }
  }

  return { positionals, flags, help };
}
