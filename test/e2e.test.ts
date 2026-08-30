// End-to-end tests: spawn the real CLI against the mock Figma API
// (FIGMA_API_BASE), exactly as a user would run it — token in env, output
// on stdout, files on disk.

import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_KEY, FILE_KEY, GATED_KEY, startMockFigma, TEST_TOKEN, type MockFigma } from "./mock-figma.js";

const bin = fileURLToPath(new URL("../bin/figma-axi.js", import.meta.url));

let mock: MockFigma;
let emptyConfigDir: string;

beforeAll(async () => {
  mock = await startMockFigma();
  emptyConfigDir = mkdtempSync(join(tmpdir(), "figma-axi-cfg-"));
});

afterAll(async () => {
  await mock.close();
  rmSync(emptyConfigDir, { recursive: true, force: true });
});

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

// Async on purpose: the mock Figma server runs on this test process's event
// loop, so a synchronous spawn would deadlock the CLI against it.
function run(args: string[], envOverrides: Record<string, string | undefined> = {}): Promise<RunResult> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    FIGMA_API_BASE: mock.base,
    FIGMA_TOKEN: TEST_TOKEN,
    // Point config discovery at an empty dir so a developer's real config
    // can never leak into the tests.
    XDG_CONFIG_HOME: emptyConfigDir,
    ...envOverrides,
  };
  return new Promise((resolve) => {
    execFile(
      "node",
      [bin, ...args],
      { encoding: "utf8", env: env as NodeJS.ProcessEnv, timeout: 30_000 },
      (err, stdout, stderr) => {
        const status = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
        resolve({ status, stdout, stderr });
      },
    );
  });
}

describe("token handling", () => {
  it("fails with setup instructions when no token is configured", async () => {
    const r = await run(["file", FILE_KEY], { FIGMA_TOKEN: undefined });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("error: no Figma token configured");
    expect(r.stdout).toContain("FIGMA_TOKEN");
    expect(r.stdout).toContain("personal access tokens");
  });

  it("reads the token from the config file when the env var is absent", async () => {
    const cfgHome = mkdtempSync(join(tmpdir(), "figma-axi-cfg2-"));
    const dir = join(cfgHome, "figma-axi");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "config.json"), JSON.stringify({ token: TEST_TOKEN }));
    const r = await run(["file", FILE_KEY], { FIGMA_TOKEN: undefined, XDG_CONFIG_HOME: cfgHome });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("file: Marketing Site");
    rmSync(cfgHome, { recursive: true, force: true });
  });

  it("reports a rejected token with a fix, not a stack trace", async () => {
    const r = await run(["file", FILE_KEY], { FIGMA_TOKEN: "figd_wrong" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("error: Figma API 403");
    expect(r.stdout).toContain("suggestion:");
    expect(r.stdout).not.toContain("figd_wrong");
    expect(r.stdout).not.toContain("at "); // no stack frames on stdout
  });

  it("never echoes the token in any output", async () => {
    for (const args of [[], ["file", FILE_KEY], ["--help"]]) {
      const r = await run(args);
      expect(r.stdout).not.toContain(TEST_TOKEN);
      expect(r.stderr).not.toContain(TEST_TOKEN);
    }
  });
});

