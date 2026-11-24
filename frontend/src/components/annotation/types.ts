export type AnnotationTool =
  | "select"
  | "pan"
  | "trendline"
  | "hline"
  | "arrow"
  | "rect"
  | "ellipse"
  | "position"
  | "freehand"
  | "text";

export type LineStyle = "solid" | "dashed";

export type PositionDirection = "long" | "short";

export interface AnnotationBase {
  id: string;
  tool: Exclude<AnnotationTool, "select" | "pan">;
  color: string;
  strokeWidth: number;
  lineStyle: LineStyle;
  fillOpacity: number;
}

export interface TwoPointAnnotation extends AnnotationBase {
  tool: "trendline" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HorizontalLineAnnotation extends AnnotationBase {
  tool: "hline";
  y: number;
  label?: string;
}

export interface BoxAnnotation extends AnnotationBase {
  tool: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionBoxAnnotation extends AnnotationBase {
  tool: "position";
  direction: PositionDirection;
  x: number;
  y: number;
  width: number;
  height: number;
  entryRatio: number; // 0..1 vertical split between TP and SL
}

export interface FreehandAnnotation extends AnnotationBase {
  tool: "freehand";
  points: number[]; // flat normalized [x0, y0, x1, y1, ...]
}

export interface TextAnnotation extends AnnotationBase {
  tool: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  hasBackground: boolean;
}

export type AnnotationItem =
  | TwoPointAnnotation
  | HorizontalLineAnnotation
  | BoxAnnotation
  | PositionBoxAnnotation
  | FreehandAnnotation
  | TextAnnotation;

export interface AnnotationDocument {
  version: 1;
  items: AnnotationItem[];
}

export const TRADING_SWATCHES = [
  "#2dd4bf", // Teal accent
  "#22c55e", // Bullish green
  "#ef4444", // Bearish red
  "#f59e0b", // Amber warning
  "#60a5fa", // Sky blue
  "#a78bfa", // Violet
  "#f8fafc", // Chalk white
  "#0f172a", // Obsidian black
] as const;

export const STROKE_PRESETS = [1, 2, 3, 5] as const;

export function parseAnnotationDocument(raw?: string | null): AnnotationItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<AnnotationDocument>;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
      return parsed.items;
    }
    return [];
  } catch {
    return [];
  }
}

export function serializeAnnotationDocument(items: AnnotationItem[]): string {
  const doc: AnnotationDocument = {
    version: 1,
    items,
  };
  return JSON.stringify(doc);
}
