const LANGS = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json",
  "py", "go", "rs", "java", "c", "cpp", "h", "hpp",
  "ruby", "php", "swift", "kt", "scala", "lua", "r",
  "bash", "sh", "css", "html", "yaml", "yml",
  "dart", "csharp", "cs", "vue", "svelte", "sql",
]

export const languageDescription = `Source language. Common: ts, tsx, js, jsx, py, go, rs, java, c, cpp, ruby, php, swift, sh, sql. Full list: ${LANGS.join(", ")}`

export function runAstGrep(
  args: { action: "search" | "outline" | "rewrite", pattern?: string, kind?: string, replacement?: string, language: string, path?: string },
  context: { directory: string, worktree?: string },
) {
  const root = context.worktree ?? context.directory
  const path = args.path ?? "."
  const cmd = ["ast-grep"]

  if (args.action === "outline") {
    cmd.push("outline", "-l", args.language, "--items", "all", "--json=stream", path)
  } else {
    cmd.push("run", "-l", args.language)
    if (args.action === "search") cmd.push("--json=stream")
    if (args.kind) cmd.push("-k", args.kind)
    else if (args.pattern) cmd.push("-p", args.pattern)
    else throw new Error("search/rewrite requires either 'pattern' or 'kind'")
    if (args.action === "rewrite") {
      if (args.replacement === undefined) throw new Error("rewrite requires a 'replacement'")
      cmd.push("-r", args.replacement, "--update-all", "--color", "never")
    }
    cmd.push(path)
  }

  return execute(cmd, root, args)
}

async function execute(cmd: string[], cwd: string, args: { action: string, pattern?: string }) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([proc.stdout.text(), proc.stderr.text()])
  const exit = await proc.exited
  const lines = stdout.split("\n").filter(Boolean).map((line) => {
    try { return JSON.parse(line) } catch { return line }
  })
  const concise = lines.flatMap((message) => {
    if (typeof message === "string") return [message]
    const items = Array.isArray(message.items) && message.items.length ? message.items : [message]
    return items.map((item: any) => {
      const file = item.file ?? item.path ?? message.path ?? item.kindPath ?? "?"
      const line = item.line ?? item.range?.start?.line ?? 0
      const column = item.column ?? item.range?.start?.column ?? 0
      const kind = item.kind ?? item.astKind ?? item.symbolType ?? message.kind ?? ""
      const text = item.text ?? item.signature ?? item.name ?? item.role ?? ""
      return `${file}:${line}:${column}${kind ? ` [${kind}]` : ""} ${String(text).trim()}`
    })
  })
  if (exit !== 0) return `ast-grep failed (exit ${exit}):\n${stderr.trim()}\n\nMatched:\n${concise.join("\n")}`
  return concise.length ? concise.join("\n") : `No matches for ${args.action}${args.pattern ? ` of pattern '${args.pattern}'` : ""}.`
}
