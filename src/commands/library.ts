// `figma-axi styles <key>` and `figma-axi components <key>` — published
// library styles/components. The REST API exposes names and metadata only;
// concrete values (colors, typography) live on the style's node, so the
// suggestions point at `figma-axi node`.

import type { CommandModule } from "../cli/router.js";
import { UsageError } from "../output/errors.js";
import { emitList, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { apiGet } from "../figma/api.js";
import { parseFileRef } from "../figma/urls.js";

interface PublishedStyle {
  key: string;
  node_id: string;
  style_type: string;
  name: string;
  description: string;
  updated_at: string;
}

interface PublishedComponent {
  key: string;
  node_id: string;
  name: string;
  description: string;
  updated_at: string;
  containing_frame?: { pageName?: string; containingComponentSet?: { name?: string } | null };
}

const STYLE_FIELDS = ["node_id", "name", "type", "description", "key", "updated_at"];
const COMPONENT_FIELDS = ["node_id", "name", "page", "description", "set", "key", "updated_at"];

function parseFields(parsed: { flags: Record<string, string | boolean> }, valid: string[]): string[] {
  const fields = String(parsed.flags["fields"]).split(",").map((f) => f.trim());
  for (const f of fields) {
    if (!valid.includes(f)) {
      throw new UsageError(`unknown field '${f}' for --fields`, `valid fields: ${valid.join(", ")}`);
    }
  }
  return fields;
}

export const stylesCommand: CommandModule = {
  spec: {
    name: "styles",
    summary: "List published styles in a file library",
    args: [{ name: "key-or-url", required: true, description: "Figma file key or file URL" }],
    flags: [
      {
        name: "fields",
        type: "string",
        default: "node_id,name,type,description",
        description: `comma-separated columns from: ${STYLE_FIELDS.join(", ")}`,
      },
      { name: "type", type: "string", values: ["FILL", "TEXT", "EFFECT", "GRID"], description: "filter by style type" },
    ],
    examples: [
      "figma-axi styles AbCdEf123456",
      "figma-axi styles AbCdEf123456 --type TEXT --fields node_id,name,updated_at",
    ],
  },
  async run(parsed) {
    const ref = parseFileRef(parsed.positionals[0]!);
    const fields = parseFields(parsed, STYLE_FIELDS);
    const typeFilter = parsed.flags["type"] as string | undefined;

    const res = (await apiGet(`/v1/files/${ref.key}/styles`)) as { meta: { styles: PublishedStyle[] } };
    const all = res.meta.styles;
    const styles = typeFilter ? all.filter((s) => s.style_type === typeFilter) : all;

    if (styles.length === 0) {
      print(
        `styles: 0 published${typeFilter ? ` ${typeFilter}` : ""} styles in file ${ref.key}` +
          (all.length > 0 ? ` (${all.length} styles of other types exist)` : " (only styles published to a team library appear here)"),
      );
      print(helpBlock([`figma-axi file ${ref.key}`, `figma-axi variables ${ref.key}`]));
      return 0;
    }

    print(
      emitList(
        "styles",
        styles.map((s) => ({
          node_id: s.node_id,
          name: s.name,
          type: s.style_type,
          description: s.description,
          key: s.key,
          updated_at: s.updated_at,
        })),
        fields,
        { total: all.length },
      ),
    );
    print(
      helpBlock([
        `figma-axi node ${ref.key} <node_id>  # concrete values: colors, typography`,
        `figma-axi styles ${ref.key} --type FILL`,
        `figma-axi components ${ref.key}`,
      ]),
    );
    return 0;
  },
};

export const componentsCommand: CommandModule = {
  spec: {
    name: "components",
    summary: "List published components in a file library",
    args: [{ name: "key-or-url", required: true, description: "Figma file key or file URL" }],
    flags: [
      {
        name: "fields",
        type: "string",
        default: "node_id,name,page,description",
        description: `comma-separated columns from: ${COMPONENT_FIELDS.join(", ")}`,
      },
    ],
    examples: [
      "figma-axi components AbCdEf123456",
      "figma-axi components AbCdEf123456 --fields node_id,name,set,updated_at",
    ],
  },
  async run(parsed) {
    const ref = parseFileRef(parsed.positionals[0]!);
    const fields = parseFields(parsed, COMPONENT_FIELDS);

    const res = (await apiGet(`/v1/files/${ref.key}/components`)) as { meta: { components: PublishedComponent[] } };
    const components = res.meta.components;

    if (components.length === 0) {
      print(`components: 0 published components in file ${ref.key} (only components published to a team library appear here)`);
      print(helpBlock([`figma-axi file ${ref.key}`, `figma-axi styles ${ref.key}`]));
      return 0;
    }

    print(
      emitList(
        "components",
        components.map((c) => ({
          node_id: c.node_id,
          name: c.name,
          page: c.containing_frame?.pageName ?? "",
          description: c.description,
          set: c.containing_frame?.containingComponentSet?.name ?? "",
          key: c.key,
          updated_at: c.updated_at,
        })),
        fields,
      ),
    );
    print(
      helpBlock([
        `figma-axi node ${ref.key} <node_id>  # inspect a component's structure`,
        `figma-axi export ${ref.key} --node <node_id> --format svg`,
      ]),
    );
    return 0;
  },
};
