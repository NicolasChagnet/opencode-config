# Shared OpenCode configuration

This repository contains a shared OpenCode setup: naval-role agents, commands,
skills, plugins, and model aliases.

## Install

First [install opencode](https://opencode.ai/docs/#install).

Then clone this repo into the global OpenCode configuration directory, including its
submodules:

```sh
git clone --recurse-submodules <REPOSITORY-URL> ~/.config/opencode
```

If the repository was cloned without submodules, recover them with:

```sh
git submodule update --init --recursive
```

Restart OpenCode after changing configuration, agents, skills, plugins, or
aliases.

## MCP servers

### Context7

Standard MCP server to access API and documentation of common libraries in a clean way. Use `opencode mcp auth context7` before first launch to authenticate (e.g. using your Github account).

Available for documentation search when granted to an agent.

### Cartography

Local MCP server (`mcp-codebase-cartography`) for structural codebase exploration, exposing read-only tools: `get_codebase_map`, `get_compressed_file`, `search_codebase`, `get_file_outline`, `get_symbol_definition`, `get_upstream_refs`, `get_downstream_refs`, and `get_ast_diff`. Runs via `uv --project ~/devs/repos/mcp-codebase-cartography/python-bindings run serve`. Granted to an agent when that agent's purpose needs codebase discovery.

### DuckDuckGo

Local MCP server for keyless web search, exposing the `search` tool (with the `[browser]` extra so the default `auto` backend can beat DuckDuckGo's TLS-fingerprint blocking). Page fetching is left to the built-in `webfetch` (no rate limit, always available) rather than the server's `fetch_content`. Runs via `uvx --with duckduckgo-mcp-server[browser] duckduckgo-mcp-server`. Replaces the built-in `websearch` tool (denied globally), which only surfaces on the OpenCode/OpenCode Go providers or with `OPENCODE_ENABLE_EXA=1` and was a no-op on this `github-copilot` setup. Granted to agents that do external research.

## Model aliases

This configuration uses the aliases `lightweight`, `balanced`, `reviewer`, and
`pro` from `model-aliases.copilot.json`:

| Alias | Provider/model |
| --- | --- |
| `lightweight` | `github-copilot/gpt-5.6-luna` |
| `balanced` | `github-copilot/gpt-5.6-terra` |
| `reviewer` | `github-copilot/gpt-5.4` |
| `pro` | `github-copilot/gpt-5.6-sol` |

Use the Copilot aliases by symlinking the file into the active alias path:

```sh
ln -s ~/.config/opencode/model-aliases.copilot.json \
  ~/.config/opencode/model-aliases.json
```

Alternatively, create `~/.config/opencode/model-aliases.json` yourself with
the aliases and provider/model IDs that suit your account. The alias plugin
also creates an empty file when none exists.

Manage aliases from OpenCode:

```text
/alias list
/alias set <alias> <provider/model>
/alias delete <alias>
/alias help
```

Use `!opencode models` in the TUI to see available provider/model IDs. Restart
OpenCode after adding, changing, or deleting aliases.

## Agents

The default agent is `jack`. The built-in `build`, `plan`, `general`,
`explore`, and `scout` agents are disabled.

| Agent | Role |
| --- | --- |
| Jack | Lightweight primary implementation agent for clear, low-risk work. Works directly, cannot delegate, and escalates unclear scope, design, or verification. |
| Recon | Primary, read-only design and requirements exploration agent. Clarifies the desired outcome, generates a small set of implementation options with tradeoffs, and recommends one before any planning begins. |
| Lookout | Primary, read-only Investigator. Establishes evidence, traces the code/data path, identifies root cause and affected callers, and produces a correction brief for Admiral. |
| Admiral | Planning-only primary agent. Turns a concrete goal or a Lookout correction brief into ordered, sequential, verifiable `Step N` plans; explores the codebase and external docs directly. |
| Fleet | Non-editing orchestrator. Executes plan steps sequentially, dispatching each to Frigate, stopping on failure, and invoking Watcher once after executable work. |
| Frigate | General-purpose coding agent and main implementation actor. Can edit, run Bash, and delegate prose drafting to Chronicler. |
| Watcher | Read-only review for correctness, architecture, security, maintainability, and over-engineering. |
| Chronicler | Tool-free, read-only drafting agent for publication-ready prose from a supplied verified brief. |
| Bosun | Teaches concepts through structured explanations and practice. |

The primary agents are distinct front doors, and you select the stage manually:

- **Recon** for uncertain requirements and open-ended design questions. It
  clarifies the desired outcome and returns an options/tradeoffs/recommendation
  brief, not a plan.
- **Lookout** for evidence-based code or data investigation. It reproduces the
  problem, traces the relevant path, and returns a correction brief for Admiral.
- **Admiral** for concrete planning. It turns a concrete goal or a Lookout
  correction brief into a structured plan; it does not plan from unresolved
  wishes or uninvestigated bug reports.
- **Jack** for unrelated, all-purpose, clear low-risk implementation work.

There is no automatic routing between these stages. You pick the agent that
matches the request, and the output of one stage is carried forward manually.
The planned workflow is:

```
Recon/Lookout (optional) -> Admiral -> human plan approval (Plannotator) -> Fleet
```

Admiral's plan gives every step a verifiable contract:

```text
Step N
Goal
Scope
Implementation
Verification
```

Steps run sequentially, in the order Admiral inserted them; Fleet executes each
step with Frigate, stops on the first failure, and invokes Watcher once after at
least one executable step succeeds. Human approval of the plan always precedes
Fleet execution.

Routing boundaries are fixed:

```text
Fleet   -> Frigate, Watcher
Frigate -> Chronicler
Watcher -> none
```

## Plannotator

The local `plan-tools` plugin provides structured plan storage and a mandatory
human approval gate. The `review-tools` plugin owns `/code-review`, which runs
the Plannotator code review and reports the result to the originating session
without dispatching an agent. Install the Plannotator CLI and ensure the
`plannotator` command is on `PATH` before using `submit_plan` or `/code-review`.

The registered tools are:

| Tool | Purpose |
| --- | --- |
| `initialize_plan` | Create a project-scoped plan draft by plan ID. |
| `insert_step` | Add a step to the draft. |
| `update_step` | Update a draft step. |
| `submit_plan` | Render the plan and open the Plannotator approval gate. |
| `read_plan` | Read the approved plan. |
| `read_plan_step` | Read one step from the approved plan. |

Plans are stored as one JSON file per plan. Editing an approved plan invalidates
its approval. `submit_plan` is not execution: the human must approve the rendered
Markdown artifact before Fleet can hand the approved plan to an executor.
Denied or failed submissions remain non-executable; correct the draft and
submit it again.

The source of truth is one JSON file per plan under `.opencode/plans/`. The
Markdown file under `.opencode/plan-artifacts/` is generated for approval. Same-session handoff is
configurable in `opencode.jsonc` and
defaults to Fleet (`approval_agent: "fleet"`). Fleet is the normal handoff
path; do not launch it manually.

The standalone Plannotator commands remain available:

- `/plannotator-annotate` — annotate a file, folder, or URL.
- `/plannotator-last` — annotate the latest assistant message.
- `/plannotator-review` — review the current changes or a pull-request URL.

## Commands

| Command | Purpose |
| --- | --- |
| `/ask-code` | Answer questions about the local codebase using Jack. |
| `/ask-info` | Answer documentation, API, and general-knowledge questions using Jack. |
| `/fix-all` | Run project linters and tests, then fix reported errors. |
| `/describe` | Describe the current version-control change, preferring Jujutsu when `.jj/` exists. |
| `/plannotator-annotate` | Open Plannotator to annotate a file, folder, or URL. |
| `/plannotator-last` | Open Plannotator to annotate the latest assistant message. |
| `/plannotator-review` | Review current changes or a pull-request URL in Plannotator. |
| `/code-review` | Run a Plannotator code review via the `review-tools` plugin; result is shown to the originating session with no agent dispatch. |
| `/split` | Split the current version-control change into self-consistent changes, preferring Jujutsu when `.jj/` exists. |
| `/doc` | Create or update documentation. |

`/alias` is provided by the model-alias plugin; it lists, sets, or deletes model aliases.

The model-alias plugin is loaded from `./plugins/opencode-model-alias/src/index.ts`.
Keep that plugin checkout present when using this configuration.
