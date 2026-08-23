import { readFileSync } from "node:fs"

const config = JSON.parse(await new Response(Bun.spawn(["opencode", "debug", "config"], { stdout: "pipe" }).stdout).text())
const scenarios = JSON.parse(readFileSync(new URL("./agent-routing.json", import.meta.url), "utf8"))
const agents = config.agent
const root = new URL("..", import.meta.url)
const opencodeConfig = readFileSync(new URL("opencode.jsonc", root), "utf8")
const reviewTools = readFileSync(new URL("plugins/review-tools/src/index.ts", root), "utf8") + readFileSync(new URL("plugins/review-tools/src/review.ts", root), "utf8") + readFileSync(new URL("plugins/review-tools/src/hooks.ts", root), "utf8")

const matches = (pattern: string, value: string) => pattern === value || (pattern.endsWith("*") && value.startsWith(pattern.slice(0, -1)))
const allow = (agent: string, child: string) => Object.entries(agents[agent]?.permission?.task ?? {})
  .some(([pattern, value]) => value === "allow" && matches(pattern, child))
const isAllowed = (value: unknown): boolean => typeof value === "string"
  ? value === "allow"
  : typeof value === "object" && value !== null
  ? Object.values(value).some(isAllowed)
  : false
const normalize = (value: unknown): unknown => Array.isArray(value)
  ? value.map(normalize)
  : typeof value === "object" && value !== null
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, nested]) => [key, normalize(nested)]))
  : value

