# figma-axi

An [AXI](https://axi.md) (Agent eXperience Interface) CLI for the [Figma REST API](https://developers.figma.com/docs/rest-api/): read files, inspect nodes, export assets, and manage comments from the terminal, in a format built for agents - token-efficient TOON output, structured errors, and aggressive summarization of Figma's huge file trees.

Built against AXI spec `axi/1.0-2026-07` with [axi-axi](https://axi.md); `axi-axi validate` passes all checks.

## Install

Requires Node.js >= 20.

```sh
# from GitHub
npm install -g github:ardaatahan/figma-axi

# or clone and link
git clone https://github.com/ardaatahan/figma-axi
cd figma-axi && npm install && npm run build && npm link
```

Once published to npm you will also be able to run it ad hoc with `npx -y figma-axi`.

## Token setup

figma-axi needs a Figma personal access token:

1. In Figma: **settings > security > personal access tokens > generate new token**. Read scopes (file content, comments, library content; variables if your plan has them) are enough for everything except posting comments, which needs the comments write scope.
2. Provide it, in precedence order:
   - `FIGMA_TOKEN` environment variable (wins), or
   - `~/.config/figma-axi/config.json` (honors `$XDG_CONFIG_HOME`) containing `{"token": "..."}`.

OAuth2 bearer tokens (`figu_...` prefix) are also accepted and sent as `Authorization: Bearer` automatically; personal access tokens are sent as `X-Figma-Token`.

The token is never printed, logged, or embedded in output. Running any command without a token yields a structured error repeating these instructions. `figma-axi` with no arguments shows whether a token is currently configured and where it came from.

## Commands

Every `<key-or-url>` accepts a raw file key or any figma.com file URL (`/design/`, `/file/`, `/board/`, `/proto/`, `/slides/`); the key is the path segment after that. A URL's `?node-id=` is picked up automatically, and node ids may be written `12:34` (API form) or `12-34` (URL form). All output is TOON on stdout; exit codes are 0 success/no-op, 1 error, 2 usage error. Run any command with `--help` for flags, defaults, and examples.

### `figma-axi file <key-or-url>`

Compact overview of a file: metadata, pages, and top-level frames with sizes. Fetches with `depth=2` by default, so Figma returns only pages and their direct children - never the full multi-MB document tree.

```sh
figma-axi file https://www.figma.com/design/AbCdEf123456/My-Site
figma-axi file AbCdEf123456 --depth 3 --fields id,name,page,size,descendants
figma-axi file AbCdEf123456 --page Homepage
```

```
file: Marketing Site
key: AbCdEf123456
lastModified: 2026-08-12T09:30:00Z
...
pages[2]{id,name,topLevel}:
  0:1,Homepage,3
  0:2,Components,1
frames[4]{id,name,page,size}:
  1:2,Hero,Homepage,1440x720
  ...
```

`--depth 3` (or more) adds per-frame `descendants` counts; `--fields` picks columns; `--page` filters to one page.

### `figma-axi node <key-or-url> [node-id]`

One node's structure, layout, and style-relevant properties: size, auto-layout (direction/gap/padding), fills as hex, strokes, corner radius, effects, font (for text), descendant counts, and a table of direct children. Text content is truncated at 500 chars with a `--full` hint; `--full` dumps the raw node JSON when the summary is not enough.

```sh
figma-axi node AbCdEf123456 1:2
figma-axi node 'https://www.figma.com/design/AbCdEf123456/My-Site?node-id=1-2'
figma-axi node AbCdEf123456 1:2 --full
```

### `figma-axi export <key-or-url> --node <id>[,<id>...]`

Asks Figma to render the nodes (`--format png|svg|jpg|pdf`, default png; `--scale 0.01`-`4`), downloads the resulting files, and prints local paths:

```sh
figma-axi export AbCdEf123456 --node 1:2,1:3 --format png --scale 2 --out ./assets
```

```
exports[2]{node,file,bytes,status}:
  1:2,/path/to/assets/1-2@2x.png,34210,ok
  1:3,/path/to/assets/1-3@2x.png,10995,ok
```

Files are named `<node-id>.<format>` (`:` becomes `-`, `@2x`-style suffix when scaled). The render URLs Figma returns are pre-signed cloud-storage links; figma-axi downloads them without sending your token. A node that fails to render is reported per row (`render-failed`); the command exits 1 only if every node fails. Re-running overwrites existing files.

### `figma-axi styles <key-or-url>` / `figma-axi components <key-or-url>`

Published library styles and components: names, node ids, types, page context, descriptions. The REST API does not include concrete style values (colors, typography) in these listings - fetch them via the style's node: `figma-axi node <key> <node_id>`. `--type FILL|TEXT|EFFECT|GRID` filters styles; `--fields` adds `key`, `updated_at`, and more. Both lists are empty (with an explanatory note) unless the file publishes a library.

### `figma-axi comments <key-or-url>`

```sh
figma-axi comments AbCdEf123456                      # list
figma-axi comments AbCdEf123456 --add "Ship it" --node 1:2   # post, pinned to a node
figma-axi comments AbCdEf123456 --add "Agreed" --reply-to 101
```

Long messages are truncated per row at 200 chars; `--full` disables that. `--fields` exposes `node`, `resolved`, and `reply_to` columns.

### `figma-axi variables <key-or-url>`

Local variables (design tokens): collections with modes, plus each variable's value in the default mode - colors as hex, aliases as `alias:<name>`. `--collection` and `--mode` narrow the view.

**Plan-gated:** Figma exposes the variables API to full members of Enterprise orgs only. On other plans the command exits 1 with a clear message saying exactly that (and points to `figma-axi styles` instead) - expected behavior, not a bug.

## Agent integration

- **Skill**: `skills/figma-axi/SKILL.md` is generated from the same source as the home view (`npm run skill:gen`; CI fails if it drifts). `skills/axi-axi/SKILL.md` documents the AXI toolchain for contributors.
- **Session hook** (optional): `npx -y axi-axi setup hooks --dir .` installs a SessionStart hook that loads the home view at session start.

## Development

```sh
npm install
npm run build        # tsc -> dist/
npm test             # offline suite: unit + E2E against a mock Figma API
npm run skill:gen    # regenerate skills/figma-axi/SKILL.md (commit it)
npx -y axi-axi validate "node bin/figma-axi.js" --dir .
```

The test suite is fully offline: E2E tests spawn the real CLI against an in-process mock of the Figma API (`test/mock-figma.ts` + `test/fixtures/`, shaped after Figma's official [OpenAPI spec](https://github.com/figma/rest-api-spec)), including the export download flow. `FIGMA_API_BASE` overrides the API base URL - the tests use it, and it also works behind proxies.

### Live smoke test (needs a real token)

The offline suite covers request construction and response handling; after configuring a token, verify against the live API with a file you can access:

```sh
export FIGMA_TOKEN=...   # your personal access token
figma-axi file <your-file-url>
figma-axi node <your-file-url-with-node-id>
figma-axi export <key> --node <id> --out /tmp/figma-smoke
figma-axi styles <key> && figma-axi comments <key>
figma-axi variables <key>   # expect the plan-gated message unless on Enterprise
```

## Structure

- `src/figma/` - API client (stdlib `fetch`, zero runtime deps), token resolution, URL/key parsing, summarization.
- `src/commands/` - one module per subcommand.
- `src/cli/`, `src/output/` - shared AXI plumbing (strict flag parsing, TOON emitter, structured errors) from the axi-axi scaffold.
- `src/skill/content.ts` - single source for the home view and SKILL.md.

## License

[MIT](LICENSE)
