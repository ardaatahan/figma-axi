---
name: axi-axi
description: "Build a new AXI (Agent eXperience Interface) CLI — scaffold a compliant project, consult the 10 AXI principles on demand, and validate compliance. Use when creating or reviewing an agent-facing CLI."
---

# axi-axi

A token-efficient CLI that helps agents build AXI-compliant CLIs (spec axi/1.0-2026-07). Run the commands below with npx — no install needed. Pull only the slice of the spec you need, when you need it, instead of loading the whole spec into context.

```
principles[10]{num,id,rule}:
  1,token-output,"Emit TOON on stdout: ~40% fewer tokens than JSON, still structured"
  2,minimal-schemas,Default list views to 3-4 fields; --fields opts into more
  3,truncation,"Truncate long text at 500-1500 chars, showing total size and a --full hint"
  4,aggregates,Precompute totals and cheap derived fields so agents skip follow-up calls
  5,empty-states,"When the answer is nothing, say '0 results' and name the context searched"
  6,errors-exits,"Errors are structured stdout; exit 0 success/no-op, 1 error, 2 usage; no prompts"
  7,session-context,"Offer opt-in SessionStart hooks for ambient context, plus a generated SKILL.md"
  8,content-first,"No-args invocation shows live, relevant content — not a usage manual"
  9,disclosure,"Follow output with 2-4 relevant, parameterized next-step suggestions"
  10,consistent-help,"Every subcommand answers --help: flags, defaults, and 2-3 examples"
golden-path[4]:
  1. npx -y axi-axi new <name> --dir <path>  scaffold a compliant AXI project
  2. npx -y axi-axi checklist --phase implement  keep the rules in view while coding
  3. npx -y axi-axi principles show <id>  when a rule needs detail
  4. npx -y axi-axi validate "<cmd>" --dir <path>  check compliance before shipping
help[3]:
  npx -y axi-axi new my-tool --dir ./my-tool
  npx -y axi-axi principles show token-output
  npx -y axi-axi checks list
```

Every command supports `--help` (flags, defaults, examples). Exit codes: 0 success/no-op, 1 error, 2 usage error. All output is TOON on stdout.
