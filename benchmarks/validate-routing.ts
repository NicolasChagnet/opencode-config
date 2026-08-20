import { readFileSync } from "node:fs"

const config = JSON.parse(await new Response(Bun.spawn(["opencode", "debug", "config"], { stdout: "pipe" }).stdout).text())
const scenarios = JSON.parse(readFileSync(new URL("./agent-routing.json", import.meta.url), "utf8"))
const agents = config.agent

const allow = (agent: string, child: string) => agents[agent]?.permission?.task?.[child] === "allow"
const checks = scenarios.map((scenario: any) => {
  const chain = scenario.grandchild
    ? allow(scenario.parent, scenario.child) && allow(scenario.child, scenario.grandchild)
    : allow(scenario.parent, scenario.child)
  return { name: scenario.name, pass: chain && config.subagent_depth >= scenario.maxDepth }
})

console.log(JSON.stringify(checks, null, 2))
if (checks.some((check) => !check.pass)) process.exit(1)
