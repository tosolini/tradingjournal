import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { TagInput } from "./TagInput";
import { ConfirmModal } from "./ConfirmModal";
import { Ticker, api, tickersApi } from "../lib/api";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "./icons";

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

const DISCIPLINE_PRESET_TAGS = [
  {
    key: "tag_plan_followed",
    fallback: "Piano Rispettato",
    aliases: ["Piano Rispettato", "Plan Followed"],
  },
  {
    key: "tag_stop_loss_respected",
    fallback: "Stop Loss Rispettato",
    aliases: ["Stop Loss Rispettato", "Stop Loss Respected"],
  },
  {
    key: "tag_target_reached",
    fallback: "Target Raggiunto",
    aliases: ["Target Raggiunto", "Target Reached"],
  },
  { key: "tag_fomo", fallback: "FOMO", aliases: ["FOMO"] },
  {
    key: "tag_overtrading",
    fallback: "Overtrading",
    aliases: ["Overtrading"],
  },
  {
    key: "tag_revenge_trading",
    fallback: "Revenge Trading",
    aliases: ["Revenge Trading"],
  },
  {
    key: "tag_early_exit",
    fallback: "Uscita Anticipata",
    aliases: ["Uscita Anticipata", "Early Exit"],
  },
] as const;

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

const MOOD_OPTIONS: Array<{ value: MoodValue; labelKey: string }> = [
  { value: "up", labelKey: "notes.mood_positive" },
  { value: "down", labelKey: "notes.mood_negative" },
  { value: "stale", labelKey: "notes.mood_neutral" },
];

const VOLATILITY_OPTIONS = [
  { value: "low", labelKey: "notes.volatility_low" },
  { value: "medium", labelKey: "notes.volatility_medium" },
  { value: "high", labelKey: "notes.volatility_high" },
];

const MAX_FILTER_TAGS_VISIBLE = 20;

function parseMarketConditionTags(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeMarketConditionTagValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const lowerValue = trimmed.toLowerCase();
  for (const preset of DISCIPLINE_PRESET_TAGS) {
    if (lowerValue === preset.key.toLowerCase()) {
      return preset.key;
    }
    if (preset.aliases.some((alias) => alias.toLowerCase() === lowerValue)) {
      return preset.key;
    }
  }
  return trimmed;
}

function normalizeMarketConditionTags(tags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = normalizeMarketConditionTagValue(tag);
    if (!normalized) {
      continue;
    }
    const fingerprint = normalized.toLowerCase();
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    result.push(normalized);
  }
  return result;
}

