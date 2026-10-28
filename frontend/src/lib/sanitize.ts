import DOMPurify from "dompurify";

export const SANITIZE_CONFIG = {
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
};

export function sanitizeRichText(value?: string | null): string {
  if (!value) {
    return "";
  }
  return DOMPurify.sanitize(value, SANITIZE_CONFIG);
}
