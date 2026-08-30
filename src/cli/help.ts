// Per-subcommand --help rendered from CommandSpec (AXI principle 10).

import type { CommandSpec } from "./spec.js";
import { emitBlock, emitList } from "../output/toon.js";

export function renderHelp(tool: string, spec: CommandSpec): string {
  const parts: string[] = [];
  parts.push(`command: ${[tool, spec.name].filter(Boolean).join(" ")}`);
  parts.push(`summary: ${spec.summary}`);

  const args = spec.args ?? [];
  if (args.length > 0) {
    parts.push(
      emitList(
        "args",
        args.map((a) => ({
          name: a.name,
          required: a.required ? "yes" : "no",
          description: a.description,
        })),
        ["name", "required", "description"],
      ),
    );
  }

  const flagRows = spec.flags.map((f) => ({
    flag: `--${f.name}`,
    default: f.default === undefined ? "" : String(f.default),
    description: f.values
      ? `${f.description} (${f.values.join("|")})`
      : f.description,
  }));
  flagRows.push({ flag: "--help", default: "", description: "show this help" });
  parts.push(emitList("flags", flagRows, ["flag", "default", "description"]));

  if (spec.examples.length > 0) {
    parts.push(emitBlock("examples", spec.examples));
  }
  return parts.join("\n");
}
