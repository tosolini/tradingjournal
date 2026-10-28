import { useEffect, useRef, useState } from "react";
import { sanitizeRichText } from "../lib/sanitize";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Scrivi qui...",
  minHeight = "160px",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Sync external value to innerHTML only when different (avoids cursor jumps)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentHTML = editor.innerHTML;
    const sanitizedIncoming = sanitizeRichText(value || "");

    if (currentHTML !== sanitizedIncoming) {
      editor.innerHTML = sanitizedIncoming;
      checkIfEmpty();
    }
  }, [value]);

  const checkIfEmpty = () => {
    const editor = editorRef.current;
    if (!editor) {
      setIsEmpty(true);
      return;
    }
    const text = editor.innerText.trim();
    const hasMedia = editor.querySelector("img, hr, table");
    setIsEmpty(!text && !hasMedia);
  };

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) return;

    checkIfEmpty();
    const rawHTML = editor.innerHTML;
    // Normalize empty editor states
    if (rawHTML === "<p><br></p>" || rawHTML === "<br>" || rawHTML.trim() === "") {
      onChange("");
    } else {
      onChange(sanitizeRichText(rawHTML));
    }
  };

  const execute = (command: string, arg: string | undefined = undefined) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    // Use document.execCommand with focus preserved
    document.execCommand(command, false, arg);
    handleInput();
  };

  const handleInsertLink = () => {
    const url = window.prompt("Inserisci URL:", "https://");
    if (url && url.trim()) {
      execute("createLink", url.trim());
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-slate-700/80 bg-slate-950 overflow-hidden dark:border-slate-300 dark:bg-white transition focus-within:border-teal-500/70 focus-within:ring-1 focus-within:ring-teal-500/30">
      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900/90 px-2.5 py-1.5 dark:border-slate-200 dark:bg-slate-100 select-none">
        {/* Bold */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("bold");
          }}
          className="rounded p-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Grassetto (Ctrl+B)"
          aria-label="Grassetto"
        >
          <span className="font-extrabold font-serif text-sm">B</span>
        </button>

        {/* Italic */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("italic");
          }}
          className="rounded p-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Corsivo (Ctrl+I)"
          aria-label="Corsivo"
        >
          <span className="italic font-serif text-sm">I</span>
        </button>

        {/* Underline */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("underline");
          }}
          className="rounded p-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Sottolineato (Ctrl+U)"
          aria-label="Sottolineato"
        >
          <span className="underline font-serif text-sm">U</span>
        </button>

        {/* Strikethrough */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("strikeThrough");
          }}
          className="rounded p-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Barrato"
          aria-label="Barrato"
        >
          <span className="line-through font-serif text-sm">S</span>
        </button>

        <div className="h-4 w-[1px] bg-slate-700 dark:bg-slate-300 mx-1"></div>

        {/* Headings */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("formatBlock", "<h3>");
          }}
          className="rounded px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Titolo H3"
        >
          H3
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("formatBlock", "<h4>");
          }}
          className="rounded px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Sottotitolo H4"
        >
          H4
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("formatBlock", "<p>");
          }}
          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white dark:text-slate-600 dark:hover:bg-slate-200 cursor-pointer"
          title="Paragrafo normale"
        >
          ¶
        </button>

        <div className="h-4 w-[1px] bg-slate-700 dark:bg-slate-300 mx-1"></div>

        {/* Bullet List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("insertUnorderedList");
          }}
          className="rounded p-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Elenco puntato"
          aria-label="Elenco puntato"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>

        {/* Numbered List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("insertOrderedList");
          }}
          className="rounded p-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Elenco numerato"
          aria-label="Elenco numerato"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <path d="M4 6h1v4" />
            <path d="M4 10h2" />
            <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
          </svg>
        </button>

        {/* Blockquote */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("formatBlock", "<blockquote>");
          }}
          className="rounded p-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Citazione"
          aria-label="Citazione"
        >
          <span className="font-serif font-bold text-sm">“</span>
        </button>

        {/* Code */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("formatBlock", "<pre>");
          }}
          className="rounded p-1.5 text-xs font-mono text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Blocco Codice"
          aria-label="Blocco Codice"
        >
          &lt;/&gt;
        </button>

        <div className="h-4 w-[1px] bg-slate-700 dark:bg-slate-300 mx-1"></div>

        {/* Link */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleInsertLink();
          }}
          className="rounded p-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
          title="Inserisci Link"
          aria-label="Inserisci Link"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>

        {/* Remove Link / Clear Format */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("removeFormat");
            execute("unlink");
          }}
          className="rounded p-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white dark:text-slate-500 dark:hover:bg-slate-200 cursor-pointer"
          title="Rimuovi formattazione"
          aria-label="Rimuovi formattazione"
        >
          <span className="text-xs">Tx</span>
        </button>
        <div className="h-4 w-[1px] bg-slate-700 dark:bg-slate-300 mx-1"></div>

        {/* Undo */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("undo");
          }}
          className="rounded p-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white dark:text-slate-500 dark:hover:bg-slate-200 cursor-pointer"
          title="Annulla (Ctrl+Z)"
          aria-label="Annulla"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        {/* Redo */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            execute("redo");
          }}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white dark:text-slate-500 dark:hover:bg-slate-200 cursor-pointer"
          title="Ripristina (Ctrl+Y)"
          aria-label="Ripristina"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
        </button>
      </div>

      {/* ── ContentEditable Editor Area ─────────────────────── */}
      <div className="relative p-3">
        {isEmpty && (
          <div className="pointer-events-none absolute left-3 top-3 text-xs text-slate-500 dark:text-slate-400 italic">
            {placeholder}
          </div>
        )}

        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onBlur={handleInput}
          style={{ minHeight }}
          className="notes-rich-content text-xs text-slate-100 outline-none leading-relaxed break-words [overflow-wrap:anywhere] max-w-full overflow-y-auto dark:text-slate-900 focus:outline-none"
        />
      </div>
    </div>
  );
}
