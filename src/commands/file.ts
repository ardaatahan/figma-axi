// `figma-axi file <key-or-url>` — compact overview of a (potentially huge)
// Figma file. Fetches with depth=2 by default so the API returns only pages
// and their top-level children, never the full multi-MB tree.

import type { CommandModule } from "../cli/router.js";
import { UsageError } from "../output/errors.js";
import { emitKV, emitList, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { apiGet } from "../figma/api.js";
import { parseFileRef } from "../figma/urls.js";
import {
  countTree,
  layoutToString,
  sizeToString,
  type FigmaNode,
} from "../figma/summarize.js";

interface FileResponse {
  name: string;
  lastModified: string;
  version: string;
  editorType: string;
  document: FigmaNode;
  components: Record<string, unknown>;
  componentSets: Record<string, unknown>;
  styles: Record<string, unknown>;
}

const FRAME_FIELDS = ["id", "name", "page", "size", "layout", "type", "descendants"];
const DEFAULT_FRAME_FIELDS = ["id", "name", "page", "size"];
const MAX_FRAME_ROWS = 100;

export const fileCommand: CommandModule = {
  spec: {
    name: "file",
    summary: "Summarize a Figma file: pages, top-level frames, and counts",
    args: [{ name: "key-or-url", required: true, description: "Figma file key or file URL" }],
    flags: [
      {
        name: "depth",
        type: "string",
        default: "2",
        description: "tree depth to fetch (2 = pages + top-level frames; higher adds descendant counts)",
      },
      {
        name: "fields",
        type: "string",
        default: DEFAULT_FRAME_FIELDS.join(","),
        description: `comma-separated frame columns from: ${FRAME_FIELDS.join(", ")}`,
      },
      { name: "page", type: "string", description: "only list frames on this page (id or name)" },
    ],
    examples: [
      "figma-axi file https://www.figma.com/design/AbCdEf123456/My-Site",
      "figma-axi file AbCdEf123456 --depth 3 --fields id,name,page,size,descendants",
      "figma-axi file AbCdEf123456 --page Homepage",
    ],
  },
  async run(parsed) {
    const ref = parseFileRef(parsed.positionals[0]!);
    const depth = Number(parsed.flags["depth"]);
    if (!Number.isInteger(depth) || depth < 1) {
      throw new UsageError(`invalid --depth '${parsed.flags["depth"]}'`, "use a positive integer, e.g. --depth 2");
    }
    const fields = String(parsed.flags["fields"]).split(",").map((f) => f.trim());
    for (const f of fields) {
      if (!FRAME_FIELDS.includes(f)) {
        throw new UsageError(`unknown field '${f}' for --fields`, `valid fields: ${FRAME_FIELDS.join(", ")}`);
      }
    }
    const pageFilter = parsed.flags["page"] as string | undefined;

    const file = (await apiGet(`/v1/files/${ref.key}`, { depth })) as FileResponse;
    const pages = file.document.children ?? [];
    const selected = pageFilter
      ? pages.filter((p) => p.id === pageFilter || p.name === pageFilter)
      : pages;
    if (pageFilter && selected.length === 0) {
      print(`pages: 0 pages matching '${pageFilter}' in file ${ref.key} (${pages.length} pages exist)`);
      print(emitList("pages", pages.map((p) => ({ id: p.id, name: p.name })), ["id", "name"]));
      return 0;
    }

    print(
      emitKV([
        ["file", file.name],
        ["key", ref.key],
        ["lastModified", file.lastModified],
        ["version", file.version],
        ["editorType", file.editorType],
        ["componentsUsed", Object.keys(file.components ?? {}).length],
        ["stylesUsed", Object.keys(file.styles ?? {}).length],
      ]),
    );

    print(
      emitList(
        "pages",
        selected.map((p) => ({ id: p.id, name: p.name, topLevel: (p.children ?? []).length })),
        ["id", "name", "topLevel"],
        { total: pages.length },
      ),
    );

    const frames: Array<Record<string, unknown>> = [];
    for (const page of selected) {
      for (const child of page.children ?? []) {
        const counts = depth > 2 ? countTree(child) : undefined;
        frames.push({
          id: child.id,
          name: child.name,
          page: page.name,
          size: sizeToString(child),
          layout: layoutToString(child),
          type: child.type,
          descendants: counts ? counts.total : "",
        });
      }
    }

    if (frames.length === 0) {
      print(`frames: 0 top-level frames in file ${ref.key}${pageFilter ? ` (page '${pageFilter}')` : ""}`);
    } else {
      print(emitList("frames", frames.slice(0, MAX_FRAME_ROWS), fields, { total: frames.length }));
    }

    print(
      helpBlock([
        `figma-axi node ${ref.key} <node-id>  # inspect one frame's layout and styles`,
        `figma-axi export ${ref.key} --node <node-id> --format png  # render to a local file`,
        `figma-axi styles ${ref.key}`,
        `figma-axi comments ${ref.key}`,
      ]),
    );
    return 0;
  },
};
