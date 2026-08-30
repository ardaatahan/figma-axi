// Token resolution. Precedence: FIGMA_TOKEN env var, then the config file
// (~/.config/figma-axi/config.json, honoring XDG_CONFIG_HOME). The token
// value itself is never printed, logged, or included in errors.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError } from "../output/errors.js";

export interface TokenInfo {
  token: string;
  /** Where the token came from, safe to print. */
  source: "env:FIGMA_TOKEN" | "config-file";
  /** "pat" sends X-Figma-Token; "oauth" sends Authorization: Bearer. */
  kind: "pat" | "oauth";
}

export function configPath(): string {
  const base = process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
  return join(base, "figma-axi", "config.json");
}

export const TOKEN_HELP =
  "set FIGMA_TOKEN (create one at figma.com > settings > security > personal access tokens), " +
  `or put {"token": "..."} in ${configPath()}`;

function tokenKind(token: string): "pat" | "oauth" {
  // OAuth2 access tokens are issued with a "figu_" prefix; personal access
  // tokens use "figd_". Default to PAT for unprefixed values.
  return token.startsWith("figu_") ? "oauth" : "pat";
}

/** Returns the token or null; never throws, never exposes the value. */
export function findToken(): TokenInfo | null {
  const env = process.env["FIGMA_TOKEN"];
  if (env && env.trim()) {
    const token = env.trim();
    return { token, source: "env:FIGMA_TOKEN", kind: tokenKind(token) };
  }
  const path = configPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { token?: unknown };
      if (typeof parsed.token === "string" && parsed.token.trim()) {
        const token = parsed.token.trim();
        return { token, source: "config-file", kind: tokenKind(token) };
      }
    } catch {
      // Malformed config is treated as no token; requireToken names the path.
    }
  }
  return null;
}

export function requireToken(): TokenInfo {
  const info = findToken();
  if (!info) {
    throw new AxiError("no Figma token configured", TOKEN_HELP);
  }
  return info;
}