export function DailyNotesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateFilter = searchParams.get("date") || "";
  const selectedNoteIdParam = searchParams.get("noteId");
  const selectedNoteId = selectedNoteIdParam ? Number(selectedNoteIdParam) : null;

  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [marketConditionTags, setMarketConditionTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterTags, setActiveFilterTags] = useState<string[]>([]);
  const [showAllFilterTags, setShowAllFilterTags] = useState(false);
  const [tagManagerSearch, setTagManagerSearch] = useState("");
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [filtersSaveState, setFiltersSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deletePendingNoteId, setDeletePendingNoteId] = useState<number | null>(null);
  const [deletePendingTag, setDeletePendingTag] = useState<string | null>(null);
  const [renamePendingTag, setRenamePendingTag] = useState<{ old: string; next: string } | null>(null);
  const lastSavedFiltersRef = useRef<string>("");
  const noteDateInputRef = useRef<HTMLInputElement | null>(null);

  // Ticker autocomplete
  const [noteSymbolInput, setNoteSymbolInput] = useState("");
  const [noteSymbolSuggestions, setNoteSymbolSuggestions] = useState<Ticker[]>([]);
  const [noteShowSuggestions, setNoteShowSuggestions] = useState(false);
  const noteSymbolDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const formatMarketConditionTag = useCallback(
    (tag: string): string => {
      const normalized = normalizeMarketConditionTagValue(tag);
      const preset = DISCIPLINE_PRESET_TAGS.find((candidate) => candidate.key === normalized);
      if (!preset) {
        return tag;
      }
      return t(`notes.${preset.key}`, preset.fallback);
    },
    [t],
  );

  const { control, register, handleSubmit, reset, watch, setValue } = useForm<NotePayload>({
    defaultValues: {
      note_date: new Date().toISOString().slice(0, 10),
      mood: "stale",
      market_volatility: "medium",
    },
  });

  const selectedMood = watch("mood") as MoodValue | undefined;

  const { data: notes = [], isLoading } = useQuery({
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

  const { data: userPreferences, isFetched: userPreferencesFetched } = useQuery({
    queryKey: ["user-preferences"],
    queryFn: () => api<UserPreferencesPayload>("/api/auth/preferences"),
  });

  const savePreferences = useMutation({
    mutationFn: (payload: UserPreferencesPayload) =>
      api("/api/auth/preferences", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-preferences"] });
    },
  });

  const upsert = useMutation({
    mutationFn: (payload: NotePayload) =>
      api<DailyNote>(editingNoteId ? `/api/notes/${editingNoteId}` : "/api/notes", {
        method: editingNoteId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["notes", "market-condition-suggestions"] });
      setIsNoteModalOpen(false);
      setEditingNoteId(null);
      setMarketConditionTags([]);
      setNoteSymbolInput("");
    },
  });

  const remove = useMutation({
    mutationFn: (noteId: number) => api(`/api/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["notes", "market-condition-suggestions"] });
      setDeletePendingNoteId(null);
    },
  });

  const renameTag = useMutation({
    mutationFn: (payload: { old_tag: string; new_tag: string }) =>
      api("/api/notes/tags/rename", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["notes", "market-condition-suggestions"] });
      setRenamePendingTag(null);
    },
  });

  const deleteTag = useMutation({
    mutationFn: (payload: { tag: string }) =>
      api("/api/notes/tags/delete", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["notes", "market-condition-suggestions"] });
      setDeletePendingTag(null);
    },
  });

  // Ticker search in note modal
  const handleNoteSymbolChange = (value: string) => {
    setNoteSymbolInput(value);
    setValue("symbol", value.trim().toUpperCase());
    clearTimeout(noteSymbolDebounceRef.current);

    if (value.trim().length >= 2) {
      noteSymbolDebounceRef.current = setTimeout(async () => {
        try {
          const results = await tickersApi.search(value.trim(), 5);
          setNoteSymbolSuggestions(results);
          setNoteShowSuggestions(results.length > 0);
        } catch {
          setNoteSymbolSuggestions([]);
        }
      }, 250);
    } else {
      setNoteSymbolSuggestions([]);
      setNoteShowSuggestions(false);
    }
  };

  // Preference hydration
  useEffect(() => {
    if (!userPreferencesFetched || preferencesHydrated) return;
    const saved = userPreferences?.preferences?.notes?.filters;
    if (saved) {
      if (typeof saved.searchQuery === "string") setSearchQuery(saved.searchQuery);
      if (Array.isArray(saved.activeTags)) {
        setActiveFilterTags(normalizeMarketConditionTags(saved.activeTags));
      }
    }
    setPreferencesHydrated(true);
  }, [preferencesHydrated, userPreferences, userPreferencesFetched]);

  // Open edit modal
  const onEdit = (note: DailyNote) => {
    setEditingNoteId(note.id);
    const tags = parseMarketConditionTags(note.market_condition);
    setMarketConditionTags(normalizeMarketConditionTags(tags));
    setNoteSymbolInput(note.symbol || "");
    reset({
      note_date: note.note_date,
      mood: (note.mood as MoodValue) || "stale",
      market_volatility: note.market_volatility || "medium",
      short_summary: note.short_summary || "",
      rich_text: note.rich_text || "",
      symbol: note.symbol || "",
    });
    setIsNoteModalOpen(true);
  };

  const onOpenCreateModal = () => {
    setEditingNoteId(null);
    setMarketConditionTags([]);
    setNoteSymbolInput("");
    reset({
      note_date: new Date().toISOString().slice(0, 10),
      mood: "stale",
      market_volatility: "medium",
      short_summary: "",
      rich_text: "",
      symbol: "",
    });
    setIsNoteModalOpen(true);
  };

  const onSubmit = (values: NotePayload) => {
    const payload: NotePayload = {
      ...values,
      market_condition: marketConditionTags.length > 0 ? marketConditionTags.join(", ") : undefined,
      symbol: noteSymbolInput.trim().toUpperCase() || undefined,
    };
    upsert.mutate(payload);
  };

  // Tag filter logic
  const allAvailableTags = useMemo(() => {
    const set = new Set<string>();
    DISCIPLINE_PRESET_TAGS.forEach((p) => set.add(p.key));
    marketConditionSuggestions.forEach((t) => set.add(normalizeMarketConditionTagValue(t)));
    notes.forEach((n) => {
      parseMarketConditionTags(n.market_condition).forEach((t) => set.add(normalizeMarketConditionTagValue(t)));
    });
    return Array.from(set).filter(Boolean);
  }, [marketConditionSuggestions, notes]);

  const visibleFilterTags = showAllFilterTags
    ? allAvailableTags
    : allAvailableTags.slice(0, MAX_FILTER_TAGS_VISIBLE);

  const toggleFilterTag = (tag: string) => {
    const norm = normalizeMarketConditionTagValue(tag);
    setActiveFilterTags((prev) =>
      prev.includes(norm) ? prev.filter((t) => t !== norm) : [...prev, norm],
    );
  };

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesSummary = note.short_summary?.toLowerCase().includes(query);
        const matchesText = note.rich_text?.toLowerCase().includes(query);
        const matchesSymbol = note.symbol?.toLowerCase().includes(query);
        if (!matchesSummary && !matchesText && !matchesSymbol) return false;
      }
      if (activeFilterTags.length > 0) {
        const noteTags = parseMarketConditionTags(note.market_condition).map(
          normalizeMarketConditionTagValue,
        );
        const hasAllActive = activeFilterTags.every((t) => noteTags.includes(t));
        if (!hasAllActive) return false;
      }
      return true;
    });
  }, [activeFilterTags, notes, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 dark:text-slate-900 flex items-center gap-2">
            <span>📓</span>
            <span>{t("notes.title", "Diario Giornaliero & Psicologia")}</span>
          </h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">
            {t(
              "notes.subtitle",
              "Registra le condizioni generali di mercato, il tuo stato emotivo (mood) e la checklist di disciplina pre/post trading.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dateFilter && (
            <div className="flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1.5 text-xs text-teal-300">
              <span>{dateFilter}</span>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("date");
                  setSearchParams(next);
                }}
                className="hover:text-white"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-teal-400 active:scale-95 cursor-pointer"
          >
            <PlusIcon className="h-4 w-4 stroke-[2.5]" />
            <span>{t("notes.new_note", "+ Nuova Nota")}</span>
          </button>
        </div>
      </div>

      {/* ── Search & Tag Filters ──────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 dark:border-slate-200 dark:bg-white space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("notes.search_placeholder", "Cerca nel diario per parola chiave o simbolo...")}
              className="w-full rounded-lg border border-slate-700/80 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 dark:border-slate-300 dark:bg-white dark:text-slate-900"
            />
          </div>
          {(searchQuery || activeFilterTags.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveFilterTags([]);
              }}
              className="rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-400 hover:text-white dark:border-slate-300 dark:text-slate-600"
            >
              {t("notes.reset_filters", "Azzera")}
            </button>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {visibleFilterTags.map((tag) => {
            const isActive = activeFilterTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleFilterTag(tag)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? "bg-teal-500 text-slate-950 font-bold shadow-xs"
                    : "border border-slate-800 bg-slate-950/80 text-slate-400 hover:border-slate-700 hover:text-slate-200 dark:border-slate-200 dark:bg-slate-50 dark:text-slate-600"
                }`}
              >
                {formatMarketConditionTag(tag)}
              </button>
            );
          })}
          {allAvailableTags.length > MAX_FILTER_TAGS_VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAllFilterTags((prev) => !prev)}
              className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:text-white"
            >
              {showAllFilterTags ? "Mostra meno" : `+${allAvailableTags.length - MAX_FILTER_TAGS_VISIBLE} altri`}
            </button>
          )}
        </div>
      </div>

      {/* ── Notes Feed ────────────────────────────────────────── */}
      {isLoading ? (
        <div className="py-16 text-center text-xs text-slate-500">
          {t("common.loading", "Caricamento in corso...")}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center dark:border-slate-300">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/10 text-teal-400 mb-3">
            <CalendarIcon className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200 dark:text-slate-800">
            {t("notes.no_notes_title", "Nessuna nota trovata")}
          </h3>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {t("notes.no_notes_desc", "Inizia a scrivere la tua prima riflessione di mercato o checklist emotiva.")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((note) => {
            const isSelected = selectedNoteId === note.id;
            const tags = parseMarketConditionTags(note.market_condition);

            return (
              <div
                key={note.id}
                className={`rounded-xl border p-4.5 transition shadow-sm ${
                  isSelected
                    ? "border-teal-500 bg-teal-500/10 ring-1 ring-teal-500/30"
                    : "border-slate-800/80 bg-slate-900/60 hover:border-slate-700 dark:border-slate-200 dark:bg-white"
                }`}
              >
                {/* Note Header */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-100 dark:text-slate-900 flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-teal-400" />
                      <span>{note.note_date}</span>
                    </span>

                    {note.symbol && (
                      <span className="rounded bg-teal-500/20 px-1.5 py-0.5 font-mono text-xs font-bold text-teal-300 dark:bg-teal-100 dark:text-teal-800">
                        {note.symbol}
                      </span>
                    )}

                    {note.mood && (
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase flex items-center gap-1 ${
                          note.mood === "up"
                            ? "bg-emerald-500/20 text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800"
                            : note.mood === "down"
                              ? "bg-rose-500/20 text-rose-300 dark:bg-rose-100 dark:text-rose-800"
                              : "bg-slate-800 text-slate-300 dark:bg-slate-100 dark:text-slate-700"
                        }`}
                      >
                        {note.mood === "up" && <TrendingUpIcon className="h-3 w-3" />}
                        {note.mood === "down" && <TrendingDownIcon className="h-3 w-3" />}
                        <span>{note.mood}</span>
                      </span>
                    )}

                    {note.market_volatility && (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 dark:bg-slate-100 dark:text-slate-600">
                        Vol: {note.market_volatility}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(note)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-100"
                      title={t("common.edit", "Modifica")}
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletePendingNoteId(note.id)}
                      className="rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                      title={t("common.delete", "Elimina")}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Short Summary */}
                {note.short_summary && (
                  <h4 className="text-sm font-semibold text-slate-200 dark:text-slate-800 mb-2">
                    {note.short_summary}
                  </h4>
                )}

                {/* Rich text / Body */}
                {note.rich_text && (
                  <div
                    className="prose prose-invert prose-xs text-xs text-slate-300 dark:text-slate-700 leading-relaxed mb-3"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(note.rich_text) }}
                  />
                )}

                {/* Tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/60 dark:border-slate-100">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-300 dark:bg-slate-100 dark:text-slate-600"
                      >
                        {formatMarketConditionTag(tag)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal Nuova / Modifica Daily Note ──────────────────── */}
      {isNoteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !upsert.isPending) setIsNoteModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl dark:border-slate-200 dark:bg-white max-h-[90vh] overflow-y-auto fade-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 dark:border-slate-200">
              <h3 className="text-base font-bold text-slate-100 dark:text-slate-900">
                {editingNoteId
                  ? t("notes.edit_note_title", "Modifica Nota Giornaliera")
                  : t("notes.create_note_title", "Nuova Nota Giornaliera")}
              </h3>
              <button
                type="button"
                onClick={() => setIsNoteModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-100"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Date & Symbol */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                    {t("notes.date_label", "Data *")}
                  </label>
                  <input
                    type="date"
                    required
                    {...register("note_date")}
                    className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
                  />
                </div>
                <div className="relative">
                  <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                    {t("notes.symbol_label", "Simbolo / Ticker (Opzionale)")}
                  </label>
                  <input
                    type="text"
                    value={noteSymbolInput}
                    onChange={(e) => handleNoteSymbolChange(e.target.value)}
                    placeholder="es. ENI, UCG"
                    className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 font-mono text-xs uppercase text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
                  />
                  {noteShowSuggestions && noteSymbolSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl dark:border-slate-300 dark:bg-white">
                      {noteSymbolSuggestions.map((item) => (
                        <button
                          key={`${item.symbol}-${item.market}`}
                          type="button"
                          onClick={() => {
                            setNoteSymbolInput(item.symbol);
                            setValue("symbol", item.symbol);
                            setNoteShowSuggestions(false);
                          }}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-slate-800 dark:hover:bg-slate-100"
                        >
                          <span className="font-mono font-bold">{item.symbol}</span>
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            {item.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Mood & Volatility */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                    {t("notes.mood_label", "Mood / Stato Emotivo")}
                  </label>
                  <select
                    {...register("mood")}
                    className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
                  >
                    {MOOD_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.value === "up" ? "🟢 Positivo / Calmo" : m.value === "down" ? "🔴 Ansioso / Negativo" : "⚪ Neutro"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                    {t("notes.volatility_label", "Volatilità di Mercato")}
                  </label>
                  <select
                    {...register("market_volatility")}
                    className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
                  >
                    <option value="low">Bassa</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                  {t("notes.summary_label", "Sintesi Giornaliera")}
                </label>
                <input
                  type="text"
                  {...register("short_summary")}
                  placeholder="es. Giornata di consolidamento, rispettato il piano di trading"
                  className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
                />
              </div>

              {/* Rich Text / Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                  {t("notes.content_label", "Contenuto & Riflessioni")}
                </label>
                <textarea
                  rows={4}
                  {...register("rich_text")}
                  placeholder="Note dettagliate sulla sessione, errori psicologici, osservazioni..."
                  className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900 leading-relaxed"
                />
              </div>

              {/* Discipline Tags */}
              <div>
                <TagInput
                  label={t("notes.discipline_tags_label", "Tag Disciplina & Condizioni")}
                  placeholder="Aggiungi tag disciplina..."
                  value={marketConditionTags}
                  suggestions={DISCIPLINE_PRESET_TAGS.map((p) => p.key)}
                  formatTagLabel={formatMarketConditionTag}
                  onChange={setMarketConditionTags}
                />
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800 dark:border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 dark:border-slate-300 dark:text-slate-700"
                >
                  {t("common.cancel", "Annulla")}
                </button>
                <button
                  type="submit"
                  disabled={upsert.isPending}
                  className="rounded-lg bg-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-teal-400 disabled:opacity-50"
                >
                  {upsert.isPending
                    ? t("common.saving", "Salvataggio...")
                    : editingNoteId
                      ? t("common.save_changes", "Salva Modifiche")
                      : t("notes.create_submit", "Salva Nota")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ──────────────────────────────── */}
      {deletePendingNoteId && (
        <ConfirmModal
          message={t("notes.confirm_delete", "Sei sicuro di voler eliminare questa nota giornaliera?")}
          confirmLabel={t("common.delete", "Elimina")}
          onConfirm={() => remove.mutate(deletePendingNoteId)}
          onCancel={() => setDeletePendingNoteId(null)}
          isPending={remove.isPending}
        />
      )}
    </div>
  );
}
