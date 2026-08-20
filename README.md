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
| Watch | Reviews changes for correctness, security, architecture, and complexity. |
| Chronicler | Writes concise documentation and other publication-ready prose. |

The general workflow is 

```
Recon: optional, refines idea, suggests paths (high temperature)
  -> Admiral: creates plan, each step having a specific scope and verification process
  -> Plannotator UI: edit plan, leave feedback, return to Admiral or approve plan
  -> Fleet: reads plan, delegates to independent subagents with their own context
    -> Frigate subagents: implement each step (parallel or sequential)
    -> Watch: review changes using a different model, approves or suggests changes
```
This is a loop workflow, each step can generally loop back to the previous one for refinement, and some steps can be skipped on simpler task (`Admiral -> Frigate` directly or even just call `Frigate` for a simple action).
Each agent is also allowed to use `Cartographer` and `Navigator` to fetch external knowledge, and `Chronicler` to generate human-targeted content.

## Plannotator

The Plannotator plugin is configured with `workflow: user-managed`. This tool introduces a web interface to annotate, review, edit and approve plans and code diffs.
**This is a crucial part of the workflow: the human remains in the loop at these crucial stages!**
Its browser sessions return their feedback to this conversation:

- `/annotate` — annotate a file, folder, or URL.
- `/annotate-last` — annotate the latest assistant message.
- `/code-review` — review the current changes or a pull-request URL.

Wait for the browser session to finish; returned annotations or review feedback
are then addressed in the conversation.

## Commands

| Command | Purpose |
| --- | --- |
| `/fix-all` | Run project linters and tests, then fix reported errors. |
| `/describe` | Set a conventional-commit description for the current Jujutsu revision. |
| `/annotate` | Open Plannotator to annotate a file, folder, or URL. |
| `/annotate-last` | Open Plannotator to annotate the latest assistant message. |
| `/code-review` | Review current changes or a pull-request URL in Plannotator. |
| `/split` | Split the current Jujutsu revision into self-consistent changes. |
| `/doc` | Create or update documentation. |

`/alias` is provided by the model-alias plugin; it lists, sets, or deletes model aliases.
