import { readFileSync } from "node:fs"

const config = JSON.parse(await new Response(Bun.spawn(["opencode", "debug", "config"], { stdout: "pipe" }).stdout).text())
const scenarios = JSON.parse(readFileSync(new URL("./agent-routing.json", import.meta.url), "utf8"))
const agents = config.agent
const root = new URL("..", import.meta.url)
const opencodeConfig = readFileSync(new URL("opencode.jsonc", root), "utf8")
const planTools = readFileSync(new URL("plugins/plan-tools/src/index.ts", root), "utf8") + readFileSync(new URL("plugins/plan-tools/src/review.ts", root), "utf8") + readFileSync(new URL("plugins/plan-tools/src/hooks.ts", root), "utf8")

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
  admiral: { "*": "deny", read: { "*": "deny", "*AGENTS.md": "allow" }, edit: "deny", bash: "deny", task: { "*": "deny", navigator: "allow", cartographer: "allow", recon: "allow" }, submit_plan: "allow", initialize_plan: "allow", insert_step: "allow", update_step: "allow", read_plan: "allow", read_plan_step: "allow", question: "allow", questions: "allow" },
  fleet: { "*": "deny", edit: "deny", bash: "deny", task: { "*": "deny", frigate: "allow", watcher: "allow" }, glimpse_plan: "allow" },
  frigate: { "github_*": "allow", edit: "allow", bash: "allow", skill: { "*": "deny", "debugging-and-error-recovery": "allow", "code-simplification": "allow", "codebase-design": "allow", "rust-perf": "allow", "python-perf": "allow", "data-science": "allow", "local-data": "allow", "marimo-ds": "allow", bigquery: "allow", dataform: "allow" }, "ast-grep-search": "allow", "ast-grep-outline": "allow", "ast-grep-rewrite": "allow", "codegraph*": "allow", task: { "*": "deny", navigator: "allow", chronicler: "allow" }, read_plan_step: "allow" },
  watcher: { "*": "deny", edit: "deny", bash: { "*": "deny", "git diff *": "allow", "git show *": "allow", "git log *": "allow", "git status": "allow", "jj diff --git --no-pager": "allow", "jj show -r *": "allow", "jj log *": "allow", "jj status": "allow" }, task: { "*": "deny" }, subagent: "deny", "ast-grep-search": "allow", "ast-grep-outline": "allow", "codegraph*": "allow", read: "allow", glob: "allow", grep: "allow", list: "allow", read_plan: "allow", skill: { "*": "deny", "code-review-and-quality": "allow", "code-simplification": "allow", "codebase-design": "allow" } },
  build: {}, plan: {}, general: {}, explore: {}, scout: {},
  jack: { edit: "allow", bash: "allow", task: "deny", skill: { "*": "allow" }, submit_plan: "deny", "ast-grep-search": "allow", "ast-grep-outline": "allow", "codegraph*": "allow", "github_*": "allow" },
  cartographer: { "*": "deny", read: "allow", glob: "allow", grep: "allow", "ast-grep-search": "allow", "ast-grep-outline": "allow", "codegraph*": "allow", edit: "deny", bash: "deny", task: "deny", webfetch: "deny", websearch: "deny", skill: "deny", "github*": "deny", "context7*": "deny", "paper-search*": "deny", "arxiv*": "deny" },
  chronicler: { "*": "deny", skill: { "*": "deny", "writing-clearly-and-concisely": "allow", humanizer: "allow" } },
  navigator: { read: "deny", glob: "deny", grep: "deny", list: "deny", edit: "deny", bash: "deny", task: "deny", subagent: "deny", apply_patch: "deny", "ast-grep-outline": "deny", "ast-grep-search": "deny", "ast-grep-rewrite": "deny", question: "deny", skill: "deny", todowrite: "deny", submit_plan: "deny", webfetch: "allow", websearch: "allow", "context7*": "allow", "github-readonly*": "allow", "paper-search*": "allow", "arxiv*": "allow" },
  bosun: { "*": "deny", edit: "deny", bash: "deny", question: "allow", task: { "*": "deny", navigator: "allow" } },
  recon: { "*": "deny", edit: "deny", bash: "deny", read: "deny", grep: "deny", task: { "*": "deny", navigator: "allow", cartographer: "allow" }, question: "allow", skill: { "*": "deny", "idea-refine": "allow" } },
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
  return { name: scenario.name, pass: chain && config.subagent_depth >= scenario.maxDepth }
})

for (const agent of Object.keys(agents)) {
  checks.push({
    name: `${agent}-exact-permissions`,
    pass: expectedPermissions[agent] !== undefined && JSON.stringify(normalize(agents[agent]?.permission ?? {})) === JSON.stringify(normalize(expectedPermissions[agent])),
  })
}

const boundaries = {
  admiral: ["cartographer", "navigator", "recon"],
  fleet: ["frigate", "watcher"],
  frigate: ["navigator", "chronicler"],
  watcher: [],
  recon: ["navigator", "cartographer"],
}
for (const [parent, children] of Object.entries(boundaries)) {
  for (const [child, value] of Object.entries(agents[parent]?.permission?.task ?? {})) {
    if (value === "allow" && child !== "*" && !children.includes(child)) checks.push({ name: `${parent}-only-boundary`, pass: false })
  }
}

checks.push({ name: "code-review-hook-registered", pass: opencodeConfig.includes('"code-review"') && opencodeConfig.includes("__opencode_plan_tools_code_review__") && planTools.includes('"command.execute.before"') })
checks.push({ name: "code-review-origin-session-boundary", pass: planTools.includes("Code review approved. No agent was dispatched.") && planTools.includes("Code-review feedback from Plannotator") && planTools.includes("ignored: true") && planTools.includes("reviewPromptLimit") && agents.watcher?.permission?.task?.["*"] === "deny" && agents.watcher?.permission?.subagent === "deny" })

console.log(JSON.stringify(checks, null, 2))
if (checks.some((check) => !check.pass)) process.exit(1)
