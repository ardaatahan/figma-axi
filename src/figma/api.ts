// Figma REST API client on the Node built-in fetch. FIGMA_API_BASE overrides
// the base URL (used by the offline test suite; also handy behind proxies).

import { AxiError } from "../output/errors.js";
import { requireToken } from "./token.js";

export const DEFAULT_BASE = "https://api.figma.com";
const REQUEST_TIMEOUT_MS = 30_000;

export function apiBase(): string {
  return (process.env["FIGMA_API_BASE"] || DEFAULT_BASE).replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  const { token, kind } = requireToken();
  return kind === "oauth"
    ? { Authorization: `Bearer ${token}` }
    : { "X-Figma-Token": token };
}

/** Figma error payloads: {status, err} or {error: true, status, message}. */
function errorMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b["err"] === "string") return b["err"];
    if (typeof b["message"] === "string") return b["message"];
  }
  return undefined;
}

function suggestionFor(status: number, path: string): string {
  if (status === 401) return "the token was rejected; create a new personal access token at figma.com > settings > security";
  if (status === 403) {
    if (path.includes("/variables/")) {
      return "the variables API is limited to full members of Figma Enterprise orgs; on other plans this 403 is expected";
    }
    return "the token lacks access to this file; check the file is shared with the token's account and the token's scopes";
  }
  if (status === 404) return "check the file key: it is the segment after /design/ or /file/ in the Figma URL";
  if (status === 429) return "Figma rate limit hit; wait a minute and retry";
  return "retry; if it persists, check https://status.figma.com";
}

export class FigmaApiError extends AxiError {
  status: number;
  constructor(status: number, message: string, suggestion: string) {
    super(message, suggestion);
    this.status = status;
  }
}

export async function apiGet(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<unknown> {
  return request("GET", path, params);
}

export async function apiPost(path: string, body: unknown): Promise<unknown> {
  return request("POST", path, {}, body);
}

async function request(
  method: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  body?: unknown,
): Promise<unknown> {
  const url = new URL(apiBase() + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { ...authHeaders() };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new AxiError(
        `Figma API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s (${method} ${path})`,
        "check https://status.figma.com and retry",
      );
    }
    const cause = err instanceof Error ? err.message : String(err);
    throw new AxiError(
      `could not reach the Figma API (${cause})`,
      "check network connectivity to api.figma.com",
    );
  }

  let payload: unknown = null;
  const text = await res.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail = errorMessage(payload);
    const message = `Figma API ${res.status}${detail ? `: ${detail}` : ""} (${method} ${path})`;
    throw new FigmaApiError(res.status, message, suggestionFor(res.status, path));
  }
  if (payload === null) {
    throw new AxiError(`Figma API returned a non-JSON response (${method} ${path})`, "retry; if it persists, check https://status.figma.com");
  }
  return payload;
}

/**
 * Downloads a rendered-image URL (returned by GET /v1/images) to a local
 * file. Render URLs are pre-signed cloud-storage links: no auth header is
 * sent, so the token never leaves the Figma API call.
 */
export async function downloadTo(urlStr: string, filePath: string): Promise<number> {
  const { writeFile } = await import("node:fs/promises");
  let res: Response;
  try {
    res = await fetch(urlStr, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new AxiError(
        `download timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        "re-run the export; render URLs expire after 30 days",
      );
    }
    const cause = err instanceof Error ? err.message : String(err);
    throw new AxiError(`download failed (${cause})`, "re-run the export; render URLs expire after 30 days");
  }
  if (!res.ok) {
    throw new AxiError(
      `download failed with HTTP ${res.status}`,
      "re-run the export to get fresh render URLs",
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buf);
  return buf.length;
}
