import { describe, expect, it } from "vitest";
import { normalizeNodeId, parseFileRef } from "../dist/figma/urls.js";
import { UsageError } from "../dist/output/errors.js";

describe("parseFileRef", () => {
  it("accepts a raw file key", () => {
    expect(parseFileRef("AbCdEf123456")).toEqual({ key: "AbCdEf123456" });
  });

  it("parses /design/ URLs with titles and query params", () => {
    expect(parseFileRef("https://www.figma.com/design/AbCdEf123456/My-Site?t=xyz-0")).toEqual({
      key: "AbCdEf123456",
    });
  });

  it("parses legacy /file/ URLs", () => {
    expect(parseFileRef("https://www.figma.com/file/AbCdEf123456/My-Site")).toEqual({
      key: "AbCdEf123456",
    });
  });

  it("parses /board/, /proto/, and /slides/ URLs", () => {
    for (const kind of ["board", "proto", "slides"]) {
      expect(parseFileRef(`https://www.figma.com/${kind}/AbCdEf123456/Title`).key).toBe("AbCdEf123456");
    }
  });

  it("extracts and normalizes ?node-id= from URLs", () => {
    const ref = parseFileRef("https://www.figma.com/design/AbCdEf123456/My-Site?node-id=12-34&m=dev");
    expect(ref).toEqual({ key: "AbCdEf123456", nodeId: "12:34" });
  });

  it("rejects non-figma hosts", () => {
    expect(() => parseFileRef("https://evil.example.com/design/AbCdEf123456/x")).toThrow(UsageError);
  });

  it("rejects strings that are neither keys nor URLs", () => {
    expect(() => parseFileRef("not a key")).toThrow(UsageError);
    expect(() => parseFileRef("short")).toThrow(UsageError);
  });
});

describe("normalizeNodeId", () => {
  it("passes through API-form ids", () => {
    expect(normalizeNodeId("12:34")).toBe("12:34");
  });

  it("converts URL-form ids", () => {
    expect(normalizeNodeId("12-34")).toBe("12:34");
  });

  it("handles instance-nested ids", () => {
    expect(normalizeNodeId("I1:4;5:2")).toBe("I1:4;5:2");
  });

  it("rejects garbage", () => {
    expect(() => normalizeNodeId("hello")).toThrow(UsageError);
  });
});
