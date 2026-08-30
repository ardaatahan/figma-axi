import { describe, expect, it } from "vitest";
import {
  collectText,
  countTree,
  layoutToString,
  paintsToString,
  paintToString,
  rgbaToHex,
  sizeToString,
  typeStyleToString,
  type FigmaNode,
} from "../dist/figma/summarize.js";

describe("rgbaToHex", () => {
  it("converts opaque colors", () => {
    expect(rgbaToHex({ r: 1, g: 1, b: 1, a: 1 })).toBe("#ffffff");
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe("#000000");
    expect(rgbaToHex({ r: 0.145, g: 0.388, b: 0.922, a: 1 })).toBe("#2563eb");
  });

  it("appends the alpha channel when translucent", () => {
    expect(rgbaToHex({ r: 1, g: 0, b: 0, a: 0.5 })).toBe("#ff000080");
  });
});

describe("paints", () => {
  it("renders solid paints as hex", () => {
    expect(paintToString({ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } })).toBe("#ffffff");
  });

  it("notes paint-level opacity", () => {
    expect(paintToString({ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 0.4 })).toBe("#000000@40%");
  });

  it("summarizes gradients by kind and stop count", () => {
    expect(
      paintToString({
        type: "GRADIENT_LINEAR",
        gradientStops: [
          { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
          { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
        ],
      }),
    ).toBe("linear-gradient(2 stops)");
  });

  it("skips invisible paints and joins multiples", () => {
    expect(
      paintsToString([
        { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, visible: false },
        { type: "IMAGE" },
      ]),
    ).toBe("image");
  });

  it("is empty for missing fills", () => {
    expect(paintsToString(undefined)).toBe("");
    expect(paintsToString([])).toBe("");
  });
});

describe("layoutToString", () => {
  it("is empty without auto-layout", () => {
    expect(layoutToString({ id: "1", name: "x", type: "FRAME" })).toBe("");
  });

  it("compacts symmetric padding", () => {
    expect(
      layoutToString({
        id: "1",
        name: "x",
        type: "FRAME",
        layoutMode: "VERTICAL",
        itemSpacing: 24,
        paddingTop: 96,
        paddingBottom: 96,
        paddingLeft: 120,
        paddingRight: 120,
      }),
    ).toBe("vertical gap=24 pad=96/120");
  });

  it("spells out asymmetric padding clockwise", () => {
    expect(
      layoutToString({
        id: "1",
        name: "x",
        type: "FRAME",
        layoutMode: "HORIZONTAL",
        paddingTop: 1,
        paddingRight: 2,
        paddingBottom: 3,
        paddingLeft: 4,
      }),
    ).toBe("horizontal pad=1,2,3,4");
  });
});

describe("typeStyleToString", () => {
  it("renders family, weight, and size/line-height", () => {
    expect(
      typeStyleToString({ fontFamily: "Inter", fontWeight: 700, fontSize: 64, lineHeightPx: 76.8 }),
    ).toBe("Inter 700 64px/76.8px");
  });
});

describe("sizeToString", () => {
  it("renders integers plainly and trims floats", () => {
    const node = (w: number, h: number): FigmaNode => ({
      id: "1",
      name: "x",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: w, height: h },
    });
    expect(sizeToString(node(1440, 720))).toBe("1440x720");
    expect(sizeToString(node(320.5, 100.25))).toBe("320.5x100.3");
  });
});

const TREE: FigmaNode = {
  id: "1:2",
  name: "Hero",
  type: "FRAME",
  children: [
    { id: "1:3", name: "Headline", type: "TEXT", characters: "Hello" },
    {
      id: "1:4",
      name: "CTA",
      type: "INSTANCE",
      children: [{ id: "I1:4;5:2", name: "Label", type: "TEXT", characters: "Go" }],
    },
  ],
};

describe("countTree", () => {
  it("counts descendants by type", () => {
    const counts = countTree(TREE);
    expect(counts.total).toBe(3);
    expect(counts.texts).toBe(2);
    expect(counts.instances).toBe(1);
    expect(counts.byType["TEXT"]).toBe(2);
  });
});

describe("collectText", () => {
  it("collects text in document order", () => {
    expect(collectText(TREE)).toEqual(["Hello", "Go"]);
  });
});
