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

### Github MCP server

Both GitHub MCP connections use `https://api.githubcopilot.com/mcp/` which requires a PAT with the following permissions:

| Scope | Permissions | Description |
| --- | --- | --- |
| Contents | Read and write (or Read-only) | Reading code, directory structure, files, creating/updating branches and commits |
| Pull requests | Read and write (or Read-only) | Listing, searching, viewing diffs, creating/commenting on PRs |
| Issues | Read and write (or Read-only) | Creating, searching, reading, and updating issue threads |
| Discussions | Read-only | Reading discussion threads and comments (if used) |
| Commit statuses | Read-only | Checking CI/CD status on commits/PRs |
| Actions / Workflows | Read-only (optional) | Inspecting GitHub Actions workflows and run logs |
| Metadata | Read-only | (Automatically granted) Required to query repository metadata |


Place the PAT inside the gitignored file `.github_token`.

The following agents use the GitHub MCP servers:
- **Frigate** uses the `github` server and has full GitHub MCP access.
- **Navigator** uses only `github-readonly`, limited to the advertised
  read-only tools.

### Context7

Standard MCP server to access API and documentation of common libraries in a clean way. Use `opencode mcp auth context7` before first launch to authenticate (e.g. using your Github account).

Available for external research when granted to an agent.

## Arxiv and paper-search

Both are used by **Navigator** to find more academic information in research papers, etc. No particular authentication needed.

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
| Admiral | Planning-only primary agent. Produces dependency-declared, ordered, verifiable `Step N` plans; may delegate repository discovery to Cartographer and external research to Navigator. |
| Fleet | Non-editing orchestrator. Validates the dependency graph, schedules topological waves, dispatches Frigate after dependencies succeed, blocks failed descendants, and invokes Watcher once after executable work. |
| Frigate | General-purpose coding agent and main implementation actor. Can edit, run Bash, and delegate to Navigator or Chronicler. |
| Cartographer | Read-only local codebase explorer for tracing relevant paths, flows, conventions, and risks. |
| Navigator | Read-only external research for authoritative software documentation, GitHub sources, web sources, and academic sources. |
| Watcher | Read-only review for correctness, architecture, security, maintainability, and over-engineering. |
| Chronicler | Tool-free, read-only drafting agent for publication-ready prose from a supplied verified brief. |
| Recon | Read-only brainstorming agent; may delegate external research to Navigator and codebase exploration to Cartographer. |
| Bosun | Teaches concepts through structured explanations and practice. |

Use Jack directly for simple, clear, low-risk work. The planned workflow is:

```
Admiral -> human plan approval (Plannotator) -> Fleet
```

Admiral's plan gives every step a dependency-declared contract:

```text
Step N
Depends on
Goal
Scope
Implementation
Verification
```

Dependencies cover logic, verification, and conflicts over mutable scope. Fleet
manually derives topological ready sets, runs them in waves, dispatches Frigate
only after dependencies succeed, blocks descendants of failed steps, and
invokes Watcher once after at least one executable step succeeds.

Routing boundaries are fixed:

```text
Admiral -> Cartographer, Navigator, Recon
Fleet   -> Frigate, Watcher
Frigate -> Navigator, Chronicler
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
| `insert_step` | Add a dependency-declared step to the draft. |
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
| `/ask-code` | Answer questions about the local codebase using Cartographer. |
| `/ask-info` | Answer documentation, API, and general-knowledge questions using Navigator. |
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
