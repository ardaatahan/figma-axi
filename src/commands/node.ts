// `figma-axi node <key-or-url> [node-id]` — one node's structure, layout,
// and style-relevant properties, summarized. `--full` dumps the raw node
// JSON for the cases the summary does not cover.

import type { CommandModule } from "../cli/router.js";
import { UsageError } from "../output/errors.js";
import { emitKV, emitList, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { truncate, truncationNote } from "../output/truncate.js";
import { apiGet } from "../figma/api.js";
import { normalizeNodeId, parseFileRef } from "../figma/urls.js";
import {
  countTree,
  layoutToString,
  paintsToString,
  sizeToString,
  typeStyleToString,
  type FigmaNode,
} from "../figma/summarize.js";

interface NodesResponse {
  name: string;
  nodes: Record<string, { document: FigmaNode; components: Record<string, { name?: string }> } | null>;
}

const TEXT_LIMIT = 500;

export const nodeCommand: CommandModule = {
  spec: {
    name: "node",
    summary: "Inspect one node: structure, layout, and style properties",
    args: [
      { name: "key-or-url", required: true, description: "Figma file key or file URL (node id is read from the URL when present)" },
      { name: "node-id", required: false, description: "node id, e.g. 1:2 or 1-2 (required unless the URL carries ?node-id=)" },
    ],
    flags: [
      { name: "full", type: "boolean", description: "print the raw node JSON instead of the summary" },
    ],
    examples: [
      "figma-axi node AbCdEf123456 1:2",
      "figma-axi node 'https://www.figma.com/design/AbCdEf123456/My-Site?node-id=1-2'",
      "figma-axi node AbCdEf123456 1:2 --full",
    ],
  },
  async run(parsed) {
    const ref = parseFileRef(parsed.positionals[0]!);
    const rawId = parsed.positionals[1] ?? ref.nodeId;
    if (!rawId) {
      throw new UsageError(
        "missing node id",
        `pass it as an argument (figma-axi node ${ref.key} 1:2) or use a URL containing ?node-id=`,
      );
    }
    const nodeId = normalizeNodeId(rawId);

    const res = (await apiGet(`/v1/files/${ref.key}/nodes`, { ids: nodeId })) as NodesResponse;
    const entry = res.nodes[nodeId];
    if (!entry || !entry.document) {
      print(`node: 0 results for id ${nodeId} in file ${ref.key} (the file was found; that node id does not exist in it)`);
      print(helpBlock([`figma-axi file ${ref.key}  # list pages and frames with their node ids`]));
      return 0;
    }
    const node = entry.document;

    if (parsed.flags["full"]) {
      print(`node-json: ${nodeId} in ${ref.key}`);
      print(JSON.stringify(node, null, 1));
      return 0;
    }

    const counts = countTree(node);
    const pairs: Array<[string, unknown]> = [
      ["node", node.name],
      ["id", node.id],
      ["type", node.type],
      ["file", res.name],
      ["size", sizeToString(node)],
    ];
    const layout = layoutToString(node);
    if (layout) pairs.push(["layout", layout]);
    const fills = paintsToString(node.fills);
    if (fills) pairs.push(["fills", fills]);
    const strokes = paintsToString(node.strokes);
    if (strokes) pairs.push(["strokes", strokes + (node.strokeWeight ? ` w=${node.strokeWeight}` : "")]);
    if (node.cornerRadius) pairs.push(["cornerRadius", node.cornerRadius]);
    if (node.opacity !== undefined && node.opacity < 1) pairs.push(["opacity", node.opacity]);
    const effects = (node.effects ?? []).filter((e) => e.visible !== false);
    if (effects.length > 0) pairs.push(["effects", effects.map((e) => e.type.toLowerCase()).join(" + ")]);
    if (node.componentId) {
      const compName = entry.components?.[node.componentId]?.name;
      pairs.push(["component", compName ? `${node.componentId} (${compName})` : node.componentId]);
    }
    const font = typeStyleToString(node.style);
    if (font) pairs.push(["font", font]);
    if (counts.total > 0) {
      pairs.push(["descendants", `${counts.total} (${counts.instances} instances, ${counts.texts} texts)`]);
    }
    print(emitKV(pairs));

    if (node.characters) {
      const t = truncate(node.characters, TEXT_LIMIT);
      print(`text: ${JSON.stringify(t.text)}`);
      if (t.truncated) {
        print(truncationNote(t));
        print(`  see all: figma-axi node ${ref.key} ${nodeId} --full`);
      }
    }

    const children = node.children ?? [];
    if (children.length > 0) {
      print(
        emitList(
          "children",
          children.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            size: sizeToString(c),
            layout: layoutToString(c),
            fills: paintsToString(c.fills),
          })),
          ["id", "name", "type", "size", "layout", "fills"],
        ),
      );
    }

    print(
      helpBlock([
        `figma-axi node ${ref.key} <child-id>  # drill into a child`,
        `figma-axi export ${ref.key} --node ${nodeId} --format png`,
        `figma-axi node ${ref.key} ${nodeId} --full  # raw node JSON`,
      ]),
    );
    return 0;
  },
};
