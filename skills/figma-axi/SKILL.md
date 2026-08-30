---
name: figma-axi
description: "read Figma files, inspect nodes, export assets, and manage comments from the terminal"
---

# figma-axi

Read Figma files, inspect nodes, export assets, and manage comments from the terminal (built against AXI spec axi/1.0-2026-07). Run the commands below with npx — no install needed.

Auth: set `FIGMA_TOKEN` to a Figma personal access token (figma.com > settings > security > personal access tokens), or put `{"token": "..."}` in `~/.config/figma-axi/config.json` (the env var wins).

Every `<key-or-url>` accepts a raw Figma file key or a full figma.com URL; a URL's `?node-id=` fragment is picked up automatically, and node ids may use either `12:34` or `12-34` form.

```
commands[7]{command,summary}:
  file <key-or-url>,"summarize a file: pages, top-level frames, counts"
  node <key-or-url> <node-id>,"one node's structure, layout, and style properties"
  export <key-or-url> --node <ids>,render nodes to png/svg/jpg/pdf and download them
  styles <key-or-url>,published styles in a file library
  components <key-or-url>,published components in a file library
  comments <key-or-url>,list comments; --add posts one
  variables <key-or-url>,local variables / design tokens (Enterprise plans)
help[4]:
  npx -y figma-axi file <key-or-url>  # start here; accepts figma.com URLs or raw file keys
  npx -y figma-axi node '<url with ?node-id=>'  # node ids also parse straight from URLs
  npx -y figma-axi export <key> --node <id> --format png --scale 2 --out ./assets
  npx -y figma-axi <command> --help
```

Notes:
- `export` downloads the rendered files locally and prints their paths.
- `variables` needs a Figma Enterprise plan; other plans get a clear plan-gated error.
- Large files: `file` fetches only pages + top-level frames by default (`--depth` goes deeper); drill in with `node`.

Every command supports `--help`. Exit codes: 0 success/no-op, 1 error, 2 usage error. All output is TOON on stdout.
