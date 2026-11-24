import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ImageAnnotationEditor } from "../components/ImageAnnotationEditor";
import { parseAnnotationDocument } from "../components/annotation/types";
import {
  API_BASE,
  TradeDetail,
  api,
  deleteTradeImage,
  fetchTradeImageBlobUrl,
} from "../lib/api";

export function TradeImagesPage() {
  const { t } = useTranslation();
  const params = useParams<{ tradeId: string }>();
  const tradeId = Number(params.tradeId || 0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [forceOriginal, setForceOriginal] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["trade-detail", tradeId],
    queryFn: () => api<TradeDetail>(`/api/trades/${tradeId}`),
    enabled: tradeId > 0,
  });

  const uploadFile = useCallback(async (fileToUpload: File) => {
    const token = localStorage.getItem("token");
    const form = new FormData();
    form.append("file", fileToUpload);
    const response = await fetch(`${API_BASE}/api/uploads/trade/${tradeId}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json() as Promise<{ id: number }>;
  }, [tradeId]);

  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["trade-detail", tradeId] });
      if (created?.id) {
        setSelectedImageId(created.id);
        setForceOriginal(false);
      }
      setError(null);
      setMessage(t("trade_images.success_uploaded"));
    },
    onError: () => {
      setMessage(null);
      setError(t("trade_images.errors.upload_failed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (imageId: number) => deleteTradeImage(imageId),
    onSuccess: async (_, deletedId) => {
      await qc.invalidateQueries({ queryKey: ["trade-detail", tradeId] });
      await qc.invalidateQueries({ queryKey: ["trades"] });
      if (selectedImageId === deletedId) {
        setSelectedImageId(null);
        setSelectedImageUrl(null);
      }
      setError(null);
      setMessage(t("trade_images.success_deleted"));
    },
    onError: () => {
      setMessage(null);
      setError(t("trade_images.errors.delete_failed"));
    },
  });

  // Global clipboard paste (Cmd+V / Ctrl+V) for screenshots
  useEffect(() => {
    if (!tradeId) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            e.preventDefault();
            uploadMutation.mutate(pastedFile);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [tradeId, uploadMutation]);

  // Load thumbnails
  useEffect(() => {
    const previousUrls = Object.values(thumbnailUrls);
    let cancelled = false;

    const loadThumbnails = async () => {
      if (!data?.images?.length) {
        setThumbnailUrls({});
        return;
      }

      const entries = await Promise.all(
        data.images.map(async (image) => {
          const variant = image.annotated_path ? "annotated" : "original";
          try {
            const url = await fetchTradeImageBlobUrl(image.id, variant);
            return [image.id, url] as const;
          } catch {
            return [image.id, ""] as const;
          }
        })
      );

      if (cancelled) {
        for (const [, url] of entries) {
          if (url) URL.revokeObjectURL(url);
        }
        return;
      }

      const next: Record<number, string> = {};
      for (const [id, url] of entries) {
        if (url) next[id] = url;
      }
      setThumbnailUrls(next);

      for (const url of previousUrls) {
        URL.revokeObjectURL(url);
      }
    };

    loadThumbnails();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.images]);

  // Auto-select first image if current selection is null or deleted
  useEffect(() => {
    if (!data?.images?.length) {
      setSelectedImageId(null);
      setSelectedImageUrl(null);
      return;
    }
    const exists = data.images.some((img) => img.id === selectedImageId);
    if (selectedImageId === null || !exists) {
      setSelectedImageId(data.images[0].id);
      setForceOriginal(false);
    }
  }, [data?.images, selectedImageId]);

  const selectedImage = useMemo(
    () => data?.images.find((image) => image.id === selectedImageId) ?? null,
    [data?.images, selectedImageId]
  );

  const parsedAnnotations = useMemo(
    () => (forceOriginal ? [] : parseAnnotationDocument(selectedImage?.annotations_json)),
    [selectedImage?.annotations_json, forceOriginal]
  );

  const isLegacyFlattened = Boolean(
    selectedImage?.annotated_path && !selectedImage?.annotations_json && !forceOriginal
  );

  // Load selected image into the canvas:
  // If we have vector annotations_json (or no annotated_path), load ORIGINAL as crisp base layer.
  // Only load flattened annotated_path if it's a legacy image without annotations_json.
  useEffect(() => {
    let revoked = false;
    let currentUrl: string | null = null;

    const load = async () => {
      if (!selectedImage) {
        setSelectedImageUrl(null);
        return;
      }
      try {
        const variant =
          !forceOriginal && selectedImage.annotated_path && !selectedImage.annotations_json
            ? "annotated"
            : "original";
        const url = await fetchTradeImageBlobUrl(selectedImage.id, variant);
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        currentUrl = url;
        setSelectedImageUrl(url);
      } catch {
        setSelectedImageUrl(null);
      }
    };

    load();

    return () => {
      revoked = true;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [selectedImage, forceOriginal]);

  const saveAnnotated = async (blob: Blob, annotationsJson: string) => {
    if (!selectedImageId) {
      throw new Error(t("trade_images.errors.select_image_before_save"));
    }
    const token = localStorage.getItem("token");
    const form = new FormData();
    form.append(
      "file",
      new File([blob], `annotated-${selectedImageId}.png`, { type: "image/png" })
    );
    form.append("annotations_json", annotationsJson);

    const response = await fetch(
      `${API_BASE}/api/uploads/trade-images/${selectedImageId}/annotated`,
      {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }

    setForceOriginal(false);
    await qc.invalidateQueries({ queryKey: ["trade-detail", tradeId] });
    await qc.invalidateQueries({ queryKey: ["trades"] });
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.type.startsWith("image/")) {
      uploadMutation.mutate(dropped);
    }
  };

  const openZoomModal = async (imageId: number, hasAnnotated: boolean) => {
    if (zoomImageUrl) {
      URL.revokeObjectURL(zoomImageUrl);
    }
    try {
      const variant = hasAnnotated ? "annotated" : "original";
      const url = await fetchTradeImageBlobUrl(imageId, variant);
      setZoomImageUrl(url);
    } catch {
      setZoomImageUrl(null);
    }
  };

  if (!tradeId) {
    return (
      <div className="text-sm text-red-400 dark:text-red-600">
        {t("trade_images.invalid_trade")}
      </div>
    );
  }

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* Compact Studio Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/trades/${tradeId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 dark:border-slate-300 bg-slate-900/80 dark:bg-white px-3 py-1.5 text-xs font-semibold text-slate-200 dark:text-slate-800 hover:border-teal-400"
          >
            ← {t("trade_images.back_to_trade")}
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {t("trade_images.title", { id: tradeId })}
              </h1>
              {data?.trade ? (
                <span className="rounded border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-teal-300 dark:text-teal-700">
                  {data.trade.symbol} • {data.trade.side}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-600">
              {t("trade_images.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) uploadMutation.mutate(picked);
              e.target.value = "";
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-sky-400 disabled:opacity-50"
          >
            {uploadMutation.isPending
              ? t("trade_images.uploading")
              : t("trade_images.upload_or_paste")}
          </button>
        </div>
      </header>

      {/* Feedback banners */}
      {message ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 dark:text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 dark:text-red-700">
          {error}
        </div>
      ) : null}

      {/* Main Studio Area */}
      {selectedImageUrl ? (
        <ImageAnnotationEditor
          initialImageSrc={selectedImageUrl}
          initialAnnotations={parsedAnnotations}
          onSaveAnnotated={saveAnnotated}
          onSaveAsNew={async (blob) => {
            const newFile = new File([blob], `chart-snapshot-${Date.now()}.png`, {
              type: "image/png",
            });
            await uploadMutation.mutateAsync(newFile);
          }}
          showFileLoader={false}
          isLegacyFlattened={isLegacyFlattened}
          onResetToOriginal={() => setForceOriginal(true)}
        />
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`flex min-h-[420px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            isDraggingOver
              ? "border-teal-400 bg-teal-500/10"
              : "border-slate-700/80 dark:border-slate-300 bg-[#0b1018] dark:bg-slate-50 hover:border-teal-500/60"
          }`}
        >
          <div className="rounded-full border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-3 text-teal-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-200 dark:text-slate-800">
            {t("trade_images.dropzone_title")}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-600">
            {t("trade_images.dropzone_hint")}
          </p>
        </div>
      )}

      {/* Bottom Filmstrip Gallery */}
      <section className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600">
            {t("trade_images.registered_title")} ({data?.images?.length ?? 0})
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-500">
            {t("trade_images.paste_hint")}
          </span>
        </div>

        {isLoading ? (
          <div className="py-4 text-xs text-slate-400 dark:text-slate-600">
            {t("trade_images.loading")}
          </div>
        ) : data?.images?.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {data.images.map((image) => {
              const isSelected = selectedImageId === image.id;
              return (
                <div
                  key={image.id}
                  className={`group relative w-44 shrink-0 overflow-hidden rounded-lg border transition-all ${
                    isSelected
                      ? "border-teal-400 ring-2 ring-teal-400/30"
                      : "border-slate-700/80 dark:border-slate-300 hover:border-slate-500"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImageId(image.id);
                      setForceOriginal(false);
                    }}
                    className="block w-full text-left"
                  >
                    <div className="aspect-video bg-slate-950 dark:bg-slate-200">
                      {thumbnailUrls[image.id] ? (
                        <img
                          src={thumbnailUrls[image.id]}
                          alt={`Trade image ${image.id}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
                          {t("trade_images.preview_unavailable")}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between bg-slate-900/90 dark:bg-white px-2 py-1 text-[11px] text-slate-300 dark:text-slate-800">
                      <span className="font-mono">#{image.id}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          image.annotated_path
                            ? "bg-teal-500/15 text-teal-300 dark:text-teal-700"
                            : "bg-slate-800 dark:bg-slate-100 text-slate-400 dark:text-slate-600"
                        }`}
                      >
                        {image.annotated_path
                          ? t("trade_images.annotated")
                          : t("trade_images.original")}
                      </span>
                    </div>
                  </button>

                  {/* Always-visible Zoom & Delete actions */}
                  <div className="absolute right-1.5 top-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openZoomModal(image.id, Boolean(image.annotated_path));
                      }}
                      title={t("trade_images.zoom_preview")}
                      className="rounded bg-slate-950/85 p-1 text-slate-200 shadow hover:bg-slate-800"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(t("trade_images.confirm_delete"))) {
                          deleteMutation.mutate(image.id);
                        }
                      }}
                      title={t("trade_images.delete_image")}
                      className="rounded bg-slate-950/85 p-1 text-red-400 hover:bg-red-950"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-2 text-xs text-slate-400 dark:text-slate-600">
            {t("trade_images.empty")}
          </div>
        )}
      </section>

      {/* Intentional Lightbox Modal */}
      {zoomImageUrl ? (
        <div
          onClick={() => {
            URL.revokeObjectURL(zoomImageUrl);
            setZoomImageUrl(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
        >
          <div className="relative w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(zoomImageUrl);
                setZoomImageUrl(null);
              }}
              className="absolute right-3 top-3 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              {t("common.close")}
            </button>
            <img
              src={zoomImageUrl}
              alt="Zoom trade image"
              className="max-h-[88vh] w-full rounded-lg object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
