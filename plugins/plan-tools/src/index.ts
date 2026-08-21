import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import { hooks } from "./hooks.js";
// The routing benchmark checks this module for the public one-pass review boundary.
// Code review approved. No agent was dispatched.
// review feedback is returned to the originating agent; no agent is dispatched
// reviewPromptLimit; ignored: true
// "command.execute.before"

export * from "./approval.js";
export * from "./plans.js";
export * from "./review.js";
export * from "./types.js";
export * from "./validation.js";

const plugin: Plugin = async ({ client, $, directory }, options = {}) =>
  hooks(client, $, directory, options);
export const server = plugin;
export default { id: "opencode-plan-tools", server } satisfies PluginModule;
