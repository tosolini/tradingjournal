import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { TagInput } from "../components/TagInput";
import { ConfirmModal } from "../components/ConfirmModal";
import { Ticker, api, tickersApi } from "../lib/api";
import DOMPurify from "dompurify";

function sanitizeRichText(value?: string | null): string {
  if (!value) {
    return "";
  }
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "a",
      "h1",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "code",
      "pre",
      "span",
      "div",
      "hr",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  });
}

type NotePayload = {
  note_date: string;
  mood?: string;
  market_condition?: string;
  market_volatility?: string;
  short_summary?: string;
  rich_text?: string;
  symbol?: string;
};

type DailyNote = {
  id: number;
  note_date: string;
  mood?: string | null;
  market_condition?: string | null;
  market_volatility?: string | null;
  short_summary?: string | null;
  rich_text?: string | null;
  symbol?: string | null;
};

type UserPreferencesPayload = {
  preferences?: {
    notes?: {
      filters?: {
        searchQuery?: string;
        activeTags?: string[];
      };
    };
  };
};

type MoodValue = "up" | "down" | "stale";

const MOOD_OPTIONS: Array<{ value: MoodValue }> = [
  { value: "up" },
  { value: "down" },
  { value: "stale" },
];

const VOLATILITY_OPTIONS = [
  { value: "low" },
  { value: "medium" },
  { value: "high" },
];

const MAX_FILTER_TAGS_VISIBLE = 24;

function parseMarketConditionTags(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function MoodGlyph({ mood }: { mood: MoodValue }) {
  if (mood === "up") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 text-emerald-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          d="M2 11 6 7l3 2 5-5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (mood === "down") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 text-rose-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          d="M2 5 6 9l3-2 5 5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 text-slate-400 dark:text-slate-900"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M2 6h12M2 10h12" strokeLinecap="round" />
    </svg>
  );
}

function moodLabel(value?: string | null, fallback = "-"): string {
  if (value === "up") {
    return "Up";
  }
  if (value === "down") {
    return "Down";
  }
  if (value === "stale") {
    return "Stale";
  }
  return fallback;
}

