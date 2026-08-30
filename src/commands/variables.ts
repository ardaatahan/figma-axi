// `figma-axi variables <key>` — local variables (design tokens). The
// endpoint is available to full members of Figma Enterprise orgs only, so a
// 403 gets a clear plan-gated message rather than a generic failure.

import type { CommandModule } from "../cli/router.js";
import { AxiError, UsageError } from "../output/errors.js";
import { emitList, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { apiGet, FigmaApiError } from "../figma/api.js";
import { parseFileRef } from "../figma/urls.js";
import { rgbaToHex, type RGBA } from "../figma/summarize.js";

type VariableValue = boolean | number | string | RGBA | { type: "VARIABLE_ALIAS"; id: string };

interface LocalVariable {
  id: string;
  name: string;
  resolvedType: string;
  variableCollectionId: string;
  valuesByMode: Record<string, VariableValue>;
  description: string;
}

interface LocalVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
}

interface VariablesResponse {
  meta: {
    variables: Record<string, LocalVariable>;
    variableCollections: Record<string, LocalVariableCollection>;
  };
}

function valueToString(v: VariableValue | undefined, variables: Record<string, LocalVariable>): string {
  if (v === undefined) return "";
  if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return String(v);
  if ("type" in v && v.type === "VARIABLE_ALIAS") {
    const target = variables[v.id];
    return `alias:${target ? target.name : v.id}`;
  }
  return rgbaToHex(v as RGBA);
}

export const variablesCommand: CommandModule = {
  spec: {
    name: "variables",
    summary: "List local variables (design tokens) — Figma Enterprise plans only",
    args: [{ name: "key-or-url", required: true, description: "Figma file key or file URL" }],
    flags: [
      { name: "collection", type: "string", description: "only variables in this collection (id or name)" },
      { name: "mode", type: "string", description: "show values for this mode (id or name; default: each collection's default mode)" },
    ],
    examples: [
      "figma-axi variables AbCdEf123456",
      "figma-axi variables AbCdEf123456 --collection Colors --mode Dark",
    ],
  },
  async run(parsed) {
    const ref = parseFileRef(parsed.positionals[0]!);
    let res: VariablesResponse;
    try {
      res = (await apiGet(`/v1/files/${ref.key}/variables/local`)) as VariablesResponse;
    } catch (err) {
      if (err instanceof FigmaApiError && (err.status === 403 || err.status === 401)) {
        throw new AxiError(
          "the variables API is plan-gated: Figma exposes it to full members of Enterprise orgs only",
          `this is expected on other plans — use figma-axi styles ${ref.key} for published styles instead`,
        );
      }
      throw err;
    }

    const variables = res.meta.variables;
    const collections = res.meta.variableCollections;
    const collectionFilter = parsed.flags["collection"] as string | undefined;
    const modeFilter = parsed.flags["mode"] as string | undefined;

    let selected = Object.values(collections);
    if (collectionFilter) {
      selected = selected.filter((c) => c.id === collectionFilter || c.name === collectionFilter);
      if (selected.length === 0) {
        const names = Object.values(collections).map((c) => c.name).join(", ");
        throw new UsageError(
          `no variable collection '${collectionFilter}' in file ${ref.key}`,
          names ? `collections: ${names}` : "this file has no variable collections",
        );
      }
    }

    if (Object.keys(variables).length === 0) {
      print(`variables: 0 local variables in file ${ref.key} (the query succeeded; the file defines none)`);
      print(helpBlock([`figma-axi styles ${ref.key}`]));
      return 0;
    }

    print(
      emitList(
        "collections",
        Object.values(collections).map((c) => ({
          id: c.id,
          name: c.name,
          modes: c.modes.map((m) => m.name).join(" | "),
          variables: c.variableIds.length,
        })),
        ["id", "name", "modes", "variables"],
      ),
    );

    const rows: Array<Record<string, unknown>> = [];
    for (const col of selected) {
      let modeId = col.defaultModeId;
      let modeName = col.modes.find((m) => m.modeId === col.defaultModeId)?.name ?? "";
      if (modeFilter) {
        const mode = col.modes.find((m) => m.modeId === modeFilter || m.name === modeFilter);
        if (!mode) continue;
        modeId = mode.modeId;
        modeName = mode.name;
      }
      for (const id of col.variableIds) {
        const v = variables[id];
        if (!v) continue;
        rows.push({
          name: v.name,
          type: v.resolvedType,
          value: valueToString(v.valuesByMode[modeId], variables),
          collection: col.name,
          mode: modeName,
        });
      }
    }

    if (rows.length === 0) {
      print(
        `variables: 0 variables matching` +
          `${collectionFilter ? ` collection '${collectionFilter}'` : ""}${modeFilter ? ` mode '${modeFilter}'` : ""} in file ${ref.key}`,
      );
      print(helpBlock([`figma-axi variables ${ref.key}`]));
      return 0;
    }

    print(emitList("variables", rows, ["name", "type", "value", "collection", "mode"], { total: Object.keys(variables).length }));
    print(
      helpBlock([
        `figma-axi variables ${ref.key} --collection <name> --mode <name>`,
        `figma-axi styles ${ref.key}`,
      ]),
    );
    return 0;
  },
};
