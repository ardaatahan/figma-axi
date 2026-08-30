// File-key and node-id parsing. Every command accepts either a raw file key
// or a full Figma URL; node ids accept both the API form ("12:34") and the
// URL form ("12-34").

import { UsageError } from "../output/errors.js";

export interface FileRef {
  key: string;
  /** Node id parsed from a URL's ?node-id= param, normalized to API form. */
  nodeId?: string;
}

const URL_PATH_KINDS = new Set(["design", "file", "board", "proto", "slides", "make"]);
// File keys are opaque url-safe identifiers; keep the check permissive.
const KEY_RE = /^[A-Za-z0-9_-]{10,128}$/;

/** Normalizes a node id to the API form: "12-34" -> "12:34". */
export function normalizeNodeId(id: string): string {
  const trimmed = id.trim();
  const m = /^(I?[0-9]+)[:-]([0-9]+(?:;[0-9]+[:-][0-9]+)*)$/.exec(trimmed);
  if (!m) {
    throw new UsageError(
      `invalid node id '${trimmed}'`,
      "node ids look like '12:34' (or '12-34' as they appear in Figma URLs)",
    );
  }
  return `${m[1]}:${m[2]!.replace(/-/g, ":")}`;
}

/**
 * Parses a file key or any Figma file URL, e.g.
 * https://www.figma.com/design/<key>/<title>?node-id=1-2
 */
export function parseFileRef(input: string): FileRef {
  const raw = input.trim();
  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new UsageError(`could not parse URL '${raw}'`, "pass a figma.com file URL or a raw file key");
    }
    if (!/(^|\.)figma\.com$/.test(url.hostname)) {
      throw new UsageError(
        `'${url.hostname}' is not a figma.com URL`,
        "pass a figma.com file URL or a raw file key",
      );
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const kindIndex = segments.findIndex((s) => URL_PATH_KINDS.has(s));
    const key = kindIndex >= 0 ? segments[kindIndex + 1] : undefined;
    if (!key || !KEY_RE.test(key)) {
      throw new UsageError(
        `no file key found in URL '${raw}'`,
        "expected a URL like https://www.figma.com/design/<key>/<title>",
      );
    }
    const ref: FileRef = { key };
    const nodeParam = url.searchParams.get("node-id");
    if (nodeParam) ref.nodeId = normalizeNodeId(nodeParam);
    return ref;
  }
  if (!KEY_RE.test(raw)) {
    throw new UsageError(
      `'${raw}' does not look like a Figma file key or URL`,
      "file keys appear in Figma URLs: https://www.figma.com/design/<key>/<title>",
    );
  }
  return { key: raw };
}
