import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import { hooks } from "./hooks.js";

export * from "./review.js";

const plugin: Plugin = async ({ client, $, directory }, options = {}) =>
  hooks(client, $, directory, options);
export const server = plugin;
export default { id: "opencode-review-tools", server } satisfies PluginModule;
