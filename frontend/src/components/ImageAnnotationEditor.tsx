import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

type Tool = "arrow" | "rectangle" | "circle" | "highlight" | "text";

type Point = {
  x: number;
  y: number;
};

type Annotation = {
  id: string;
  tool: Tool;
  color: string;
  start: Point;
  end?: Point;
  text?: string;
};

const TOOLS: Tool[] = ["arrow", "rectangle", "circle", "text", "highlight"];

type ImageAnnotationEditorProps = {
  initialImageSrc?: string | null;
  onSaveAnnotated?: (blob: Blob) => Promise<void>;
  showFileLoader?: boolean;
};

function drawArrow(ctx: CanvasRenderingContext2D, annotation: Annotation, lineWidth: number) {
  if (!annotation.end) {
    return;
  }
  const { start, end, color } = annotation;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = Math.max(14, 10 + lineWidth * 3);
  const headAngle = Math.PI / 7;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  const leftX = end.x - headLength * Math.cos(angle - headAngle);
  const leftY = end.y - headLength * Math.sin(angle - headAngle);
  const rightX = end.x - headLength * Math.cos(angle + headAngle);
  const rightY = end.y - headLength * Math.sin(angle + headAngle);

  ctx.lineWidth = Math.max(2, lineWidth * 0.9);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(leftX, leftY);
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(rightX, rightY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.95;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawRectangle(ctx: CanvasRenderingContext2D, annotation: Annotation, lineWidth: number, alpha = 1) {
  if (!annotation.end) {
    return;
  }
  const x = Math.min(annotation.start.x, annotation.end.x);
  const y = Math.min(annotation.start.y, annotation.end.y);
  const width = Math.abs(annotation.end.x - annotation.start.x);
  const height = Math.abs(annotation.end.y - annotation.start.y);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, width, height);
  ctx.globalAlpha = 1;
}

function drawCircle(ctx: CanvasRenderingContext2D, annotation: Annotation, lineWidth: number) {
  if (!annotation.end) {
    return;
  }
  const cx = (annotation.start.x + annotation.end.x) / 2;
  const cy = (annotation.start.y + annotation.end.y) / 2;
  const rx = Math.abs(annotation.end.x - annotation.start.x) / 2;
  const ry = Math.abs(annotation.end.y - annotation.start.y) / 2;

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, annotation: Annotation, lineWidth: number) {
  if (!annotation.text) {
    return;
  }
  const fontSize = Math.max(14, 14 + lineWidth * 2);
  ctx.font = `600 ${fontSize}px 'Space Grotesk', sans-serif`;
  ctx.fillStyle = annotation.color;
  ctx.fillText(annotation.text, annotation.start.x, annotation.start.y);
}

function drawHighlight(ctx: CanvasRenderingContext2D, annotation: Annotation) {
  if (!annotation.end) {
    return;
  }
  const x = Math.min(annotation.start.x, annotation.end.x);
  const y = Math.min(annotation.start.y, annotation.end.y);
  const width = Math.abs(annotation.end.x - annotation.start.x);
  const height = Math.abs(annotation.end.y - annotation.start.y);

  ctx.fillStyle = annotation.color;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1;
}

function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation, lineWidth: number) {
  switch (annotation.tool) {
    case "arrow":
      drawArrow(ctx, annotation, lineWidth);
      return;
    case "rectangle":
      drawRectangle(ctx, annotation, lineWidth);
      return;
    case "circle":
      drawCircle(ctx, annotation, lineWidth);
      return;
    case "text":
      drawText(ctx, annotation, lineWidth);
      return;
    case "highlight":
      drawHighlight(ctx, annotation);
      return;
    default:
      return;
  }
}