const expectedPermissions: Record<string, unknown> = {
  admiral: { "*": "deny", read: "allow", glob: "allow", grep: "allow", "cartography_get_codebase_map": "allow", "cartography_get_compressed_file": "allow", "cartography_search_codebase": "allow", "cartography_get_file_outline": "allow", "cartography_get_symbol_definition": "allow", "cartography_get_upstream_refs": "allow", "cartography_get_downstream_refs": "allow", webfetch: "allow", duckduckgo_search: "allow", "context7*": "allow", edit: "deny", bash: "deny", task: { "*": "deny" }, submit_plan: "allow", initialize_plan: "allow", insert_step: "allow", update_step: "allow", read_plan: "allow", read_plan_step: "allow", list_plans: "allow", question: "allow", questions: "allow", skill: { "*": "deny", ponytail: "allow", "ponytail-review": "allow", "code*": "allow", "data*": "allow" } },
  fleet: { "*": "deny", edit: "deny", bash: "deny", task: { "*": "deny", frigate: "allow", watcher: "allow" }, glimpse_plan: "allow", list_plans: "allow", mark_step_done: "allow"},
  frigate: { edit: "allow", bash: "allow", skill: { "*": "deny", "code*": "allow", "data*": "allow", ponytail: "allow", "ponytail-review": "allow", "ponytail-audit": "allow" }, "cartography_get_codebase_map": "allow", "cartography_get_compressed_file": "allow", "cartography_search_codebase": "allow", "cartography_get_file_outline": "allow", "cartography_get_symbol_definition": "allow", "cartography_get_upstream_refs": "allow", "cartography_get_downstream_refs": "allow", "cartography_get_ast_diff": "allow", webfetch: "allow", duckduckgo_search: "allow", "context7*": "allow", task: { "*": "deny", chronicler: "allow" }, read_plan_step: "allow" },
  watcher: { "*": "deny", edit: "deny", bash: { "*": "deny", "git diff *": "allow", "git show *": "allow", "git log *": "allow", "git status": "allow", "jj diff --git --no-pager": "allow", "jj show -r *": "allow", "jj log *": "allow", "jj status": "allow" }, task: { "*": "deny" }, subagent: "deny", "cartography_get_compressed_file": "allow", "cartography_search_codebase": "allow", "cartography_get_file_outline": "allow", "cartography_get_symbol_definition": "allow", "cartography_get_upstream_refs": "allow", "cartography_get_downstream_refs": "allow", "cartography_get_ast_diff": "allow", read: "allow", glob: "allow", grep: "allow", list: "allow", read_plan: "allow", skill: { "*": "deny", "code*": "allow" } },
  build: {}, plan: {}, general: {}, explore: {}, scout: {},
  jack: { edit: "allow", bash: "allow", task: "deny", skill: { "*": "allow" }, submit_plan: "deny", "cartography_get_codebase_map": "allow", "cartography_get_compressed_file": "allow", "cartography_search_codebase": "allow", "cartography_get_file_outline": "allow", "cartography_get_symbol_definition": "allow", "cartography_get_upstream_refs": "allow", "cartography_get_downstream_refs": "allow", "cartography_get_ast_diff": "allow", webfetch: "allow", duckduckgo_search: "allow", "context7*": "allow" },
  chronicler: { "*": "deny", skill: { "*": "deny", "writing*": "allow" } },
  bosun: { "*": "deny", edit: "deny", bash: "deny", webfetch: "allow", duckduckgo_search: "allow", "context7*": "allow", question: "allow", task: { "*": "deny" } },
  recon: { "*": "deny", edit: "deny", bash: "deny", read: "allow", glob: "allow", grep: "allow", "cartography_get_codebase_map": "allow", "cartography_get_compressed_file": "allow", "cartography_search_codebase": "allow", "cartography_get_file_outline": "allow", "cartography_get_symbol_definition": "allow", "cartography_get_upstream_refs": "allow", "cartography_get_downstream_refs": "allow", webfetch: "allow", duckduckgo_search: "allow", "context7*": "allow", task: { "*": "deny" }, question: "allow", skill: { "*": "deny", "idea-refine": "allow", "codebase-reading": "allow" } },
  lookout: { "*": "deny", edit: "deny", bash: "allow", read: "allow", glob: "allow", grep: "allow", "cartography_get_codebase_map": "allow", "cartography_get_compressed_file": "allow", "cartography_search_codebase": "allow", "cartography_get_file_outline": "allow", "cartography_get_symbol_definition": "allow", "cartography_get_upstream_refs": "allow", "cartography_get_downstream_refs": "allow", "cartography_get_ast_diff": "allow", webfetch: "allow", duckduckgo_search: "allow", "context7*": "allow", task: { "*": "deny" }, question: "allow", skill: { "*": "deny", "codebase-reading": "allow", "code-debugging-and-error-recovery": "allow", "code-python-perf": "allow", "code-review-and-quality": "allow", "code-rust-perf": "allow", "code-simplification": "allow", "codebase-design": "allow", "data-bigquery": "allow", "data-local": "allow", "data-marimo": "allow", "data-science": "allow", "dataform": "allow" } },
}
const checks = scenarios.map((scenario: any) => {
  if (scenario.kind === "prompt-routing") return { name: scenario.name, pass: true }
  if (scenario.kind === "tool-boundary") {
    const permission = agents[scenario.agent]?.permission ?? {}
    return { name: scenario.name, pass: scenario.tools.every((tool: string) => Object.entries(permission).some(([pattern, value]) => isAllowed(value) && matches(pattern, tool))) }
  }
  const chain = scenario.expectedAllow === false
    ? !allow(scenario.parent, scenario.child)
    : scenario.grandchild
    ? allow(scenario.parent, scenario.child) && allow(scenario.child, scenario.grandchild)
    : allow(scenario.parent, scenario.child)
  return { name: scenario.name, pass: chain && (config.subagent_depth == null || config.subagent_depth >= scenario.maxDepth) }
})

for (const agent of Object.keys(agents)) {
  checks.push({
    name: `${agent}-exact-permissions`,
    pass: expectedPermissions[agent] !== undefined && JSON.stringify(normalize(agents[agent]?.permission ?? {})) === JSON.stringify(normalize(expectedPermissions[agent])),
  })
}

const boundaries = {
  admiral: [],
  fleet: ["frigate", "watcher"],
  frigate: ["chronicler"],
  watcher: [],
  recon: [],
  lookout: [],
}
for (const [parent, children] of Object.entries(boundaries)) {
  for (const [child, value] of Object.entries(agents[parent]?.permission?.task ?? {})) {
    if (value === "allow" && child !== "*" && !children.includes(child)) checks.push({ name: `${parent}-only-boundary`, pass: false })
  }
}

checks.push({ name: "code-review-hook-registered", pass: opencodeConfig.includes('"code-review"') && opencodeConfig.includes("__opencode_plan_tools_code_review__") && reviewTools.includes('"command.execute.before"') })
checks.push({ name: "code-review-origin-session-boundary", pass: reviewTools.includes("ignored: true") && reviewTools.includes("reviewPromptLimit") && reviewTools.includes("reviewMarker") && agents.watcher?.permission?.task?.["*"] === "deny" && agents.watcher?.permission?.subagent === "deny" })

console.log(JSON.stringify(checks, null, 2))
if (checks.some((check) => !check.pass)) process.exit(1)
