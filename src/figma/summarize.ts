// Pure summarization helpers over Figma file/node JSON. Figma files are
// huge (multi-MB trees); these functions reduce them to the handful of
// fields a web designer or agent actually decides on.

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  fills?: Paint[];
  strokes?: Paint[];
  strokeWeight?: number;
  cornerRadius?: number;
  opacity?: number;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  characters?: string;
  style?: TypeStyle;
  componentId?: string;
  effects?: Array<{ type: string; visible?: boolean }>;
  backgroundColor?: RGBA;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Paint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: RGBA;
  gradientStops?: Array<{ color: RGBA; position: number }>;
}

export interface TypeStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlignHorizontal?: string;
  textCase?: string;
}

export function rgbaToHex(c: RGBA): string {
  const to2 = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  const base = `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
  return c.a >= 1 ? base : `${base}${to2(c.a)}`;
}

/** One paint as a compact string: "#1a2b3c", "#1a2b3c@50%", "linear-gradient(3 stops)", "image". */
export function paintToString(p: Paint): string {
  if (p.visible === false) return "";
  if (p.type === "SOLID" && p.color) {
    const hex = rgbaToHex(p.color);
    return p.opacity !== undefined && p.opacity < 1 ? `${hex}@${Math.round(p.opacity * 100)}%` : hex;
  }
  if (p.type.startsWith("GRADIENT_")) {
    const kind = p.type.slice("GRADIENT_".length).toLowerCase();
    const stops = p.gradientStops?.length ?? 0;
    return `${kind}-gradient(${stops} stops)`;
  }
  if (p.type === "IMAGE") return "image";
  return p.type.toLowerCase();
}

export function paintsToString(paints: Paint[] | undefined): string {
  if (!paints || paints.length === 0) return "";
  return paints.map(paintToString).filter(Boolean).join(" + ");
}

export function sizeToString(node: FigmaNode): string {
  const b = node.absoluteBoundingBox;
  if (!b) return "";
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return `${fmt(b.width)}x${fmt(b.height)}`;
}

/** Auto-layout in one string: "vertical gap=8 pad=16/24" (top-bottom/left-right). */
export function layoutToString(node: FigmaNode): string {
  if (!node.layoutMode || node.layoutMode === "NONE") return "";
  const parts = [node.layoutMode.toLowerCase()];
  if (node.itemSpacing) parts.push(`gap=${node.itemSpacing}`);
  const t = node.paddingTop ?? 0;
  const r = node.paddingRight ?? 0;
  const b = node.paddingBottom ?? 0;
  const l = node.paddingLeft ?? 0;
  if (t || r || b || l) {
    parts.push(t === b && l === r ? `pad=${t}/${l}` : `pad=${t},${r},${b},${l}`);
  }
  return parts.join(" ");
}

export function typeStyleToString(s: TypeStyle | undefined): string {
  if (!s) return "";
  const parts: string[] = [];
  if (s.fontFamily) parts.push(s.fontFamily);
  if (s.fontWeight) parts.push(String(s.fontWeight));
  if (s.fontSize) {
    let sizing = `${s.fontSize}px`;
    if (s.lineHeightPx) sizing += `/${Math.round(s.lineHeightPx * 10) / 10}px`;
    parts.push(sizing);
  }
  return parts.join(" ");
}

export interface TreeCounts {
  total: number;
  byType: Record<string, number>;
  instances: number;
  texts: number;
}

/** Counts all descendants (excluding the node itself). */
export function countTree(node: FigmaNode): TreeCounts {
  const counts: TreeCounts = { total: 0, byType: {}, instances: 0, texts: 0 };
  const walk = (n: FigmaNode) => {
    for (const child of n.children ?? []) {
      counts.total++;
      counts.byType[child.type] = (counts.byType[child.type] ?? 0) + 1;
      if (child.type === "INSTANCE") counts.instances++;
      if (child.type === "TEXT") counts.texts++;
      walk(child);
    }
  };
  walk(node);
  return counts;
}

/** Collects the text content of a subtree, in document order. */
export function collectText(node: FigmaNode, limit = 50): string[] {
  const out: string[] = [];
  const walk = (n: FigmaNode) => {
    if (out.length >= limit) return;
    if (n.type === "TEXT" && n.characters) out.push(n.characters);
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return out;
}
