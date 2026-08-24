---
name: codebase-reading
description: This skill should be used when reading or navigating a codebase. It decides when to use the cartography MCP server (structure, symbols, cross-references) versus plaintext tools (read, grep, glob) for code versus prose, and how to fall back when cartography can't help.
---

# Codebase Reading

Read codebase files with the tool that matches the question. Pick the tool by **what you need** — structure/relations versus content — not by a fixed file type. Cartography is a code analyzer; `read`/`grep` read raw content. Reaching for the wrong one wastes turns (cartography rejects prose; line-by-line reads miss structure).

## Decision rule

Ask what the task actually needs, then pick a lane:

| Need | Tool |
| --- | --- |
| Structure of a project or file (map, outline, layout) | cartography: `get_codebase_map`, `get_file_outline`, `get_compressed_file` |
| Find code matching a pattern, symbol, or term | cartography: `search_codebase`, `get_symbol_definition` |
| Who calls / is called by a symbol, upstream or downstream | cartography: `get_upstream_refs`, `get_downstream_refs` |
| Summary of what a code file contains (imports, types, signatures) | cartography: `get_compressed_file` |
| The change / pending diff | cartography: `get_ast_diff` |
| Raw content of prose, config, or a small named file | `read` |
| Find files by name/glob, literal text, non-code content | `glob`, `grep` |

## When to use cartography

Use cartography for anything where you need **code as structure**: project layout, a file's outline, a symbol's definition, or its call graph. Start broad (`get_codebase_map` on an unfamiliar project, `get_file_outline` on a large file), then narrow with `search_codebase` / `get_symbol_definition` / `get_upstream_refs` / `get_downstream_refs`.

## When to use read / grep instead

Use `read` / `grep` / `glob` for everything cartography is not built for:

- **Prose and documents** — Markdown, README, docs, `.md`, `.txt`, comments-heavy prose. Cartography is a code analyzer and errors on non-code.
- **Config and data files** — JSON, YAML, TOML, `.jsonc`, `.csv`, `.log`. Cartography does not index these meaningfully.
- **A single small named prose/config file** — just `read` it directly. For
  source code, follow the Cartography gate below.
- **Literal text and messages** — exact strings, URLs, error messages, UI copy: use `grep`.
- **File discovery by name** — use `glob`.

Do not call `get_compressed_file` on a Markdown or config file: it summarizes code and will reject a plaintext file. Read the whole file instead.

**Cartography gate for source code:** Do not use `read` as the first inspection
tool for source code unless the file is under 100 LoC and the exact contents
are required. First use the Cartography tool matching the question. Use
`read` only after Cartography narrows the target or after Cartography errors or
is unavailable. State the fallback reason when Cartography cannot be used.

**Beware**: While you might sometimes need to read a code file using `read`, you should **always** make sure the file is really small (<100 LoC). You should always prefer understanding the structure of code files before reading them raw.

## Fallback

Cartography is code-only and may be unavailable or unindexed. If it errors (e.g. `unsupported file type`, `not indexed`) or is not configured, switch to `read` / `grep` immediately. Do not retry cartography speculatively or repeat probes.

## Worked examples

- "What does `TaskRepository` do?" → `get_symbol_definition("TaskRepository")`, then `get_upstream_refs` to see callers.
- "Explain the calculation this pipeline performs." → `get_compressed_file` or `get_file_outline` on the code file, then `read` the relevant function.
- "Show me the README's install steps." → `read` the README; do not call cartography.
- "Summarize this large unfamiliar module." → `get_codebase_map` first for orientation, then `get_file_outline`, then `get_compressed_file`; fall back to `read` only after narrowing.
- "Where is this exact error string produced?" → `grep` for the literal string.
