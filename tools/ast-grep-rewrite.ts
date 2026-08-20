import { tool } from "@opencode-ai/plugin"
import { languageDescription, runAstGrep } from "../lib/ast-grep-common"

export default tool({
  description: "Rewrite code structurally with ast-grep. This modifies files in place; search first to preview matches.",
  args: {
    pattern: tool.schema.string().optional().describe("AST pattern to match. Use $A, $B metavariables. Mutually exclusive with kind."),
    kind: tool.schema.string().optional().describe("Node kind to match instead of pattern. Mutually exclusive with pattern."),
    replacement: tool.schema.string().describe("Replacement text; may reuse captured metavariables such as $A."),
    language: tool.schema.string().describe(languageDescription),
    path: tool.schema.string().optional().describe("File or directory to rewrite. Defaults to current directory."),
  },
  execute: (args, context) => runAstGrep({ ...args, action: "rewrite" }, context),
})
