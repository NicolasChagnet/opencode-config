import { tool } from "@opencode-ai/plugin"
import { languageDescription, runAstGrep } from "../lib/ast-grep-common"

export default tool({
  description: "Read-only structural code search using ast-grep. Use for semantic matches such as calls, imports, declarations, or await expressions.",
  args: {
    pattern: tool.schema.string().optional().describe("AST pattern to match. Use $A, $B metavariables. Mutually exclusive with kind."),
    kind: tool.schema.string().optional().describe("Node kind to match instead of pattern, e.g. function_declaration or call_expression. Mutually exclusive with pattern."),
    language: tool.schema.string().describe(languageDescription),
    path: tool.schema.string().optional().describe("File or directory to search. Defaults to current directory."),
  },
  execute: (args, context) => runAstGrep({ ...args, action: "search" }, context),
})
