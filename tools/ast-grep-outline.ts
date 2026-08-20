import { tool } from "@opencode-ai/plugin"
import { languageDescription, runAstGrep } from "../lib/ast-grep-common"

export default tool({
  description: "Read-only AST outline of symbols, imports, and exports in a file or directory using ast-grep.",
  args: {
    language: tool.schema.string().describe(languageDescription),
    path: tool.schema.string().optional().describe("File or directory to inspect. Defaults to current directory."),
  },
  execute: (args, context) => runAstGrep({ ...args, action: "outline" }, context),
})
