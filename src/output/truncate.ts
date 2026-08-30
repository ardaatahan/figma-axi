// Content truncation with size hints (AXI principle 3).

export interface Truncated {
  text: string;
  truncated: boolean;
  totalChars: number;
}

export function truncate(text: string, limit = 800): Truncated {
  if (text.length <= limit) {
    return { text, truncated: false, totalChars: text.length };
  }
  return { text: text.slice(0, limit), truncated: true, totalChars: text.length };
}

/** Renders the "... (truncated, N chars total)" marker line. */
export function truncationNote(t: Truncated): string {
  return `  ... (truncated, ${t.totalChars} chars total)`;
}
