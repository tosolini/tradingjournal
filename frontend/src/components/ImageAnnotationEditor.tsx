import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Arrow,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Tag,
  Text as KonvaText,
  Label,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { ToolIcon } from "./annotation/ToolIcons";
import {
  type AnnotationItem,
  type AnnotationTool,
  type BoxAnnotation,
  type FreehandAnnotation,
  type HorizontalLineAnnotation,
  type LineStyle,
  type PositionBoxAnnotation,
  type PositionDirection,
  STROKE_PRESETS,
  TRADING_SWATCHES,
  type TextAnnotation,
  type TwoPointAnnotation,
  serializeAnnotationDocument,
} from "./annotation/types";

type ImageAnnotationEditorProps = {
  initialImageSrc?: string | null;
  initialAnnotations?: AnnotationItem[];
  onSaveAnnotated?: (blob: Blob, annotationsJson: string) => Promise<void>;
  onSaveAsNew?: (blob: Blob) => Promise<void>;
  showFileLoader?: boolean;
  isLegacyFlattened?: boolean;
  onResetToOriginal?: () => void;
};

type ToolDef = {
  id: AnnotationTool;
  shortcut: string;
};

const TOOLBAR_TOOLS: ToolDef[] = [
  { id: "select", shortcut: "V" },
  { id: "pan", shortcut: "H" },
  { id: "trendline", shortcut: "T" },
  { id: "hline", shortcut: "L" },
  { id: "arrow", shortcut: "A" },
  { id: "rect", shortcut: "R" },
  { id: "ellipse", shortcut: "C" },
  { id: "position", shortcut: "P" },
  { id: "freehand", shortcut: "M" },
  { id: "text", shortcut: "N" },
];

const MAX_HISTORY = 50;

