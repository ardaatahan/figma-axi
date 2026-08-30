// Structured errors rendered as TOON on stdout (AXI principle 6).
// Exit codes: 0 success/no-op, 1 error, 2 usage error.

export class AxiError extends Error {
  exitCode = 1;
  suggestion?: string;

  constructor(message: string, suggestion?: string) {
    super(message);
    this.suggestion = suggestion;
  }
}

export class UsageError extends AxiError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion);
    this.exitCode = 2;
  }
}

export function renderError(err: AxiError): string {
  const lines = [`error: ${err.message}`];
  if (err.suggestion) lines.push(`suggestion: ${err.suggestion}`);
  return lines.join("\n");
}