export function ImageAnnotationEditor({
  initialImageSrc = null,
  onSaveAnnotated,
  showFileLoader = true,
}: ImageAnnotationEditorProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState<string>("#2dd4bf");
  const [lineWidth, setLineWidth] = useState<number>(3);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasImage = useMemo(() => imageElement !== null, [imageElement]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

    for (const annotation of annotations) {
      drawAnnotation(ctx, annotation, lineWidth);
    }

    if (draft) {
      if (draft.tool === "rectangle") {
        drawRectangle(ctx, draft, lineWidth, 0.65);
      } else {
        drawAnnotation(ctx, draft, lineWidth);
      }
    }
  }, [annotations, draft, imageElement, lineWidth]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const getPoint = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!hasImage) {
      return;
    }
    const point = getPoint(event);

    if (tool === "text") {
      const content = window.prompt("Text annotation");
      if (!content) {
        return;
      }
      setAnnotations((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          tool,
          color,
          start: point,
          text: content,
        },
      ]);
      return;
    }

    setDraft({
      id: crypto.randomUUID(),
      tool,
      color,
      start: point,
      end: point,
    });
  };

  const onMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!draft) {
      return;
    }
    const point = getPoint(event);
    setDraft((prev) => (prev ? { ...prev, end: point } : prev));
  };

  const onMouseUp = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!draft) {
      return;
    }
    const point = getPoint(event);
    const finalized: Annotation = { ...draft, end: point };
    setAnnotations((prev) => [...prev, finalized]);
    setDraft(null);
  };

  const onLoadImage = (file: File | null) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        setImageElement(image);
        setAnnotations([]);
        setDraft(null);
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!initialImageSrc) {
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      setImageElement(image);
      setAnnotations([]);
      setDraft(null);
    };
    image.src = initialImageSrc;
  }, [initialImageSrc]);

  const onExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const link = document.createElement("a");
    link.download = `trade-annotation-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const onSave = async () => {
    if (!onSaveAnnotated) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    setSaveError(null);
    setSaveSuccess(null);
    setIsSaving(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) {
            resolve(value);
            return;
          }
          reject(new Error(t("image_editor.png_error")));
        }, "image/png");
      });
      await onSaveAnnotated(blob);
      setSaveSuccess(t("image_editor.save_success"));
    } catch {
      setSaveError(t("image_editor.save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">{t("image_editor.title")}</h2>
        <p className="text-sm text-slate-400 dark:text-slate-900">
          Tools: arrow, rectangle, circle, text, highlight. Load an image, annotate, then export PNG.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_180px_160px_auto_auto_auto]">
        {showFileLoader ? (
          <input
            type="file"
            accept="image/*"
            onChange={(event) => onLoadImage(event.target.files?.[0] || null)}
            className="rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
          />
        ) : (
          <div className="rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2 text-sm text-slate-400 dark:text-slate-900">
            Editing immagine selezionata
          </div>
        )}
        <select
          value={tool}
          onChange={(event) => setTool(event.target.value as Tool)}
          className="rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
        >
          {TOOLS.map((tool) => (
            <option key={tool} value={tool}>
              {t(`image_editor.tool_${tool}`)}
            </option>
          ))}
        </select>
        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="h-10 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-1 py-1"
        />
        <label className="flex items-center gap-2 rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2 text-xs text-slate-300 dark:text-slate-900">
          <span>Spessore</span>
          <input
            type="range"
            min={1}
            max={12}
            value={lineWidth}
            onChange={(event) => setLineWidth(Number(event.target.value))}
            className="w-24"
          />
          <span>{lineWidth}px</span>
        </label>
        <button
          type="button"
          onClick={() => setAnnotations((prev) => prev.slice(0, -1))}
          className="rounded bg-slate-700 px-3 py-2 font-semibold text-slate-100"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => {
            setAnnotations([]);
            setDraft(null);
          }}
          className="rounded bg-slate-700 px-3 py-2 font-semibold text-slate-100"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onExport}
          className="rounded bg-teal-500 px-3 py-2 font-semibold text-slate-950"
        >
          {t("image_editor.export_png")}
        </button>
        {onSaveAnnotated ? (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-950"
          >
            {isSaving ? t("image_editor.saving") : t("image_editor.save_annotated")}
          </button>
        ) : null}
      </div>
      {saveError ? <p className="text-sm text-red-400 dark:text-red-600">{saveError}</p> : null}
      {saveSuccess ? <p className="text-sm text-emerald-300">{saveSuccess}</p> : null}

      <div className="overflow-auto rounded border border-slate-700 dark:border-slate-300 bg-slate-950/70 p-2">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          className="max-h-[560px] w-full cursor-crosshair rounded"
        />
        {!hasImage ? (
          <p className="p-3 text-sm text-slate-400 dark:text-slate-900">Load an image to start annotating.</p>
        ) : null}
      </div>
    </section>
  );
}
