// Contextual next-step suggestions (AXI principle 9).

import { emitBlock } from "./toon.js";

export function helpBlock(lines: string[]): string {
  return emitBlock("help", lines);
}
