// `figma-axi export <key-or-url> --node <ids> --format png` — asks Figma to
// render the nodes, downloads the resulting pre-signed URLs, and prints the
// local file paths.

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CommandModule } from "../cli/router.js";
import { AxiError, UsageError } from "../output/errors.js";
import { emitList, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { apiGet, downloadTo } from "../figma/api.js";
import { normalizeNodeId, parseFileRef } from "../figma/urls.js";

interface ImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

export const exportCommand: CommandModule = {
  spec: {
    name: "export",
    summary: "Render nodes to image files and download them locally",
    args: [{ name: "key-or-url", required: true, description: "Figma file key or file URL" }],
    flags: [
      { name: "node", type: "string", description: "comma-separated node ids to render (falls back to the URL's ?node-id=)" },
      { name: "format", type: "string", default: "png", values: ["png", "svg", "jpg", "pdf"], description: "image format" },
      { name: "scale", type: "string", default: "1", description: "scaling factor between 0.01 and 4 (png/jpg only)" },
      { name: "out", type: "string", default: ".", description: "directory to write files into (created if missing)" },
    ],
    examples: [
      "figma-axi export AbCdEf123456 --node 1:2 --format png --scale 2",
      "figma-axi export AbCdEf123456 --node 1:2,1:3 --format svg --out ./assets",
      "figma-axi export 'https://www.figma.com/design/AbCdEf123456/Site?node-id=1-2' --format pdf",
    ],
  },
  async run(parsed) {
    const ref = parseFileRef(parsed.positionals[0]!);
    const nodeFlag = parsed.flags["node"] as string | undefined;
    const rawIds = nodeFlag ? nodeFlag.split(",") : ref.nodeId ? [ref.nodeId] : [];
    if (rawIds.length === 0) {
      throw new UsageError(
        "no nodes to export",
        `pass --node <id>[,<id>...] (find ids via: figma-axi file ${ref.key})`,
      );
    }
    const ids = rawIds.map(normalizeNodeId);
    const format = String(parsed.flags["format"]);
    const scale = Number(parsed.flags["scale"]);
    if (!Number.isFinite(scale) || scale < 0.01 || scale > 4) {
      throw new UsageError(`invalid --scale '${parsed.flags["scale"]}'`, "use a number between 0.01 and 4");
    }
    const outDir = resolve(String(parsed.flags["out"]));

    const res = (await apiGet(`/v1/images/${ref.key}`, {
      ids: ids.join(","),
      format,
      scale,
    })) as ImagesResponse;
    if (res.err) {
      throw new AxiError(`Figma could not render: ${res.err}`, "check the node ids and format");
    }

    mkdirSync(outDir, { recursive: true });
    const rows: Array<Record<string, unknown>> = [];
    let ok = 0;
    for (const id of ids) {
      const url = res.images[id];
      if (!url) {
        rows.push({ node: id, file: "", bytes: "", status: "render-failed" });
        continue;
      }
      const scaleTag = format === "png" || format === "jpg" ? (scale !== 1 ? `@${scale}x` : "") : "";
      const filePath = join(outDir, `${id.replace(/[:;]/g, "-")}${scaleTag}.${format}`);
      const bytes = await downloadTo(url, filePath);
      rows.push({ node: id, file: filePath, bytes, status: "ok" });
      ok++;
    }

    print(emitList("exports", rows, ["node", "file", "bytes", "status"]));
    if (ok < ids.length) {
      print(`note: ${ids.length - ok} of ${ids.length} nodes failed to render (bad id, or node has nothing renderable)`);
    }
    print(
      helpBlock([
        `figma-axi node ${ref.key} <node-id>  # verify a node id before exporting`,
        `figma-axi export ${ref.key} --node <node-id> --format svg`,
      ]),
    );
    return ok > 0 ? 0 : 1;
  },
};
