import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet, downloadTo } from "../dist/figma/api.js";
import { AxiError } from "../dist/output/errors.js";

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete process.env["FIGMA_TOKEN"];
});

// Simulates what a genuinely hung endpoint produces once AbortSignal.timeout
// fires: fetch rejects with a DOMException named "TimeoutError". This proves
// the request()/downloadTo() catch blocks map that into a bounded, structured
// AxiError instead of letting the CLI hang indefinitely or crash with a raw
// stack trace.
function stubHungFetch(): void {
  global.fetch = vi.fn(() =>
    Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
  ) as unknown as typeof fetch;
}

describe("Figma API request timeout handling", () => {
  it("maps a timed-out GET request to a structured, bounded error", async () => {
    process.env["FIGMA_TOKEN"] = "figd_test-token";
    stubHungFetch();
    await expect(apiGet("/v1/files/AbCdEf123456")).rejects.toMatchObject({
      message: expect.stringContaining("timed out after 30s"),
    });
    await expect(apiGet("/v1/files/AbCdEf123456")).rejects.toBeInstanceOf(AxiError);
  });

  it("maps a timed-out asset download to a structured, bounded error", async () => {
    stubHungFetch();
    await expect(downloadTo("https://example.com/render.png", "/tmp/does-not-matter.png")).rejects.toMatchObject({
      message: expect.stringContaining("download timed out after 30s"),
    });
  });
});