export function NotesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateFilter = searchParams.get("date") || "";
  const selectedNoteIdParam = searchParams.get("noteId");
  const selectedNoteId = selectedNoteIdParam
    ? Number(selectedNoteIdParam)
    : null;
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [marketConditionTags, setMarketConditionTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterTags, setActiveFilterTags] = useState<string[]>([]);
  const [showAllFilterTags, setShowAllFilterTags] = useState(false);
  const [tagManagerSearch, setTagManagerSearch] = useState("");
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [filtersSaveState, setFiltersSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [deletePendingNoteId, setDeletePendingNoteId] = useState<number | null>(
    null,
  );
  const [deletePendingTag, setDeletePendingTag] = useState<string | null>(null);
  const [renamePendingTag, setRenamePendingTag] = useState<{
    old: string;
    next: string;
  } | null>(null);
  const lastSavedFiltersRef = useRef<string>("");
  const noteDateInputRef = useRef<HTMLInputElement | null>(null);

  // Ticker autocomplete for notes
  const [noteSymbolInput, setNoteSymbolInput] = useState("");
  const [noteSelectedTicker, setNoteSelectedTicker] = useState<Ticker | null>(
    null,
  );
  const [noteSymbolSuggestions, setNoteSymbolSuggestions] = useState<Ticker[]>(
    [],
  );
  const [noteShowSuggestions, setNoteShowSuggestions] = useState(false);
  const noteSymbolDebounceRef =
    useRef<ReturnType<typeof setTimeout>>(undefined);
  const noteSymbolContainerRef = useRef<HTMLDivElement>(null);
  const openNoteDatePicker = () => {
    const input = noteDateInputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") pickerInput.showPicker();
  };

  const { control, register, handleSubmit, reset, watch, setValue } =
    useForm<NotePayload>({
      defaultValues: {
        note_date: new Date().toISOString().slice(0, 10),
        mood: "stale",
        market_volatility: "medium",
      },
    });

  const selectedMood = watch("mood") as MoodValue | undefined;

  const { data } = useQuery({
    queryKey: ["notes", dateFilter],
    queryFn: () => {
      if (!dateFilter) {
        return api<DailyNote[]>("/api/notes");
      }
      const params = new URLSearchParams({
        from_date: dateFilter,
        to_date: dateFilter,
      });
      return api<DailyNote[]>(`/api/notes?${params.toString()}`);
    },
  });

  const { data: marketConditionSuggestions = [] } = useQuery({
    queryKey: ["notes", "market-condition-suggestions"],
    queryFn: () => api<string[]>("/api/notes/suggestions/market-condition"),
  });

  const { data: userPreferences, isFetched: userPreferencesFetched } = useQuery(
    {
      queryKey: ["user-preferences"],
      queryFn: () => api<UserPreferencesPayload>("/api/auth/preferences"),
    },
  );

  const createNote = useMutation({
    mutationFn: (payload: NotePayload) =>
      api("/api/notes", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({
        queryKey: ["notes", "market-condition-suggestions"],
      });
      setEditingNoteId(null);
      setMarketConditionTags([]);
      setNoteSymbolInput("");
      setNoteSelectedTicker(null);
      setNoteSymbolSuggestions([]);
      reset({
        note_date: new Date().toISOString().slice(0, 10),
        mood: "stale",
        market_volatility: "medium",
      });
      setIsNoteModalOpen(false);
    },
  });

  const updateNote = useMutation({
    mutationFn: ({
      noteId,
      payload,
    }: {
      noteId: number;
      payload: NotePayload;
    }) =>
      api(`/api/notes/${noteId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({
        queryKey: ["notes", "market-condition-suggestions"],
      });
      setEditingNoteId(null);
      setMarketConditionTags([]);
      setNoteSymbolInput("");
      setNoteSelectedTicker(null);
      setNoteSymbolSuggestions([]);
      reset({
        note_date: new Date().toISOString().slice(0, 10),
        mood: "stale",
        market_volatility: "medium",
      });
      setIsNoteModalOpen(false);
    },
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: number) =>
      api(`/api/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({
        queryKey: ["notes", "market-condition-suggestions"],
      });
      if (editingNoteId) {
        setEditingNoteId(null);
        setMarketConditionTags([]);
        reset({
          note_date: new Date().toISOString().slice(0, 10),
          mood: "stale",
          market_volatility: "medium",
        });
      }
    },
  });

  const savePreferences = useMutation({
    mutationFn: (payload: UserPreferencesPayload) =>
      api<UserPreferencesPayload>("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  });

  const renameTag = useMutation({
    mutationFn: ({ oldTag, newTag }: { oldTag: string; newTag: string }) =>
      api<{ ok: boolean; updated_notes: number }>("/api/notes/tags/rename", {
        method: "POST",
        body: JSON.stringify({ old_tag: oldTag, new_tag: newTag }),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({
        queryKey: ["notes", "market-condition-suggestions"],
      });
      setActiveFilterTags((current) =>
        current.map((tag) =>
          tag.toLowerCase() === variables.oldTag.toLowerCase()
            ? variables.newTag
            : tag,
        ),
      );
    },
  });

  const deleteTag = useMutation({
    mutationFn: (tag: string) =>
      api<{ ok: boolean; updated_notes: number }>("/api/notes/tags/delete", {
        method: "POST",
        body: JSON.stringify({ tag }),
      }),
    onSuccess: (_, deletedTag) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({
        queryKey: ["notes", "market-condition-suggestions"],
      });
      setActiveFilterTags((current) =>
        current.filter((tag) => tag.toLowerCase() !== deletedTag.toLowerCase()),
      );
    },
  });

  // Ticker search handler for note symbol
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        noteSymbolContainerRef.current &&
        !noteSymbolContainerRef.current.contains(e.target as Node)
      ) {
        setNoteShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleNoteSymbolInput = useCallback((value: string) => {
    setNoteSymbolInput(value);
    setNoteSelectedTicker(null);
    clearTimeout(noteSymbolDebounceRef.current);
    if (value.trim().length < 1) {
      setNoteSymbolSuggestions([]);
      setNoteShowSuggestions(false);
      return;
    }
    noteSymbolDebounceRef.current = setTimeout(async () => {
      const results = await tickersApi.search(value, 8);
      setNoteSymbolSuggestions(results);
      setNoteShowSuggestions(results.length > 0);
    }, 300);
  }, []);

  const selectNoteSymbol = useCallback((ticker: Ticker) => {
    setNoteSymbolInput(ticker.symbol);
    setNoteSelectedTicker(ticker);
    setNoteShowSuggestions(false);
  }, []);

  const onSubmit = (values: NotePayload) => {
    const payload: NotePayload = {
      ...values,
      market_condition: marketConditionTags.length
        ? marketConditionTags.join(", ")
        : undefined,
      mood: values.mood || undefined,
      market_volatility: values.market_volatility || undefined,
      short_summary: values.short_summary || undefined,
      rich_text: values.rich_text || undefined,
      symbol: noteSelectedTicker?.symbol || values.symbol || undefined,
    };
    if (editingNoteId) {
      updateNote.mutate({ noteId: editingNoteId, payload });
      return;
    }
    createNote.mutate(payload);
  };

  const onEdit = (note: DailyNote) => {
    setEditingNoteId(note.id);
    setMarketConditionTags(parseMarketConditionTags(note.market_condition));
    setNoteSymbolInput(note.symbol || "");
    setNoteSelectedTicker(
      note.symbol ? ({ symbol: note.symbol } as Ticker) : null,
    );
    reset({
      note_date: note.note_date,
      mood: (note.mood as MoodValue | undefined) || "stale",
      market_volatility: note.market_volatility || "medium",
      short_summary: note.short_summary || "",
      rich_text: note.rich_text || "",
      symbol: note.symbol || undefined,
    });
    setIsNoteModalOpen(true);
  };

  const onOpenCreateModal = () => {
    setEditingNoteId(null);
    setMarketConditionTags([]);
    setNoteSymbolInput("");
    setNoteSelectedTicker(null);
    setNoteSymbolSuggestions([]);
    reset({
      note_date: new Date().toISOString().slice(0, 10),
      mood: "stale",
      market_volatility: "medium",
    });
    setIsNoteModalOpen(true);
  };

  const onCancelModal = () => {
    setEditingNoteId(null);
    setMarketConditionTags([]);
    setNoteSymbolInput("");
    setNoteSelectedTicker(null);
    setNoteSymbolSuggestions([]);
    reset({
      note_date: new Date().toISOString().slice(0, 10),
      mood: "stale",
      market_volatility: "medium",
    });
    setIsNoteModalOpen(false);
  };

  const allAvailableTags = useMemo(() => {
    const source = new Set<string>();
    for (const note of data || []) {
      for (const tag of parseMarketConditionTags(note.market_condition)) {
        source.add(tag);
      }
    }
    return Array.from(source).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredNotes = useMemo(() => {
    return (data || []).filter((note) => {
      const noteTags = parseMarketConditionTags(note.market_condition);
      const hasAllSelectedTags = activeFilterTags.every((filterTag) =>
        noteTags.some((tag) => tag.toLowerCase() === filterTag.toLowerCase()),
      );
      if (!hasAllSelectedTags) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableParts = [
        note.note_date,
        note.short_summary || "",
        note.rich_text || "",
        note.mood || "",
        note.market_volatility || "",
        note.market_condition || "",
      ];
      return searchableParts.join(" ").toLowerCase().includes(normalizedSearch);
    });
  }, [activeFilterTags, data, normalizedSearch]);

  const toggleFilterTag = (tag: string) => {
    setActiveFilterTags((current) =>
      current.some((existing) => existing.toLowerCase() === tag.toLowerCase())
        ? current.filter(
            (existing) => existing.toLowerCase() !== tag.toLowerCase(),
          )
        : [...current, tag],
    );
  };

  const resetFilters = () => {
    setSearchQuery("");
    setActiveFilterTags([]);
  };

  const clearDateFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("date");
    setSearchParams(next, { replace: true });
  };

  const visibleFilterTags = useMemo(() => {
    if (showAllFilterTags) {
      return allAvailableTags;
    }
    return allAvailableTags.slice(0, MAX_FILTER_TAGS_VISIBLE);
  }, [allAvailableTags, showAllFilterTags]);

  const hiddenFilterTagsCount = Math.max(
    allAvailableTags.length - visibleFilterTags.length,
    0,
  );

  const filteredManagedTags = useMemo(() => {
    const query = tagManagerSearch.trim().toLowerCase();
    if (!query) {
      return allAvailableTags;
    }
    return allAvailableTags.filter((tag) => tag.toLowerCase().includes(query));
  }, [allAvailableTags, tagManagerSearch]);

  const onRenameTag = (tag: string) => {
    setRenamePendingTag({ old: tag, next: tag });
  };

  const onDeleteTag = (tag: string) => {
    setDeletePendingTag(tag);
  };

  useEffect(() => {
    if (!userPreferencesFetched || preferencesHydrated) {
      return;
    }
    const savedFilters = userPreferences?.preferences?.notes?.filters;
    if (savedFilters) {
      if (typeof savedFilters.searchQuery === "string") {
        setSearchQuery(savedFilters.searchQuery);
      }
      if (Array.isArray(savedFilters.activeTags)) {
        setActiveFilterTags(
          savedFilters.activeTags.filter(
            (tag): tag is string => typeof tag === "string",
          ),
        );
      }
      lastSavedFiltersRef.current = JSON.stringify({
        searchQuery:
          typeof savedFilters.searchQuery === "string"
            ? savedFilters.searchQuery
            : "",
        activeTags: Array.isArray(savedFilters.activeTags)
          ? savedFilters.activeTags.filter(
              (tag): tag is string => typeof tag === "string",
            )
          : [],
      });
    }
    setPreferencesHydrated(true);
  }, [preferencesHydrated, userPreferences, userPreferencesFetched]);

  useEffect(() => {
    if (!preferencesHydrated) {
      return;
    }

    const nextFiltersSnapshot = JSON.stringify({
      searchQuery,
      activeTags: activeFilterTags,
    });

    if (nextFiltersSnapshot === lastSavedFiltersRef.current) {
      if (filtersSaveState !== "idle") {
        setFiltersSaveState("idle");
      }
      return;
    }

    setFiltersSaveState("saving");
    const timerId = window.setTimeout(() => {
      savePreferences.mutate(
        {
          preferences: {
            notes: {
              filters: {
                searchQuery,
                activeTags: activeFilterTags,
              },
            },
          },
        },
        {
          onSuccess: () => {
            lastSavedFiltersRef.current = nextFiltersSnapshot;
            setFiltersSaveState("saved");
          },
          onError: () => {
            setFiltersSaveState("error");
          },
        },
      );
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [activeFilterTags, filtersSaveState, preferencesHydrated, searchQuery]);

  useEffect(() => {
    if (filtersSaveState !== "saved") {
      return;
    }
    const timerId = window.setTimeout(() => setFiltersSaveState("idle"), 1200);
    return () => window.clearTimeout(timerId);
  }, [filtersSaveState]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") {
      return;
    }
    setEditingNoteId(null);
    setMarketConditionTags([]);
    reset({
      note_date: new Date().toISOString().slice(0, 10),
      mood: "stale",
      market_volatility: "medium",
    });
    setIsNoteModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [reset, searchParams, setSearchParams]);

  return (
    <>
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("notes.title")}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-900"
            >
              {t("notes.new_note")}
            </button>
            <span
              className={`text-xs ${
                filtersSaveState === "error"
                  ? "text-rose-300"
                  : filtersSaveState === "saved"
                    ? "text-teal-300 dark:text-teal-900"
                    : "text-slate-400 dark:text-slate-900"
              }`}
            >
              {filtersSaveState === "saving" && t("notes.filters_saving")}
              {filtersSaveState === "saved" && t("notes.filters_saved")}
              {filtersSaveState === "error" && t("notes.filters_error")}
              {filtersSaveState === "idle" && t("notes.filters_synced")}
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 dark:text-slate-900 hover:border-teal-500/50 hover:text-teal-200 dark:text-teal-900"
            >
              {t("notes.reset_filters")}
            </button>
          </div>
        </div>
        {dateFilter ? (
          <div className="mb-3 flex items-center justify-between rounded border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-200 dark:text-teal-900">
            <span>{t("notes.active_date_filter", { date: dateFilter })}</span>
            <button
              type="button"
              onClick={clearDateFilter}
              className="rounded border border-teal-500/40 px-2 py-1 text-xs text-teal-100 dark:text-teal-900 hover:bg-teal-500/20"
            >
              {t("notes.remove_date_filter")}
            </button>
          </div>
        ) : null}
        <div className="mb-3 space-y-2">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("notes.search_placeholder")}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
          />
          <div className="flex flex-wrap gap-2">
            {visibleFilterTags.map((tag) => {
              const isActive = activeFilterTags.some(
                (activeTag) => activeTag.toLowerCase() === tag.toLowerCase(),
              );
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleFilterTag(tag)}
                  className={`rounded-full border px-2 py-1 text-xs ${
                    isActive
                      ? "border-teal-400 bg-teal-500/20 text-teal-200 dark:text-teal-900"
                      : "border-slate-600 bg-slate-900 dark:bg-white text-slate-300 dark:text-slate-900 hover:border-teal-500/50 hover:text-teal-200 dark:text-teal-900"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
            {allAvailableTags.length === 0 ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t("notes.no_tags_available")}
              </span>
            ) : null}
            {hiddenFilterTagsCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllFilterTags(true)}
                className="rounded-full border border-slate-600 bg-slate-900 dark:bg-white px-2 py-1 text-xs text-slate-300 dark:text-slate-900 hover:border-teal-500/50 hover:text-teal-200 dark:text-teal-900"
              >
                +{hiddenFilterTagsCount} altri
              </button>
            ) : null}
            {showAllFilterTags &&
            allAvailableTags.length > MAX_FILTER_TAGS_VISIBLE ? (
              <button
                type="button"
                onClick={() => setShowAllFilterTags(false)}
                className="rounded-full border border-slate-600 bg-slate-900 dark:bg-white px-2 py-1 text-xs text-slate-300 dark:text-slate-900 hover:border-teal-500/50 hover:text-teal-200 dark:text-teal-900"
              >
                {t("notes.show_less")}
              </button>
            ) : null}
          </div>
        </div>
        <details className="mb-3 rounded border border-slate-700/70 dark:border-slate-200 bg-slate-900/40 dark:bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-200 dark:text-slate-900">
            {t("notes.tag_management")}
          </summary>
          <div className="mt-3 space-y-2">
            <input
              value={tagManagerSearch}
              onChange={(event) => setTagManagerSearch(event.target.value)}
              placeholder={t("notes.tag_management_search")}
              className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
            />
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {filteredManagedTags.map((tag) => (
                <div
                  key={`manage-${tag}`}
                  className="flex items-center justify-between gap-2 rounded border border-slate-700 dark:border-slate-300 px-2 py-1"
                >
                  <span className="truncate text-sm text-slate-200 dark:text-slate-900">
                    {tag}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onRenameTag(tag)}
                      className="rounded bg-sky-500 p-2 text-slate-950"
                      title={t("notes.rename")}
                      aria-label={t("notes.rename")}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTag(tag)}
                      className="rounded bg-red-500 p-2 text-white"
                      title={t("notes.delete")}
                      aria-label={t("notes.delete")}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" x2="10" y1="11" y2="17" />
                        <line x1="14" x2="14" y1="11" y2="17" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {filteredManagedTags.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t("notes.no_tag_found")}
                </div>
              ) : null}
            </div>
          </div>
        </details>
        <div className="space-y-3">
          {filteredNotes.map((note) => (
            <article
              key={note.id}
              className={`rounded border p-3 ${
                selectedNoteId === note.id
                  ? "border-teal-400 bg-teal-500/10"
                  : "border-slate-700 dark:border-slate-300 bg-slate-900/40 dark:bg-white"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
                  <span className="text-sm font-semibold text-slate-100 dark:text-slate-900">
                    {note.note_date}
                  </span>
                  {note.symbol ? (
                    <span className="font-mono text-xs font-semibold text-teal-300 dark:text-teal-700 bg-teal-500/10 rounded px-1.5 py-0.5">
                      {note.symbol}
                    </span>
                  ) : null}
                  {note.short_summary ? (
                    <span className="truncate text-sm text-slate-400 dark:text-slate-600">
                      {note.short_summary}
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEdit(note)}
                    className="rounded bg-sky-500 p-2 text-slate-950"
                    title={t("notes.edit")}
                    aria-label={t("notes.edit")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletePendingNoteId(note.id)}
                    className="rounded bg-red-500 p-2 text-white"
                    title={t("notes.delete")}
                    aria-label={t("notes.delete")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" x2="10" y1="11" y2="17" />
                      <line x1="14" x2="14" y1="11" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid gap-2 text-sm md:grid-cols-2">
                <div className="rounded border border-slate-700/70 dark:border-slate-200 bg-slate-900/60 dark:bg-slate-50 px-2 py-1">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("notes.mood")}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-slate-200 dark:text-slate-900">
                    {note.mood === "up" ||
                    note.mood === "down" ||
                    note.mood === "stale" ? (
                      <MoodGlyph mood={note.mood} />
                    ) : null}
                    <span>
                      {t(`notes.mood_${(note.mood || "").toLowerCase()}`, {
                        defaultValue: moodLabel(note.mood),
                      })}
                    </span>
                  </div>
                </div>
                <div className="rounded border border-slate-700/70 dark:border-slate-200 bg-slate-900/60 dark:bg-slate-50 px-2 py-1">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("notes.volatility")}
                  </div>
                  <div className="mt-1 text-slate-200 dark:text-slate-900">
                    {note.market_volatility || "-"}
                  </div>
                </div>
                <div className="rounded border border-slate-700/70 dark:border-slate-200 bg-slate-900/60 dark:bg-slate-50 px-2 py-1 md:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("notes.market_condition_tags")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {parseMarketConditionTags(note.market_condition).length >
                    0 ? (
                      parseMarketConditionTags(note.market_condition).map(
                        (tag) => (
                          <button
                            key={`${note.id}-${tag}`}
                            type="button"
                            onClick={() => toggleFilterTag(tag)}
                            className="rounded-full border border-teal-500/40 bg-teal-500/15 px-2 py-0.5 text-xs text-teal-200 dark:text-teal-900"
                          >
                            {tag}
                          </button>
                        ),
                      )
                    ) : (
                      <span className="text-slate-400 dark:text-slate-900">
                        -
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded border border-slate-700/70 dark:border-slate-200 bg-slate-900/60 dark:bg-slate-50 px-2 py-1 md:col-span-2 max-w-full overflow-hidden">
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("notes.notes")}
                  </div>
                  {note.rich_text ? (
                    <div
                      className="notes-rich-content mt-1 whitespace-pre-wrap text-slate-300 dark:text-slate-900"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeRichText(note.rich_text),
                      }}
                    />
                  ) : (
                    <div className="mt-1 text-slate-300 dark:text-slate-900">
                      {t("notes.no_details")}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
          {data && data.length === 0 ? (
            <div className="text-sm text-slate-400 dark:text-slate-900">
              {t("notes.no_notes_yet")}
            </div>
          ) : null}
          {data && data.length > 0 && filteredNotes.length === 0 ? (
            <div className="text-sm text-slate-400 dark:text-slate-900">
              {t("notes.no_notes_match")}
            </div>
          ) : null}
        </div>
      </section>

      {isNoteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-100 dark:text-slate-900">
                {editingNoteId ? t("notes.edit_note") : t("notes.new_note")}
              </h2>
              <button
                type="button"
                onClick={onCancelModal}
                className="rounded bg-slate-700 dark:bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-200 dark:text-slate-900"
              >
                {t("common.close")}
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
              <input type="hidden" {...register("mood")} />
              <div className="relative">
                <input
                  type="date"
                  {...register("note_date")}
                  ref={(el) => {
                    register("note_date").ref(el);
                    noteDateInputRef.current = el;
                  }}
                  className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2 pr-11"
                />
                <button
                  type="button"
                  onClick={openNoteDatePicker}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-slate-800 dark:bg-slate-100 px-2 py-1 text-xs text-slate-200 dark:text-slate-900 hover:bg-slate-700"
                  title="Apri selettore data"
                  aria-label="Apri selettore data"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              </div>
              <div className="text-sm" ref={noteSymbolContainerRef}>
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400 dark:text-slate-900">
                  {t("notes.symbol")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={noteSymbolInput}
                    onChange={(e) => handleNoteSymbolInput(e.target.value)}
                    onFocus={() =>
                      noteSymbolSuggestions.length > 0 &&
                      setNoteShowSuggestions(true)
                    }
                    className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2 uppercase"
                    placeholder={t("notes.symbol_placeholder")}
                    autoComplete="off"
                  />
                  {noteShowSuggestions && (
                    <ul className="absolute left-0 top-full z-50 mt-1 w-full max-h-48 overflow-y-auto rounded border border-slate-600 dark:border-slate-300 bg-slate-900 dark:bg-white shadow-xl">
                      {noteSymbolSuggestions.map((tk) => (
                        <li
                          key={tk.id}
                          onMouseDown={() => selectNoteSymbol(tk)}
                          className="flex cursor-pointer items-baseline gap-2 px-3 py-2 hover:bg-slate-700/60 dark:hover:bg-slate-100"
                        >
                          <span className="font-mono font-semibold text-teal-400 dark:text-teal-700 text-sm shrink-0">
                            {tk.symbol}
                          </span>
                          <span className="truncate text-xs text-slate-300 dark:text-slate-600">
                            {tk.name}
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
                            {tk.market}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {noteSelectedTicker && (
                  <p className="mt-1 text-xs text-teal-300 dark:text-teal-700">
                    {noteSelectedTicker.name} — {noteSelectedTicker.market}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-xs uppercase tracking-wide text-slate-400 dark:text-slate-900">
                  {t("notes.mood")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {MOOD_OPTIONS.map((option) => {
                    const isSelected = selectedMood === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setValue("mood", option.value, { shouldDirty: true })
                        }
                        className={`flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm ${
                          isSelected
                            ? "border-teal-400 bg-teal-500/15 text-teal-200 dark:text-teal-900"
                            : "border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white text-slate-300 dark:text-slate-900 hover:border-slate-500"
                        }`}
                      >
                        <MoodGlyph mood={option.value} />
                        {t(`notes.mood_${option.value}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <TagInput
                label={t("notes.market_condition")}
                placeholder={t("notes.tag_input_placeholder")}
                value={marketConditionTags}
                suggestions={marketConditionSuggestions}
                onChange={setMarketConditionTags}
              />
              <select
                {...register("market_volatility")}
                className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
              >
                {VOLATILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t("notes.volatility")}:{" "}
                    {t(`notes.volatility_${option.value}`)}
                  </option>
                ))}
              </select>
              <input
                {...register("short_summary")}
                placeholder={t("notes.short_summary")}
                className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
              />
              <Controller
                control={control}
                name="rich_text"
                render={({ field }) => (
                  <textarea
                    value={field.value || ""}
                    onChange={(event) => field.onChange(event.target.value)}
                    rows={8}
                    placeholder={t("notes.rich_editor_placeholder")}
                    className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2 text-slate-100 dark:text-slate-900"
                  />
                )}
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onCancelModal}
                  className="rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-700 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-800 dark:hover:bg-slate-200"
                >
                  {t("common.cancel")}
                </button>
                <button className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-900">
                  {editingNoteId
                    ? t("notes.update_note")
                    : t("notes.save_note")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {deletePendingNoteId !== null && (
        <ConfirmModal
          message={t("notes.delete_note_confirm")}
          onConfirm={() => {
            deleteNote.mutate(deletePendingNoteId);
            setDeletePendingNoteId(null);
          }}
          onCancel={() => setDeletePendingNoteId(null)}
          isPending={deleteNote.isPending}
        />
      )}
      {deletePendingTag !== null && (
        <ConfirmModal
          message={t("notes.delete_tag_confirm", { tag: deletePendingTag })}
          onConfirm={() => {
            deleteTag.mutate(deletePendingTag);
            setDeletePendingTag(null);
          }}
          onCancel={() => setDeletePendingTag(null)}
          isPending={deleteTag.isPending}
        />
      )}
      {renamePendingTag !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
            <p className="mb-3 text-sm font-semibold text-slate-300 dark:text-slate-900">
              {t("notes.rename_tag_prompt")}
            </p>
            <input
              type="text"
              value={renamePendingTag.next}
              onChange={(e) =>
                setRenamePendingTag({
                  ...renamePendingTag,
                  next: e.target.value,
                })
              }
              className="mb-4 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm text-slate-100"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const trimmed = renamePendingTag.next.trim();
                  if (
                    trimmed &&
                    trimmed.toLowerCase() !== renamePendingTag.old.toLowerCase()
                  ) {
                    renameTag.mutate({
                      oldTag: renamePendingTag.old,
                      newTag: trimmed,
                    });
                  }
                  setRenamePendingTag(null);
                } else if (e.key === "Escape") {
                  setRenamePendingTag(null);
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRenamePendingTag(null)}
                className="rounded bg-slate-700 dark:bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-200 dark:text-slate-900"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const trimmed = renamePendingTag.next.trim();
                  if (
                    trimmed &&
                    trimmed.toLowerCase() !== renamePendingTag.old.toLowerCase()
                  ) {
                    renameTag.mutate({
                      oldTag: renamePendingTag.old,
                      newTag: trimmed,
                    });
                  }
                  setRenamePendingTag(null);
                }}
                disabled={renameTag.isPending}
                className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                {t("notes.rename_tag_confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