export function ImageAnnotationEditor({
  initialImageSrc = null,
  initialAnnotations = [],
  onSaveAnnotated,
  onSaveAsNew,
  showFileLoader = true,
  isLegacyFlattened = false,
  onResetToOriginal,
}: ImageAnnotationEditorProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const shapeRefs = useRef<Record<string, Konva.Node | null>>({});

  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState<{ width: number; height: number }>({ width: 1200, height: 700 });
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 900, height: 580 });

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const [tool, setTool] = useState<AnnotationTool>("trendline");
  const [color, setColor] = useState<string>("#2dd4bf");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [lineStyle, setLineStyle] = useState<LineStyle>("solid");
  const [fillOpacity, setFillOpacity] = useState<number>(0.18);
  const [fontSize, setFontSize] = useState<number>(16);
  const [positionDir, setPositionDir] = useState<PositionDirection>("long");

  const [items, setItems] = useState<AnnotationItem[]>(initialAnnotations);
  const [history, setHistory] = useState<AnnotationItem[][]>([initialAnnotations]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const [draft, setDraft] = useState<AnnotationItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const [inlineEdit, setInlineEdit] = useState<{
    mode: "new-text" | "edit-text" | "edit-hline";
    targetId?: string;
    normX: number;
    normY: number;
    screenX: number;
    screenY: number;
    value: string;
  } | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const activeTool: AnnotationTool = isSpacePressed ? "pan" : tool;
  const hasImage = imageElement !== null;

  const commitItems = useCallback(
    (next: AnnotationItem[], markDirty = true) => {
      setItems(next);
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIdx + 1);
        const updated = [...sliced, next].slice(-MAX_HISTORY);
        setHistoryIdx(updated.length - 1);
        return updated;
      });
      if (markDirty) setIsDirty(true);
    },
    [historyIdx]
  );

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const nextIdx = historyIdx - 1;
    setHistoryIdx(nextIdx);
    setItems(history[nextIdx]);
    setSelectedId(null);
    setIsDirty(true);
  }, [canUndo, history, historyIdx]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    setItems(history[nextIdx]);
    setSelectedId(null);
    setIsDirty(true);
  }, [canRedo, history, historyIdx]);

  const fitToViewport = useCallback(
    (imgW: number, imgH: number, vpW: number, vpH: number) => {
      if (!imgW || !imgH || !vpW || !vpH) return;
      const pad = 28;
      const fitScale = Math.min((vpW - pad * 2) / imgW, (vpH - pad * 2) / imgH, 1.5);
      const clamped = Math.max(0.15, Math.min(fitScale, 4));
      setZoom(clamped);
      setPan({
        x: (vpW - imgW * clamped) / 2,
        y: (vpH - imgH * clamped) / 2,
      });
    },
    []
  );

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load initialImageSrc
  useEffect(() => {
    if (!initialImageSrc) {
      setImageElement(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || 1200;
      const h = img.naturalHeight || 700;
      setImgSize({ width: w, height: h });
      setImageElement(img);
      setItems(initialAnnotations);
      setHistory([initialAnnotations]);
      setHistoryIdx(0);
      setSelectedId(null);
      setDraft(null);
      setInlineEdit(null);
      setIsDirty(false);
      setSaveError(null);
      setSaveSuccess(null);
      fitToViewport(w, h, viewport.width, viewport.height);
    };
    img.src = initialImageSrc;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageSrc, initialAnnotations]);

  // Attach Konva Transformer to selected shape
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (!selectedId || activeTool !== "select") {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const selectedItem = items.find((it) => it.id === selectedId);
    const node = shapeRefs.current[selectedId];
    // Only attach Transformer to box/text shapes; lines/arrows/freehand are dragged as a whole
    if (
      node &&
      selectedItem &&
      (selectedItem.tool === "rect" ||
        selectedItem.tool === "ellipse" ||
        selectedItem.tool === "position" ||
        selectedItem.tool === "text")
    ) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, activeTool, items]);

  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedId) ?? null,
    [items, selectedId]
  );

  const updateSelectedItem = useCallback(
    (patch: Partial<AnnotationItem>) => {
      if (!selectedId) return;
      const next = items.map((it) =>
        it.id === selectedId ? ({ ...it, ...patch } as AnnotationItem) : it
      );
      commitItems(next);
    },
    [items, selectedId, commitItems]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commitItems(items.filter((it) => it.id !== selectedId));
    setSelectedId(null);
  }, [items, selectedId, commitItems]);

  const duplicateSelected = useCallback(() => {
    if (!selectedItem) return;
    const offset = 0.02;
    const clone = structuredClone(selectedItem);
    clone.id = crypto.randomUUID();
    if (clone.tool === "rect" || clone.tool === "ellipse" || clone.tool === "position" || clone.tool === "text") {
      clone.x = Math.min(0.95, clone.x + offset);
      clone.y = Math.min(0.95, clone.y + offset);
    } else if (clone.tool === "trendline" || clone.tool === "arrow") {
      clone.x1 += offset;
      clone.y1 += offset;
      clone.x2 += offset;
      clone.y2 += offset;
    } else if (clone.tool === "hline") {
      clone.y = Math.min(0.98, clone.y + offset);
    } else if (clone.tool === "freehand") {
      clone.points = clone.points.map((v) => v + offset);
    }
    commitItems([...items, clone]);
    setSelectedId(clone.id);
  }, [selectedItem, items, commitItems]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setIsSpacePressed(true);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedId) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setDraft(null);
        setInlineEdit(null);
        return;
      }

      if (!mod && !e.altKey) {
        const keyUpper = e.key.toUpperCase();
        const found = TOOLBAR_TOOLS.find((td) => td.shortcut === keyUpper);
        if (found) {
          e.preventDefault();
          setTool(found.id);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
        isPanningRef.current = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [undo, redo, duplicateSelected, deleteSelected, selectedId]);

  const toNormalized = useCallback(
    (stageX: number, stageY: number) => {
      const imgX = (stageX - pan.x) / zoom;
      const imgY = (stageY - pan.y) / zoom;
      return {
        x: Math.max(0, Math.min(1, imgX / imgSize.width)),
        y: Math.max(0, Math.min(1, imgY / imgSize.height)),
      };
    },
    [pan, zoom, imgSize]
  );

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const nextZoom = Math.max(0.15, Math.min(5, direction > 0 ? zoom * scaleBy : zoom / scaleBy));

    const mousePointTo = {
      x: (pointer.x - pan.x) / zoom,
      y: (pointer.y - pan.y) / zoom,
    };

    setZoom(nextZoom);
    setPan({
      x: pointer.x - mousePointTo.x * nextZoom,
      y: pointer.y - mousePointTo.y * nextZoom,
    });
  };

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (!hasImage) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (activeTool === "pan") {
      isPanningRef.current = true;
      panStartRef.current = {
        x: pointer.x,
        y: pointer.y,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    if (activeTool === "select") {
      const clickedOnEmpty =
        e.target === stage || e.target.name() === "background-image";
      if (clickedOnEmpty) {
        setSelectedId(null);
      }
      return;
    }

    const norm = toNormalized(pointer.x, pointer.y);

    if (activeTool === "text") {
      setInlineEdit({
        mode: "new-text",
        normX: norm.x,
        normY: norm.y,
        screenX: pointer.x,
        screenY: pointer.y,
        value: "",
      });
      return;
    }

    if (activeTool === "hline") {
      const newHline: HorizontalLineAnnotation = {
        id: crypto.randomUUID(),
        tool: "hline",
        color,
        strokeWidth,
        lineStyle,
        fillOpacity,
        y: norm.y,
        label: "",
      };
      commitItems([...items, newHline]);
      setSelectedId(newHline.id);
      return;
    }

    const base = {
      id: crypto.randomUUID(),
      color,
      strokeWidth,
      lineStyle,
      fillOpacity,
    };

    if (activeTool === "trendline" || activeTool === "arrow") {
      setDraft({
        ...base,
        tool: activeTool,
        x1: norm.x,
        y1: norm.y,
        x2: norm.x,
        y2: norm.y,
      });
    } else if (activeTool === "rect" || activeTool === "ellipse") {
      setDraft({
        ...base,
        tool: activeTool,
        x: norm.x,
        y: norm.y,
        width: 0,
        height: 0,
      });
    } else if (activeTool === "position") {
      setDraft({
        ...base,
        tool: "position",
        direction: positionDir,
        x: norm.x,
        y: norm.y,
        width: 0,
        height: 0,
        entryRatio: 0.5,
      });
    } else if (activeTool === "freehand") {
      setDraft({
        ...base,
        tool: "freehand",
        points: [norm.x, norm.y],
      });
    }
  };

  const handleStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (isPanningRef.current) {
      setPan({
        x: panStartRef.current.panX + (pointer.x - panStartRef.current.x),
        y: panStartRef.current.panY + (pointer.y - panStartRef.current.y),
      });
      return;
    }

    if (!draft) return;
    const norm = toNormalized(pointer.x, pointer.y);

    if (draft.tool === "trendline" || draft.tool === "arrow") {
      setDraft({ ...draft, x2: norm.x, y2: norm.y });
    } else if (draft.tool === "rect" || draft.tool === "ellipse" || draft.tool === "position") {
      setDraft({
        ...draft,
        width: norm.x - draft.x,
        height: norm.y - draft.y,
      });
    } else if (draft.tool === "freehand") {
      setDraft({
        ...draft,
        points: [...draft.points, norm.x, norm.y],
      });
    }
  };

  const handleStageMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if (!draft) return;

    let finalized: AnnotationItem | null = draft;
    if (draft.tool === "rect" || draft.tool === "ellipse" || draft.tool === "position") {
      const nx = draft.width < 0 ? draft.x + draft.width : draft.x;
      const ny = draft.height < 0 ? draft.y + draft.height : draft.y;
      const nw = Math.abs(draft.width);
      const nh = Math.abs(draft.height);
      if (nw < 0.005 && nh < 0.005) {
        finalized = null;
      } else {
        finalized = { ...draft, x: nx, y: ny, width: nw, height: nh };
      }
    } else if (draft.tool === "trendline" || draft.tool === "arrow") {
      const dist = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
      if (dist < 0.005) finalized = null;
    } else if (draft.tool === "freehand") {
      if (draft.points.length < 4) finalized = null;
    }

    if (finalized) {
      commitItems([...items, finalized]);
      setSelectedId(finalized.id);
    }
    setDraft(null);
  };

  const commitInlineText = () => {
    if (!inlineEdit) return;
    const trimmed = inlineEdit.value.trim();
    if (inlineEdit.mode === "new-text") {
      if (trimmed) {
        const newItem: TextAnnotation = {
          id: crypto.randomUUID(),
          tool: "text",
          color,
          strokeWidth,
          lineStyle,
          fillOpacity,
          x: inlineEdit.normX,
          y: inlineEdit.normY,
          text: trimmed,
          fontSize,
          hasBackground: true,
        };
        commitItems([...items, newItem]);
        setSelectedId(newItem.id);
      }
    } else if (inlineEdit.mode === "edit-text" && inlineEdit.targetId) {
      if (trimmed) {
        commitItems(
          items.map((it) =>
            it.id === inlineEdit.targetId && it.tool === "text"
              ? { ...it, text: trimmed }
              : it
          )
        );
      }
    } else if (inlineEdit.mode === "edit-hline" && inlineEdit.targetId) {
      commitItems(
        items.map((it) =>
          it.id === inlineEdit.targetId && it.tool === "hline"
            ? { ...it, label: trimmed }
            : it
        )
      );
    }
    setInlineEdit(null);
  };

  const onLoadLocalFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 1200;
        const h = img.naturalHeight || 700;
        setImgSize({ width: w, height: h });
        setImageElement(img);
        setItems([]);
        setHistory([[]]);
        setHistoryIdx(0);
        setSelectedId(null);
        fitToViewport(w, h, viewport.width, viewport.height);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Export clean full-resolution PNG without Transformer or zoom/pan artifacts
  const exportCleanBlob = async (): Promise<Blob> => {
    const stage = stageRef.current;
    if (!stage) throw new Error(t("image_editor.png_error"));

    const prevZoom = zoom;
    const prevPan = pan;
    const prevSelected = selectedId;
    const prevW = stage.width();
    const prevH = stage.height();

    if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
    setSelectedId(null);
    stage.width(imgSize.width);
    stage.height(imgSize.height);
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        stage.toBlob({
          x: 0,
          y: 0,
          width: imgSize.width,
          height: imgSize.height,
          pixelRatio: 1,
          mimeType: "image/png",
          callback: (value) => {
            if (value) resolve(value);
            else reject(new Error(t("image_editor.png_error")));
          },
        });
      });
      return blob;
    } finally {
      stage.width(prevW);
      stage.height(prevH);
      stage.scale({ x: prevZoom, y: prevZoom });
      stage.position(prevPan);
      stage.batchDraw();
      setSelectedId(prevSelected);
    }
  };

  const handleExportPng = async () => {
    if (!hasImage) return;
    try {
      const blob = await exportCleanBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `trade-chart-${Date.now()}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setSaveError(t("image_editor.png_error"));
    }
  };

  const handleSave = async () => {
    if (!onSaveAnnotated || !hasImage) return;
    setSaveError(null);
    setSaveSuccess(null);
    setIsSaving(true);
    try {
      const blob = await exportCleanBlob();
      const json = serializeAnnotationDocument(items);
      await onSaveAnnotated(blob, json);
      setIsDirty(false);
      setSaveSuccess(t("image_editor.save_success"));
    } catch {
      setSaveError(t("image_editor.save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!onSaveAsNew || !hasImage) return;
    setSaveError(null);
    setSaveSuccess(null);
    setIsSaving(true);
    try {
      const blob = await exportCleanBlob();
      await onSaveAsNew(blob);
      setSaveSuccess(t("image_editor.save_success"));
    } catch {
      setSaveError(t("image_editor.save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  // Scale stroke width relative to natural image width so 4K & 1080p screenshots look consistent
  const pxScale = Math.max(1, imgSize.width / 1200);

  const renderAnnotation = (item: AnnotationItem, isDraft = false) => {
    const isDraggable = activeTool === "select" && !isDraft;
    const strokePx = item.strokeWidth * pxScale;
    const dash = item.lineStyle === "dashed" ? [8 * pxScale, 6 * pxScale] : undefined;
    const opacity = isDraft ? 0.78 : 1;

    const commonSelect = {
      onClick: () => {
        if (activeTool === "select" && !isDraft) {
          setSelectedId(item.id);
        }
      },
      onTap: () => {
        if (activeTool === "select" && !isDraft) {
          setSelectedId(item.id);
        }
      },
    };

    switch (item.tool) {
      case "trendline": {
        const pts = [
          item.x1 * imgSize.width,
          item.y1 * imgSize.height,
          item.x2 * imgSize.width,
          item.y2 * imgSize.height,
        ];
        return (
          <Line
            key={item.id}
            ref={(node) => {
              shapeRefs.current[item.id] = node;
            }}
            points={pts}
            stroke={item.color}
            strokeWidth={strokePx}
            dash={dash}
            lineCap="round"
            hitStrokeWidth={18 * pxScale}
            opacity={opacity}
            draggable={isDraggable}
            {...commonSelect}
            onDragEnd={(e) => {
              const dx = e.target.x() / imgSize.width;
              const dy = e.target.y() / imgSize.height;
              e.target.position({ x: 0, y: 0 });
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "trendline"
                    ? { ...it, x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy }
                    : it
                )
              );
            }}
          />
        );
      }

      case "arrow": {
        const pts = [
          item.x1 * imgSize.width,
          item.y1 * imgSize.height,
          item.x2 * imgSize.width,
          item.y2 * imgSize.height,
        ];
        return (
          <Arrow
            key={item.id}
            ref={(node) => {
              shapeRefs.current[item.id] = node;
            }}
            points={pts}
            stroke={item.color}
            fill={item.color}
            strokeWidth={strokePx}
            dash={dash}
            pointerLength={12 * pxScale}
            pointerWidth={10 * pxScale}
            hitStrokeWidth={18 * pxScale}
            opacity={opacity}
            draggable={isDraggable}
            {...commonSelect}
            onDragEnd={(e) => {
              const dx = e.target.x() / imgSize.width;
              const dy = e.target.y() / imgSize.height;
              e.target.position({ x: 0, y: 0 });
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "arrow"
                    ? { ...it, x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy }
                    : it
                )
              );
            }}
          />
        );
      }

      case "hline": {
        const yPx = item.y * imgSize.height;
        return (
          <Group
            key={item.id}
            ref={(node) => {
              shapeRefs.current[item.id] = node;
            }}
            y={yPx}
            draggable={isDraggable}
            dragBoundFunc={(pos) => ({ x: pan.x, y: pos.y })}
            {...commonSelect}
            onDblClick={(e) => {
              if (isDraft) return;
              const stage = stageRef.current;
              const pointer = stage?.getPointerPosition();
              setInlineEdit({
                mode: "edit-hline",
                targetId: item.id,
                normX: 0.85,
                normY: item.y,
                screenX: pointer?.x ?? e.evt.offsetX,
                screenY: pointer?.y ?? e.evt.offsetY,
                value: item.label || "",
              });
            }}
            onDragEnd={(e) => {
              const newY = Math.max(0, Math.min(1, e.target.y() / imgSize.height));
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "hline" ? { ...it, y: newY } : it
                )
              );
            }}
          >
            <Line
              points={[0, 0, imgSize.width, 0]}
              stroke={item.color}
              strokeWidth={strokePx}
              dash={dash ?? [6 * pxScale, 4 * pxScale]}
              hitStrokeWidth={18 * pxScale}
            />
            {item.label ? (
              <Label x={imgSize.width - 12 * pxScale} y={-11 * pxScale}>
                <Tag
                  fill={item.color}
                  cornerRadius={4 * pxScale}
                  pointerDirection="right"
                  pointerWidth={0}
                  pointerHeight={0}
                />
                <KonvaText
                  text={item.label}
                  fontSize={12 * pxScale}
                  fontFamily="'Space Grotesk', sans-serif"
                  fontStyle="bold"
                  fill="#090d12"
                  padding={4 * pxScale}
                  align="right"
                  offsetX={item.label.length * 6.5 * pxScale}
                />
              </Label>
            ) : null}
          </Group>
        );
      }

      case "rect": {
        const bx = (item.width < 0 ? item.x + item.width : item.x) * imgSize.width;
        const by = (item.height < 0 ? item.y + item.height : item.y) * imgSize.height;
        const bw = Math.abs(item.width) * imgSize.width;
        const bh = Math.abs(item.height) * imgSize.height;
        return (
          <Rect
            key={item.id}
            ref={(node) => {
              shapeRefs.current[item.id] = node;
            }}
            x={bx}
            y={by}
            width={bw}
            height={bh}
            stroke={item.color}
            strokeWidth={strokePx}
            dash={dash}
            fill={item.color}
            fillEnabled={item.fillOpacity > 0}
            opacity={opacity}
            fillAfterStrokeEnabled={false}
            // Apply fillOpacity cleanly via rgba or separate opacity on fill
            {...({
              fill: `${item.color}${Math.round(item.fillOpacity * 255)
                .toString(16)
                .padStart(2, "0")}`,
            } as Record<string, unknown>)}
            draggable={isDraggable}
            {...commonSelect}
            onDragEnd={(e) => {
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "rect"
                    ? { ...it, x: e.target.x() / imgSize.width, y: e.target.y() / imgSize.height }
                    : it
                )
              );
            }}
            onTransformEnd={(e) => {
              const node = e.target;
              const sx = node.scaleX();
              const sy = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "rect"
                    ? {
                        ...it,
                        x: node.x() / imgSize.width,
                        y: node.y() / imgSize.height,
                        width: Math.max(0.01, (node.width() * sx) / imgSize.width),
                        height: Math.max(0.01, (node.height() * sy) / imgSize.height),
                      }
                    : it
                )
              );
            }}
          />
        );
      }

      case "ellipse": {
        const bx = (item.width < 0 ? item.x + item.width : item.x) * imgSize.width;
        const by = (item.height < 0 ? item.y + item.height : item.y) * imgSize.height;
        const bw = Math.abs(item.width) * imgSize.width;
        const bh = Math.abs(item.height) * imgSize.height;
        return (
          <Ellipse
            key={item.id}
            ref={(node) => {
              shapeRefs.current[item.id] = node;
            }}
            x={bx + bw / 2}
            y={by + bh / 2}
            radiusX={bw / 2}
            radiusY={bh / 2}
            stroke={item.color}
            strokeWidth={strokePx}
            dash={dash}
            fill={`${item.color}${Math.round(item.fillOpacity * 255)
              .toString(16)
              .padStart(2, "0")}`}
            opacity={opacity}
            draggable={isDraggable}
            {...commonSelect}
            onDragEnd={(e) => {
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "ellipse"
                    ? {
                        ...it,
                        x: (e.target.x() - bw / 2) / imgSize.width,
                        y: (e.target.y() - bh / 2) / imgSize.height,
                      }
                    : it
                )
              );
            }}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Ellipse;
              const sx = node.scaleX();
              const sy = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              const newW = Math.max(10, node.radiusX() * 2 * sx);
              const newH = Math.max(10, node.radiusY() * 2 * sy);
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "ellipse"
                    ? {
                        ...it,
                        x: (node.x() - newW / 2) / imgSize.width,
                        y: (node.y() - newH / 2) / imgSize.height,
                        width: newW / imgSize.width,
                        height: newH / imgSize.height,
                      }
                    : it
                )
              );
            }}
          />
        );
      }

      case "position": {
        const bx = (item.width < 0 ? item.x + item.width : item.x) * imgSize.width;
        const by = (item.height < 0 ? item.y + item.height : item.y) * imgSize.height;
        const bw = Math.abs(item.width) * imgSize.width;
        const bh = Math.abs(item.height) * imgSize.height;
        const splitY = bh * item.entryRatio;
        const isLong = item.direction === "long";
        const topColor = isLong ? "#22c55e" : "#ef4444";
        const bottomColor = isLong ? "#ef4444" : "#22c55e";
        const tpHeight = isLong ? splitY : bh - splitY;
        const slHeight = isLong ? bh - splitY : splitY;
        const rr = slHeight > 1 ? (tpHeight / slHeight).toFixed(2) : "—";

        return (
          <Group
            key={item.id}
            ref={(node) => {
              shapeRefs.current[item.id] = node;
            }}
            x={bx}
            y={by}
            width={bw}
            height={bh}
            opacity={opacity}
            draggable={isDraggable}
            {...commonSelect}
            onDragEnd={(e) => {
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "position"
                    ? { ...it, x: e.target.x() / imgSize.width, y: e.target.y() / imgSize.height }
                    : it
                )
              );
            }}
            onTransformEnd={(e) => {
              const node = e.target;
              const sx = node.scaleX();
              const sy = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "position"
                    ? {
                        ...it,
                        x: node.x() / imgSize.width,
                        y: node.y() / imgSize.height,
                        width: Math.max(0.02, (bw * sx) / imgSize.width),
                        height: Math.max(0.02, (bh * sy) / imgSize.height),
                      }
                    : it
                )
              );
            }}
          >
            <Rect
              x={0}
              y={0}
              width={bw}
              height={splitY}
              fill={`${topColor}38`}
              stroke={topColor}
              strokeWidth={1.5 * pxScale}
            />
            <Rect
              x={0}
              y={splitY}
              width={bw}
              height={Math.max(0, bh - splitY)}
              fill={`${bottomColor}38`}
              stroke={bottomColor}
              strokeWidth={1.5 * pxScale}
            />
            <Line
              points={[0, splitY, bw, splitY]}
              stroke="#f8fafc"
              strokeWidth={2 * pxScale}
            />
            {bw > 60 * pxScale ? (
              <Label x={6 * pxScale} y={splitY - 12 * pxScale}>
                <Tag fill="#0f172a" cornerRadius={3 * pxScale} opacity={0.9} />
                <KonvaText
                  text={`${isLong ? "LONG" : "SHORT"}  R:R ${rr}`}
                  fontSize={11 * pxScale}
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                  fontStyle="bold"
                  fill="#f8fafc"
                  padding={4 * pxScale}
                />
              </Label>
            ) : null}
          </Group>
        );
      }

      case "freehand": {
        const scaledPts = item.points.map((v, idx) =>
          idx % 2 === 0 ? v * imgSize.width : v * imgSize.height
        );
        return (
          <Line
            key={item.id}
            ref={(node) => {
              shapeRefs.current[item.id] = node;
            }}
            points={scaledPts}
            stroke={item.color}
            strokeWidth={Math.max(3, item.strokeWidth * 2) * pxScale}
            opacity={isDraft ? 0.45 : 0.55}
            tension={0.45}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={18 * pxScale}
            draggable={isDraggable}
            {...commonSelect}
            onDragEnd={(e) => {
              const dx = e.target.x() / imgSize.width;
              const dy = e.target.y() / imgSize.height;
              e.target.position({ x: 0, y: 0 });
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "freehand"
                    ? {
                        ...it,
                        points: it.points.map((v, idx) => (idx % 2 === 0 ? v + dx : v + dy)),
                      }
                    : it
                )
              );
            }}
          />
        );
      }

      case "text": {
        const tx = item.x * imgSize.width;
        const ty = item.y * imgSize.height;
        const fSize = item.fontSize * pxScale;
        return (
          <Label
            key={item.id}
            ref={(node) => {
              shapeRefs.current[item.id] = node;
            }}
            x={tx}
            y={ty}
            draggable={isDraggable}
            {...commonSelect}
            onDblClick={(e) => {
              if (isDraft) return;
              const stage = stageRef.current;
              const pointer = stage?.getPointerPosition();
              setInlineEdit({
                mode: "edit-text",
                targetId: item.id,
                normX: item.x,
                normY: item.y,
                screenX: pointer?.x ?? e.evt.offsetX,
                screenY: pointer?.y ?? e.evt.offsetY,
                value: item.text,
              });
            }}
            onDragEnd={(e) => {
              commitItems(
                items.map((it) =>
                  it.id === item.id && it.tool === "text"
                    ? { ...it, x: e.target.x() / imgSize.width, y: e.target.y() / imgSize.height }
                    : it
                )
              );
            }}
          >
            {item.hasBackground ? (
              <Tag
                fill="#090d12"
                stroke={item.color}
                strokeWidth={1.2 * pxScale}
                cornerRadius={5 * pxScale}
                opacity={0.88}
              />
            ) : null}
            <KonvaText
              text={item.text}
              fontSize={fSize}
              fontFamily="'Space Grotesk', sans-serif"
              fontStyle="600"
              fill={item.color}
              padding={item.hasBackground ? 7 * pxScale : 2 * pxScale}
            />
          </Label>
        );
      }
    }
  };

  const handleInlineKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitInlineText();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInlineEdit(null);
    }
  };

  const activeColor = selectedItem ? selectedItem.color : color;
  const activeStrokeWidth = selectedItem ? selectedItem.strokeWidth : strokeWidth;
  const activeLineStyle = selectedItem ? selectedItem.lineStyle : lineStyle;
  const activeFillOpacity = selectedItem ? selectedItem.fillOpacity : fillOpacity;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-700/80 dark:border-slate-300 bg-[#090d12] dark:bg-slate-50 shadow-2xl">
      {/* Top Studio Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 dark:border-slate-200 bg-[#0d131d] dark:bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {showFileLoader ? (
            <label className="cursor-pointer rounded-md border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-200 dark:text-slate-800 hover:border-teal-400">
              {t("image_editor.load_file")}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onLoadLocalFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title={`${t("image_editor.undo")} (⌘Z)`}
            className="rounded-md border border-slate-700/80 dark:border-slate-300 bg-slate-900/80 dark:bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-200 dark:text-slate-800 disabled:opacity-35 hover:border-slate-500"
          >
            ↶ {t("image_editor.undo")}
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title={`${t("image_editor.redo")} (⌘⇧Z)`}
            className="rounded-md border border-slate-700/80 dark:border-slate-300 bg-slate-900/80 dark:bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-200 dark:text-slate-800 disabled:opacity-35 hover:border-slate-500"
          >
            ↷ {t("image_editor.redo")}
          </button>
          <button
            type="button"
            onClick={() => {
              commitItems([]);
              setSelectedId(null);
            }}
            disabled={items.length === 0}
            className="rounded-md border border-slate-700/80 dark:border-slate-300 bg-slate-900/80 dark:bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-300 dark:text-slate-700 disabled:opacity-35 hover:border-red-500/60 hover:text-red-300 dark:hover:text-red-600"
          >
            {t("image_editor.clear")}
          </button>

          {isLegacyFlattened && onResetToOriginal ? (
            <button
              type="button"
              onClick={onResetToOriginal}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 dark:text-amber-700 hover:bg-amber-500/20"
            >
              {t("image_editor.reset_to_original")}
            </button>
          ) : null}
        </div>

        {/* Zoom + Export + Save */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-md border border-slate-700/80 dark:border-slate-300 bg-slate-900/90 dark:bg-slate-100 text-xs">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.15, z / 1.2))}
              disabled={!hasImage}
              className="px-2 py-1 text-slate-300 dark:text-slate-700 hover:text-white dark:hover:text-slate-950 disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[46px] text-center font-mono text-[11px] text-slate-300 dark:text-slate-800">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
              disabled={!hasImage}
              className="px-2 py-1 text-slate-300 dark:text-slate-700 hover:text-white dark:hover:text-slate-950 disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => fitToViewport(imgSize.width, imgSize.height, viewport.width, viewport.height)}
              disabled={!hasImage}
              className="border-l border-slate-700/80 dark:border-slate-300 px-2 py-1 text-[11px] font-medium text-teal-300 dark:text-teal-700 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-40"
            >
              {t("image_editor.fit")}
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPng}
            disabled={!hasImage}
            className="rounded-md border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-semibold text-teal-300 dark:text-teal-700 hover:bg-teal-500/25 disabled:opacity-40"
          >
            {t("image_editor.export_png")}
          </button>

          {onSaveAsNew ? (
            <button
              type="button"
              onClick={handleSaveAsNew}
              disabled={isSaving || !hasImage}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 dark:text-emerald-700 hover:bg-emerald-500/25 disabled:opacity-45"
            >
              {t("image_editor.save_as_new")}
            </button>
          ) : null}

          {onSaveAnnotated ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasImage}
              className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-emerald-400 disabled:opacity-45"
            >
              {isDirty ? <span className="h-1.5 w-1.5 rounded-full bg-slate-950" /> : null}
              {isSaving ? t("image_editor.saving") : t("image_editor.save_annotated")}
            </button>
          ) : null}
        </div>
      </div>

      {/* Contextual Properties Strip */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800/80 dark:border-slate-200 bg-[#0b1018] dark:bg-slate-50 px-3 py-1.5 text-xs">
        {/* Color Swatches */}
        <div className="flex items-center gap-1">
          {TRADING_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => {
                setColor(swatch);
                if (selectedItem) updateSelectedItem({ color: swatch });
              }}
              aria-label={swatch}
              className={`h-4 w-4 rounded-full border transition-transform ${
                activeColor.toLowerCase() === swatch.toLowerCase()
                  ? "scale-115 border-white dark:border-slate-900 ring-2 ring-teal-400/60"
                  : "border-slate-600 dark:border-slate-400 hover:scale-110"
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
          <input
            type="color"
            value={activeColor}
            onChange={(e) => {
              setColor(e.target.value);
              if (selectedItem) updateSelectedItem({ color: e.target.value });
            }}
            title={t("image_editor.custom_color")}
            className="ml-1 h-5 w-5 cursor-pointer rounded border border-slate-700 dark:border-slate-300 bg-transparent p-0"
          />
        </div>

        <div className="h-4 w-px bg-slate-800 dark:bg-slate-300" />

        {/* Stroke Width Presets */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-slate-400 dark:text-slate-600">{t("image_editor.stroke")}:</span>
          {STROKE_PRESETS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                setStrokeWidth(w);
                if (selectedItem) updateSelectedItem({ strokeWidth: w });
              }}
              className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                activeStrokeWidth === w
                  ? "bg-teal-500/25 text-teal-300 dark:text-teal-700 border border-teal-500/50"
                  : "text-slate-400 dark:text-slate-600 hover:bg-slate-800 dark:hover:bg-slate-200"
              }`}
            >
              {w}px
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-slate-800 dark:bg-slate-300" />

        {/* Line Style */}
        <button
          type="button"
          onClick={() => {
            const next: LineStyle = activeLineStyle === "solid" ? "dashed" : "solid";
            setLineStyle(next);
            if (selectedItem) updateSelectedItem({ lineStyle: next });
          }}
          className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
            activeLineStyle === "dashed"
              ? "border-teal-500/50 bg-teal-500/20 text-teal-300 dark:text-teal-700"
              : "border-slate-700/80 dark:border-slate-300 text-slate-300 dark:text-slate-700"
          }`}
        >
          {activeLineStyle === "dashed" ? t("image_editor.dashed") : t("image_editor.solid")}
        </button>

        {/* Fill Opacity for Rect / Ellipse */}
        {(activeTool === "rect" ||
          activeTool === "ellipse" ||
          selectedItem?.tool === "rect" ||
          selectedItem?.tool === "ellipse") && (
          <>
            <div className="h-4 w-px bg-slate-800 dark:bg-slate-300" />
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-600">
              <span>{t("image_editor.fill")}</span>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.05}
                value={activeFillOpacity}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setFillOpacity(val);
                  if (selectedItem) updateSelectedItem({ fillOpacity: val });
                }}
                className="w-16 accent-teal-400"
              />
            </label>
          </>
        )}

        {/* Long / Short toggle for Position tool */}
        {(activeTool === "position" || selectedItem?.tool === "position") && (
          <>
            <div className="h-4 w-px bg-slate-800 dark:bg-slate-300" />
            <div className="flex items-center gap-1">
              {(["long", "short"] as const).map((dir) => {
                const currentDir =
                  selectedItem?.tool === "position" ? selectedItem.direction : positionDir;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      setPositionDir(dir);
                      if (selectedItem?.tool === "position") {
                        updateSelectedItem({ direction: dir } as Partial<PositionBoxAnnotation>);
                      }
                    }}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${
                      currentDir === dir
                        ? dir === "long"
                          ? "bg-emerald-500/25 text-emerald-300 dark:text-emerald-700 border border-emerald-500/50"
                          : "bg-red-500/25 text-red-300 dark:text-red-700 border border-red-500/50"
                        : "text-slate-400 dark:text-slate-600 hover:bg-slate-800 dark:hover:bg-slate-200"
                    }`}
                  >
                    {dir}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Font size for Text tool */}
        {(activeTool === "text" || selectedItem?.tool === "text") && (
          <>
            <div className="h-4 w-px bg-slate-800 dark:bg-slate-300" />
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400 dark:text-slate-600">{t("image_editor.font_size")}:</span>
              {[13, 16, 20, 26].map((fs) => {
                const curFs = selectedItem?.tool === "text" ? selectedItem.fontSize : fontSize;
                return (
                  <button
                    key={fs}
                    type="button"
                    onClick={() => {
                      setFontSize(fs);
                      if (selectedItem?.tool === "text") {
                        updateSelectedItem({ fontSize: fs } as Partial<TextAnnotation>);
                      }
                    }}
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                      curFs === fs
                        ? "bg-teal-500/25 text-teal-300 dark:text-teal-700 border border-teal-500/50"
                        : "text-slate-400 dark:text-slate-600 hover:bg-slate-800 dark:hover:bg-slate-200"
                    }`}
                  >
                    {fs}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Selected item quick actions */}
        {selectedItem ? (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={duplicateSelected}
              title="⌘D"
              className="rounded border border-slate-700 dark:border-slate-300 px-2 py-0.5 text-[11px] text-slate-300 dark:text-slate-700 hover:bg-slate-800 dark:hover:bg-slate-200"
            >
              {t("image_editor.duplicate")}
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              title="Del / Backspace"
              className="rounded border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-300 dark:text-red-700 hover:bg-red-500/25"
            >
              {t("image_editor.delete_shape")}
            </button>
          </div>
        ) : (
          <span className="ml-auto hidden text-[11px] text-slate-500 dark:text-slate-500 lg:inline">
            {t("image_editor.hint_shortcuts")}
          </span>
        )}
      </div>

      {/* Status messages */}
      {saveError ? (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 dark:text-red-700">
          {saveError}
        </div>
      ) : null}
      {saveSuccess ? (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 dark:text-emerald-700">
          {saveSuccess}
        </div>
      ) : null}

      {/* Main Studio Workspace: Left Toolbar + Konva Stage */}
      <div className="flex min-h-[540px] flex-1">
        {/* Left TradingView-style Vertical Toolbar */}
        <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-800 dark:border-slate-200 bg-[#0d131d] dark:bg-white py-2">
          {TOOLBAR_TOOLS.map((td) => {
            const isActive = activeTool === td.id;
            return (
              <button
                key={td.id}
                type="button"
                onClick={() => setTool(td.id)}
                title={`${t(`image_editor.tool_${td.id}`)} (${td.shortcut})`}
                className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? "bg-teal-500/20 text-teal-300 dark:text-teal-700 ring-1 ring-teal-500/60"
                    : "text-slate-400 dark:text-slate-600 hover:bg-slate-800/80 dark:hover:bg-slate-100 hover:text-slate-100 dark:hover:text-slate-900"
                }`}
              >
                <ToolIcon tool={td.id} className="h-4 w-4" />
                <span className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[8px] opacity-55">
                  {td.shortcut}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Interactive Canvas Viewport */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden bg-[#06090e] dark:bg-slate-100"
          style={{
            height: "62vh",
            minHeight: "520px",
            backgroundImage:
              "radial-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            cursor:
              activeTool === "pan"
                ? isPanningRef.current
                  ? "grabbing"
                  : "grab"
                : activeTool === "select"
                  ? "default"
                  : "crosshair",
          }}
        >
          {hasImage ? (
            <Stage
              ref={stageRef}
              width={viewport.width}
              height={viewport.height}
              scaleX={zoom}
              scaleY={zoom}
              x={pan.x}
              y={pan.y}
              onWheel={handleWheel}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
            >
              <Layer>
                <KonvaImage
                  name="background-image"
                  image={imageElement}
                  width={imgSize.width}
                  height={imgSize.height}
                />
              </Layer>
              <Layer>
                {items.map((item) => renderAnnotation(item, false))}
                {draft ? renderAnnotation(draft, true) : null}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled={false}
                  borderStroke="#2dd4bf"
                  anchorStroke="#2dd4bf"
                  anchorFill="#090d12"
                  anchorSize={8}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 8 || newBox.height < 8) return oldBox;
                    return newBox;
                  }}
                />
              </Layer>
            </Stage>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-400 dark:text-slate-600">
              <p>{t("image_editor.empty_canvas")}</p>
            </div>
          )}

          {/* Inline Floating Text Input Overlay (replaces window.prompt) */}
          {inlineEdit ? (
            <div
              className="absolute z-20"
              style={{
                left: Math.min(Math.max(12, inlineEdit.screenX), Math.max(12, viewport.width - 260)),
                top: Math.min(Math.max(12, inlineEdit.screenY), Math.max(12, viewport.height - 110)),
              }}
            >
              <div className="rounded-lg border border-teal-400/70 bg-[#0d131d] dark:bg-white p-2 shadow-xl">
                <textarea
                  autoFocus
                  rows={2}
                  value={inlineEdit.value}
                  onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                  onKeyDown={handleInlineKeyDown}
                  placeholder={
                    inlineEdit.mode === "edit-hline"
                      ? t("image_editor.hline_placeholder")
                      : t("image_editor.text_placeholder")
                  }
                  className="w-56 resize-none rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-slate-50 px-2 py-1 text-xs text-slate-100 dark:text-slate-900 focus:border-teal-400 focus:outline-none"
                />
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-slate-600">
                  <span>Enter ↵ • Esc</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setInlineEdit(null)}
                      className="rounded px-1.5 py-0.5 hover:bg-slate-800 dark:hover:bg-slate-200"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={commitInlineText}
                      className="rounded bg-teal-500 px-2 py-0.5 font-semibold text-slate-950"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