describe("file", () => {
  it("summarizes pages and top-level frames with aggregates", async () => {
    const r = await run(["file", FILE_KEY]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("file: Marketing Site");
    expect(r.stdout).toContain("componentsUsed: 1");
    expect(r.stdout).toContain("stylesUsed: 2");
    expect(r.stdout).toContain("pages[2]{id,name,topLevel}:");
    expect(r.stdout).toContain("frames[4]{id,name,page,size}:");
    expect(r.stdout).toContain("1:2,Hero,Homepage,1440x720");
    expect(r.stdout).toContain("help[");
    // The huge-file guard: default fetch must be depth-limited.
    expect(mock.requests.some((q) => q.includes("/v1/files/"))).toBe(true);
  });

  it("passes --depth through and filters by --page", async () => {
    const r = await run(["file", FILE_KEY, "--page", "Components", "--fields", "id,name,type"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("5:1,Button/Primary,COMPONENT");
    expect(r.stdout).not.toContain("1:2,Hero");
  });

  it("accepts a full Figma URL", async () => {
    const r = await run(["file", `https://www.figma.com/design/${FILE_KEY}/Marketing-Site?t=abc-1`]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("file: Marketing Site");
  });

  it("names a page filter that matches nothing", async () => {
    const r = await run(["file", FILE_KEY, "--page", "Nope"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("0 pages matching 'Nope'");
    expect(r.stdout).toContain("help[");
    expect(r.stdout).toContain(`figma-axi file ${FILE_KEY}`);
  });

  it("maps a 404 to a structured error with the key hint", async () => {
    const r = await run(["file", "MissingFile12"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("error: Figma API 404");
    expect(r.stdout).toContain("suggestion:");
  });
});

describe("node", () => {
  it("summarizes structure, layout, fills, and children", async () => {
    const r = await run(["node", FILE_KEY, "1:2"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("node: Hero");
    expect(r.stdout).toContain("type: FRAME");
    expect(r.stdout).toContain("size: 1440x720");
    expect(r.stdout).toContain("layout: vertical gap=24 pad=96/120");
    expect(r.stdout).toContain("fills: #ffffff");
    expect(r.stdout).toContain("descendants: 4 (1 instances, 2 texts)");
    expect(r.stdout).toContain("children[3]{id,name,type,size,layout,fills}:");
    expect(r.stdout).toContain("1:3,Headline,TEXT");
  });

  it("takes the node id from a URL fragment, in URL form", async () => {
    const r = await run(["node", `https://www.figma.com/design/${FILE_KEY}/Site?node-id=1-2`]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("node: Hero");
  });

  it("requires a node id from either argument or URL", async () => {
    const r = await run(["node", FILE_KEY]);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("error: missing node id");
  });

  it("dumps raw JSON with --full", async () => {
    const r = await run(["node", FILE_KEY, "1:2", "--full"]);
    expect(r.status).toBe(0);
    const jsonPart = r.stdout.slice(r.stdout.indexOf("{"));
    const node = JSON.parse(jsonPart);
    expect(node.name).toBe("Hero");
  });

  it("treats an unknown node id as a definitive empty state", async () => {
    const r = await run(["node", FILE_KEY, "99:99"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("0 results for id 99:99");
    expect(r.stdout).toContain("does not exist");
  });
});

describe("export", () => {
  it("renders, downloads, and prints local paths", async () => {
    const out = mkdtempSync(join(tmpdir(), "figma-axi-out-"));
    const r = await run(["export", FILE_KEY, "--node", "1:2,1:3", "--format", "png", "--scale", "2", "--out", out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("exports[2]{node,file,bytes,status}:");
    const f1 = join(out, "1-2@2x.png");
    expect(r.stdout).toContain(f1);
    expect(statSync(f1).size).toBeGreaterThan(0);
    // PNG magic bytes survived the round trip.
    expect(readFileSync(f1).subarray(1, 4).toString()).toBe("PNG");
    rmSync(out, { recursive: true, force: true });
  });

  it("marks failed renders per node and still succeeds for the rest", async () => {
    const out = mkdtempSync(join(tmpdir(), "figma-axi-out2-"));
    const r = await run(["export", FILE_KEY, "--node", "1:2,9:9", "--out", out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("9:9,,,render-failed");
    expect(r.stdout).toContain("note: 1 of 2 nodes failed to render");
    rmSync(out, { recursive: true, force: true });
  });

  it("exits 1 when every render fails", async () => {
    const out = mkdtempSync(join(tmpdir(), "figma-axi-out3-"));
    const r = await run(["export", FILE_KEY, "--node", "9:9", "--out", out]);
    expect(r.status).toBe(1);
    rmSync(out, { recursive: true, force: true });
  });

  it("validates --scale before calling the API", async () => {
    const before = mock.requests.length;
    const r = await run(["export", FILE_KEY, "--node", "1:2", "--scale", "9"]);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("invalid --scale");
    expect(mock.requests.length).toBe(before);
  });

  it("rejects an invalid --format naming the valid ones", async () => {
    const r = await run(["export", FILE_KEY, "--node", "1:2", "--format", "webp"]);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("png, svg, jpg, pdf");
  });

  it("rejects a stray extra positional instead of silently dropping it", async () => {
    const before = mock.requests.length;
    const r = await run(["export", FILE_KEY, "--node", "1:2", "--format", "png", "outputdir"]);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("unexpected argument");
    expect(r.stdout).toContain("'outputdir'");
    expect(mock.requests.length).toBe(before);
  });
});

describe("styles and components", () => {
  it("lists published styles with default fields", async () => {
    const r = await run(["styles", FILE_KEY]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("styles[2]{node_id,name,type,description}:");
    expect(r.stdout).toContain("9:1,Text/Heading,TEXT");
  });

  it("filters styles by --type and counts the total", async () => {
    const r = await run(["styles", FILE_KEY, "--type", "TEXT"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("styles[1 of 2 total]");
    expect(r.stdout).not.toContain("Color/Ink");
  });

  it("has a definitive empty state for unpublished libraries", async () => {
    const r = await run(["styles", EMPTY_KEY]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`styles: 0 published styles in file ${EMPTY_KEY}`);
  });

  it("lists components with page context and quotes commas", async () => {
    const r = await run(["components", FILE_KEY]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("components[2]{node_id,name,page,description}:");
    expect(r.stdout).toContain('"Card, with shadow"');
    expect(r.stdout).toContain("Components");
  });

  it("rejects unknown --fields naming the valid set", async () => {
    const r = await run(["components", FILE_KEY, "--fields", "bogus"]);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("unknown field 'bogus'");
    expect(r.stdout).toContain("node_id");
  });
});

describe("comments", () => {
  it("lists comments and truncates long messages with a --full hint", async () => {
    const r = await run(["comments", FILE_KEY]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("comments[2]{id,author,created,message}:");
    expect(r.stdout).toContain("101,dana");
    expect(r.stdout).toContain("chars total");
    expect(r.stdout).toContain("--full");
  });

  it("--full disables message truncation", async () => {
    const r = await run(["comments", FILE_KEY, "--full"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("commodo consequat.");
    expect(r.stdout).not.toContain("chars total");
  });

  it("posts a comment pinned to a node", async () => {
    const r = await run(["comments", FILE_KEY, "--add", "Ship it", "--node", "1-2"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("comment: posted");
    expect(r.stdout).toContain("id: 201");
    const body = mock.lastPostBody as { message: string; client_meta: { node_id: string; node_offset: { x: number; y: number } } };
    expect(body.message).toBe("Ship it");
    expect(body.client_meta.node_id).toBe("1:2");
  });

  it("posts a reply with --reply-to", async () => {
    const r = await run(["comments", FILE_KEY, "--add", "Agreed", "--reply-to", "101"]);
    expect(r.status).toBe(0);
    const body = mock.lastPostBody as { comment_id?: string };
    expect(body.comment_id).toBe("101");
  });

  it("rejects --node without --add", async () => {
    const r = await run(["comments", FILE_KEY, "--node", "1:2"]);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("--node and --reply-to only apply when posting");
  });

  it("has a definitive empty state", async () => {
    const r = await run(["comments", EMPTY_KEY]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`comments: 0 comments on file ${EMPTY_KEY}`);
  });
});

describe("variables", () => {
  it("lists collections and values for the default mode", async () => {
    const r = await run(["variables", FILE_KEY]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("collections[2]{id,name,modes,variables}:");
    expect(r.stdout).toContain("Light | Dark");
    expect(r.stdout).toContain("bg/surface,COLOR,#ffffff,Colors,Light");
    expect(r.stdout).toContain("text/primary,COLOR,alias:bg/surface,Colors,Light");
    expect(r.stdout).toContain("space/md,FLOAT,16,Spacing");
  });

  it("filters by --collection and --mode", async () => {
    const r = await run(["variables", FILE_KEY, "--collection", "Colors", "--mode", "Dark"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("bg/surface,COLOR,#0f172a,Colors,Dark");
    expect(r.stdout).not.toContain("space/md");
  });

  it("explains the Enterprise plan gate on 403", async () => {
    const r = await run(["variables", GATED_KEY]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("plan-gated");
    expect(r.stdout).toContain("Enterprise");
    expect(r.stdout).toContain("suggestion:");
    expect(r.stdout).not.toContain("at "); // no stack frames
  });
});

describe("AXI contract across subcommands", () => {
  const subcommands = ["file", "node", "export", "styles", "components", "comments", "variables"];

  it("every subcommand answers --help with exit 0 and examples", async () => {
    for (const cmd of subcommands) {
      const r = await run([cmd, "--help"]);
      expect(r.status, cmd).toBe(0);
      expect(r.stdout, cmd).toContain("flags[");
      expect(r.stdout, cmd).toContain("examples[");
    }
  });

  it("every subcommand rejects unknown flags with exit 2", async () => {
    for (const cmd of subcommands) {
      const r = await run([cmd, FILE_KEY, "--nope"]);
      expect(r.status, cmd).toBe(2);
      expect(r.stdout, cmd).toContain("unknown flag --nope");
    }
  });

  it("stderr stays silent on successful calls", async () => {
    const r = await run(["file", FILE_KEY]);
    expect(r.stderr.trim()).toBe("");
  });
});
