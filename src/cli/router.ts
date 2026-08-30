// Noun-verb command router. Generic over a Registry so scaffolded projects
// reuse it verbatim with their own command set.

import type { CommandSpec } from "./spec.js";
import { parseArgs, type Parsed } from "./args.js";
import { renderHelp } from "./help.js";
import { AxiError, renderError, UsageError } from "../output/errors.js";
import { emitList, print } from "../output/toon.js";

export interface CommandModule {
  spec: CommandSpec;
  run(parsed: Parsed): number | Promise<number>;
}

export interface Registry {
  /** Bin name used in help output, e.g. "axi-axi". */
  tool: string;
  /** The no-args home view (AXI principle 8). */
  root: CommandModule;
  /** Full tool reference for `--help` at the root. */
  rootHelp(): string;
  /** Commands keyed by full path, e.g. "principles show". */
  commands: Record<string, CommandModule>;
  /** Read-only aliases, e.g. "principles" -> "principles list". */
  aliases: Record<string, string>;
}

function topLevelCommands(reg: Registry): string {
  const tops = new Set<string>();
  for (const key of Object.keys(reg.commands)) tops.add(key.split(" ")[0]!);
  for (const key of Object.keys(reg.aliases)) tops.add(key.split(" ")[0]!);
  return [...tops].sort().join(", ");
}

export async function dispatch(reg: Registry, argv: string[]): Promise<number> {
  try {
    const words: string[] = [];
    for (const tok of argv) {
      if (tok.startsWith("-")) break;
      words.push(tok);
    }

    let key = "";
    let consumed = 0;
    for (let n = Math.min(2, words.length); n >= 1; n--) {
      const candidate = words.slice(0, n).join(" ");
      const resolved = reg.aliases[candidate] ?? candidate;
      if (reg.commands[resolved]) {
        key = resolved;
        consumed = n;
        break;
      }
    }

    if (!key) {
      if (words.length === 0) {
        const parsed = parseArgs(argv, reg.root.spec);
        if (parsed.help) {
          print(reg.rootHelp());
          return 0;
        }
        return await reg.root.run(parsed);
      }
      const first = words[0]!;
      const children = Object.keys(reg.commands).filter((c) =>
        c.startsWith(first + " "),
      );
      if (children.length > 0) {
        if (argv.includes("--help")) {
          print(
            emitList(
              "commands",
              children.map((c) => ({
                command: `${reg.tool} ${c}`,
                summary: reg.commands[c]!.spec.summary,
              })),
              ["command", "summary"],
            ),
          );
          return 0;
        }
        throw new UsageError(
          `'${first}' requires a subcommand`,
          `valid: ${children.map((c) => `${reg.tool} ${c}`).join(", ")}`,
        );
      }
      throw new UsageError(
        `unknown command '${words.join(" ")}'`,
        `valid commands: ${topLevelCommands(reg)}`,
      );
    }

    const mod = reg.commands[key]!;
    const parsed = parseArgs(argv.slice(consumed), mod.spec);
    if (parsed.help) {
      print(renderHelp(reg.tool, mod.spec));
      return 0;
    }
    return await mod.run(parsed);
  } catch (err) {
    if (err instanceof AxiError) {
      print(renderError(err));
      return err.exitCode;
    }
    const message = err instanceof Error ? err.message : String(err);
    print(
      renderError(
        new AxiError(
          `unexpected failure: ${message}`,
          "re-run with the same arguments; report if it persists",
        ),
      ),
    );
    if (err instanceof Error && err.stack) {
      process.stderr.write(err.stack + "\n");
    }
    return 1;
  }
}
