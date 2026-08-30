import { readFileSync } from "node:fs";
import type { CommandModule } from "../cli/router.js";
import { print } from "../output/toon.js";
import { renderHome, rootHelpText } from "../skill/content.js";

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

export const homeCommand: CommandModule = {
  spec: {
    name: "",
    summary: "Home view: live content first (AXI principle 8)",
    flags: [
      { name: "version", type: "boolean", description: "print the tool version" },
    ],
    examples: ["figma-axi", "figma-axi --version"],
  },
  run(parsed) {
    if (parsed.flags["version"]) {
      print(`figma-axi: ${version()}`);
      return 0;
    }
    print(renderHome(process.argv[1] ?? "figma-axi"));
    return 0;
  },
};

export function rootHelp(): string {
  return rootHelpText();
}
