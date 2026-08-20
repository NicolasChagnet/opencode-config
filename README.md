# Shared OpenCode configuration

This repository contains a shared OpenCode setup: naval-role agents, commands,
skills, plugins, and model aliases.

## Install

Clone it into the global OpenCode configuration directory, including its
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

The following agents use the the github MCP server:
- **Frigate** uses the `github` server and has full GitHub MCP access.
- **Cartographer** uses only `github-readonly`, limited to
  `get_file_contents`, `search_code`, and `get_repository_tree`. The server
  advertises readonly mode and Cartographer has no write access.

### Context7

Standard MCP server to access API and documentation of common libraries in a clean way. Use `opencode mcp auth context7` before first launch to authenticate (e.g. using your Github account).

Used by **Cartographer** to pull relevant information about libraries and APIs.

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

| Agent | Role |
| --- | --- |
| Admiral | Breaks work into ordered, verifiable plans, editable with plannotator. |
| Fleet | Orchestrates implementation across Frigate agents. |
| Frigate | Implements and verifies repository changes. **Main actor!** |
| Recon | Explores alternatives and complexity before implementation. |
| Tutor | Teaches concepts with structured explanations and practice. |
| Cartographer | Retrieves exact software documentation facts. |
| Navigator | Researches general-domain and literature evidence. |
| Watcher | Reviews changes for correctness, security, architecture, and complexity. |
| Chronicler | Writes concise documentation and other publication-ready prose. |

The general workflow is 

```
Recon: optional, refines idea, suggests paths (high temperature)
  -> Admiral: creates plan, each step having a specific scope and verification process
  -> Plannotator UI: edit plan, leave feedback, return to Admiral or approve plan
  -> Fleet: reads plan, delegates to independent subagents with their own context
    -> Frigate subagents: implement each step (parallel or sequential)
    -> Watcher: review changes using a different model, approves or suggests changes
```
This is a loop workflow, each step can generally loop back to the previous one for refinement, and some steps can be skipped on simpler task (`Admiral -> Frigate` directly or even just call `Frigate` for a simple action).
Each agent is also allowed to use `Cartographer` and `Navigator` to fetch external knowledge, and `Chronicler` to generate human-targeted content.

## Plannotator

The Plannotator plugin is configured with `workflow: user-managed`. This tool introduces a web interface to annotate, review, edit and approve plans and code diffs.
**This is a crucial part of the workflow: the human remains in the loop at these crucial stages!**
Its browser sessions return their feedback to this conversation:

- `/plannotator-annotate` — annotate a file, folder, or URL.
- `/plannotator-last` — annotate the latest assistant message.
- `/plannotator-review` — review the current changes or a pull-request URL.

Wait for the browser session to finish; returned annotations or review feedback
are then addressed in the conversation.

## Commands

| Command | Purpose |
| --- | --- |
| `/fix-all` | Run project linters and tests, then fix reported errors. |
| `/describe` | Set a conventional-commit description for the current Jujutsu revision. |
| `/plannotator-annotate` | Open Plannotator to annotate a file, folder, or URL. |
| `/plannotator-last` | Open Plannotator to annotate the latest assistant message. |
| `/plannotator-review` | Review current changes or a pull-request URL in Plannotator. |
| `/split` | Split the current Jujutsu revision into self-consistent changes. |
| `/doc` | Create or update documentation. |

`/alias` is provided by the model-alias plugin; it lists, sets, or deletes model aliases.
