import React from "react";
import MarkdownPreview from "@uiw/react-markdown-preview";
import rehypeRaw from "rehype-raw";
import { useTheme } from "../../contexts/ThemeContext";

interface ReportMarkdownViewerProps {
  content?: string | null;
  emptyText: string;
  stripJsonBlock?: boolean;
  className?: string;
}

/**
 * Strips machine JSON block from coaching output if present,
 * supporting both ```json ... ``` code fences and trailing raw JSON objects.
 */
export function sanitizeReportMarkdown(text?: string | null, stripJson = false): string {
  if (!text) return "";
  let clean = text.trim();
  if (stripJson) {
    // 1. Remove markdown fences containing overall_score without crossing code blocks
    clean = clean.replace(/```(?:json)?\s*\{(?:(?!```)[\s\S])*?"overall_score"(?:(?!```)[\s\S])*?\}\s*```/gi, "").trim();
    // 2. Remove raw trailing json containing overall_score if present at the end
    clean = clean.replace(/\{\s*"overall_score"[\s\S]*\}\s*$/gi, "").trim();
  }
  return clean;
}

export const ReportMarkdownViewer: React.FC<ReportMarkdownViewerProps> = ({
  content,
  emptyText,
  stripJsonBlock = false,
  className = "",
}) => {
  const { theme } = useTheme();
  const sanitized = sanitizeReportMarkdown(content, stripJsonBlock);

  if (!sanitized) {
    return (
      <div className="py-4">
        <p className="text-sm text-slate-400 italic">{emptyText}</p>
      </div>
    );
  }

  return (
    <div
      className={`report-markdown-wrapper ${className}`}
      data-color-mode={theme === "light" ? "light" : "dark"}
    >
      <MarkdownPreview
        source={sanitized}
        style={{
          backgroundColor: "transparent",
          fontSize: "0.9375rem",
          lineHeight: "1.75",
        }}
        wrapperElement={{ "data-color-mode": theme === "light" ? "light" : "dark" }}
        pluginsFilter={(type, list) => {
          if (type === "rehype") {
            // Disable raw HTML interpretation (rehype-raw) by direct plugin reference (unaffected by minification)
            // to prevent XSS from untrusted LLM markdown
            return list.filter((plugin) => {
              const fn = Array.isArray(plugin) ? plugin[0] : plugin;
              return fn !== rehypeRaw && (fn as { name?: string })?.name !== "rehypeRaw";
            });
          }
          return list;
        }}
      />
    </div>
  );
};
