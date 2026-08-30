// In-process mock of the Figma REST API, driven by fixtures that mirror the
// documented response shapes (figma/rest-api-spec). The E2E tests point the
// CLI at it via FIGMA_API_BASE.

import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FILE_KEY = "AbCdEf123456";
export const GATED_KEY = "GatedFile1234";
export const EMPTY_KEY = "EmptyFile1234";
export const TEST_TOKEN = "figd_test_not_a_real_token";

function fixture(name: string): unknown {
  const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export interface MockFigma {
  base: string;
  /** Requests seen, as "METHOD /path" strings. */
  requests: string[];
  lastPostBody?: unknown;
  close(): Promise<void>;
}

export async function startMockFigma(): Promise<MockFigma> {
  const requests: string[] = [];
  const state: { lastPostBody?: unknown } = {};
  // Assigned once the server is listening; requests only arrive after that.
  let base = "";

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const path = url.pathname;
    requests.push(`${req.method} ${path}`);

    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (path.startsWith("/render/")) {
      // Pre-signed render URLs carry no auth header.
      if (req.headers["x-figma-token"] || req.headers["authorization"]) {
        return json(400, { status: 400, err: "unexpected auth header on render URL" });
      }
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(PNG_BYTES);
    }

    if (req.headers["x-figma-token"] !== TEST_TOKEN) {
      return json(403, { status: 403, err: "Invalid token" });
    }

    if (req.method === "POST" && path === `/v1/files/${FILE_KEY}/comments`) {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = JSON.parse(raw) as Record<string, unknown>;
        state.lastPostBody = body;
        json(200, {
          id: "201",
          client_meta: body["client_meta"] ?? null,
          file_key: FILE_KEY,
          user: { id: "u9", handle: "you", img_url: "https://example.invalid/u9.png" },
          created_at: "2026-08-30T10:00:00Z",
          resolved_at: null,
          message: body["message"],
          order_id: "3",
          reactions: [],
          ...(body["comment_id"] ? { parent_id: body["comment_id"] } : {}),
        });
      });
      return;
    }

    switch (path) {
      case `/v1/files/${FILE_KEY}`:
        return json(200, fixture("file"));
      case `/v1/files/${FILE_KEY}/nodes`: {
        const ids = url.searchParams.get("ids") ?? "";
        if (ids === "1:2") return json(200, fixture("nodes"));
        const base = fixture("nodes") as { nodes: Record<string, unknown> };
        return json(200, { ...base, nodes: Object.fromEntries(ids.split(",").map((id) => [id, null])) });
      }
      case `/v1/images/${FILE_KEY}`: {
        const ids = (url.searchParams.get("ids") ?? "").split(",");
        const images: Record<string, string | null> = {};
        for (const id of ids) {
          images[id] = id === "9:9" ? null : `${base}/render/${id.replace(/:/g, "-")}.png`;
        }
        return json(200, { err: null, images });
      }
      case `/v1/files/${FILE_KEY}/styles`:
        return json(200, fixture("styles"));
      case `/v1/files/${EMPTY_KEY}/styles`:
        return json(200, { status: 200, error: false, meta: { styles: [] } });
      case `/v1/files/${FILE_KEY}/components`:
        return json(200, fixture("components"));
      case `/v1/files/${EMPTY_KEY}/components`:
        return json(200, { status: 200, error: false, meta: { components: [] } });
      case `/v1/files/${FILE_KEY}/comments`:
        return json(200, fixture("comments"));
      case `/v1/files/${EMPTY_KEY}/comments`:
        return json(200, { comments: [] });
      case `/v1/files/${FILE_KEY}/variables/local`:
        return json(200, fixture("variables"));
      case `/v1/files/${GATED_KEY}/variables/local`:
        return json(403, { error: true, status: 403, message: "Limited by Figma plan." });
      default:
        return json(404, { status: 404, err: "Not found" });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;

  return {
    base,
    requests,
    get lastPostBody() {
      return state.lastPostBody;
    },
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
