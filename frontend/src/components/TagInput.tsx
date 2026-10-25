import { KeyboardEvent, useMemo, useState } from "react";

type TagInputProps = {
  label: string;
  placeholder?: string;
  value: string[];
  suggestions?: string[];
  formatTagLabel?: (tag: string) => string;
  onChange: (next: string[]) => void;
};

function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function TagInput({
  label,
  placeholder,
  value,
  suggestions = [],
  formatTagLabel,
  onChange,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const availableSuggestions = useMemo(() => {
    const selected = new Set(value.map((tag) => tag.toLowerCase()));
    const query = inputValue.trim().toLowerCase();
    return suggestions
      .filter((tag) => !selected.has(tag.toLowerCase()))
      .filter((tag) => (query ? tag.toLowerCase().includes(query) : true))
      .slice(0, 8);
  }, [inputValue, suggestions, value]);

  const addTag = (rawTag: string) => {
    const nextTag = normalizeTag(rawTag);
    if (!nextTag) {
      return;
    }
    if (value.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
      setInputValue("");
      return;
    }
    onChange([...value, nextTag]);
    setInputValue("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(inputValue);
      return;
    }
    if (event.key === "Backspace" && !inputValue.trim() && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-wide text-slate-400">{label}</label>
      <div className="rounded border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-2 py-2">
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full border border-teal-500/40 bg-teal-500/15 px-2 py-1 text-xs text-teal-200 dark:text-teal-900"
              title="Rimuovi tag"
            >
              {(formatTagLabel?.(tag) ?? tag)} ×
            </button>
          ))}
          {value.length === 0 ? <span className="text-xs text-slate-500">Nessun tag</span> : null}
        </div>
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => addTag(inputValue)}
          placeholder={placeholder}
          className="w-full bg-transparent px-1 py-1 text-sm text-slate-100 dark:text-slate-900 outline-none placeholder:text-slate-500 dark:placeholder:text-slate-400"
        />
      </div>
      {availableSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {availableSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => addTag(suggestion)}
              className="rounded-full border border-slate-600 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 px-2 py-1 text-xs text-slate-300 dark:text-slate-700 hover:border-teal-500/50 hover:text-teal-200 dark:hover:text-teal-900"
            >
              {formatTagLabel?.(suggestion) ?? suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
