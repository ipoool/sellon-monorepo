"use client";

import { useRef, type ReactNode } from "react";
import { Bold, Italic, Heading, List, Link2 } from "lucide-react";

// MarkdownField is a dependency-free markdown editor: a plain <textarea> plus a
// tiny toolbar that wraps the current selection (bold/italic/link) or prefixes
// the current line (heading/list) with markdown. Stored as markdown text and
// rendered safely by <Markdown>.
export function MarkdownField({
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after: string, fallback: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || fallback;
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + sel.length;
    });
  }

  function linePrefix(prefix: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + prefix.length;
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
      <div className="flex items-center gap-0.5 border-b border-neutral-100 px-1.5 py-1">
        <Btn onClick={() => wrap("**", "**", "tebal")} title="Tebal"><Bold className="size-3.5" aria-hidden /></Btn>
        <Btn onClick={() => wrap("*", "*", "miring")} title="Miring"><Italic className="size-3.5" aria-hidden /></Btn>
        <Btn onClick={() => linePrefix("## ")} title="Judul"><Heading className="size-3.5" aria-hidden /></Btn>
        <Btn onClick={() => linePrefix("- ")} title="Daftar"><List className="size-3.5" aria-hidden /></Btn>
        <Btn onClick={() => wrap("[", "](https://)", "teks")} title="Link"><Link2 className="size-3.5" aria-hidden /></Btn>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="block w-full resize-y rounded-b-lg border-0 bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0"
      />
    </div>
  );
}

function Btn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // preventDefault on mousedown keeps the textarea selection intact when
      // the toolbar button steals focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="flex size-7 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
    >
      {children}
    </button>
  );
}
