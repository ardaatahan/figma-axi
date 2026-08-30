# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- This is an AXI CLI (spec `axi/1.0-2026-07`). Before changing the command surface or output, check `npx -y axi-axi principles list` / `checklist`; `npx -y axi-axi validate "node bin/figma-axi.js" --dir .` must stay at 0 failures (CI runs it).
- `src/skill/content.ts` is the single source for the home view, root help, and `skills/figma-axi/SKILL.md`; after editing it run `npm run skill:gen` and commit the result (CI runs `skill:check`).
- Endpoint/response shapes come from Figma's official OpenAPI spec (github.com/figma/rest-api-spec); verify there before changing `src/figma/api.ts` or the fixtures in `test/fixtures/` (which mirror it).
- E2E tests (`test/e2e.test.ts`) spawn the CLI against an in-process mock server, so they must use async spawning: a `spawnSync` there deadlocks - the mock server shares the test worker's event loop.
- The token must never appear on stdout/stderr in any code path; `test/e2e.test.ts` has a regression test for this.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
