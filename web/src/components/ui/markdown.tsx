import ReactMarkdown from "react-markdown";

// Markdown renders seller-authored markdown SAFELY: react-markdown builds React
// elements and (without rehype-raw) does NOT render embedded raw HTML, so there
// is no stored-XSS surface — no DOMPurify needed. Element styling is applied via
// the components map (the repo has no @tailwindcss/typography plugin). We read
// only `children`/`href` (never spread `node`) so no invalid DOM props leak.
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-3 leading-relaxed text-neutral-700">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-neutral-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-neutral-700">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-neutral-700">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-bold text-neutral-900">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-bold text-neutral-900">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-3 text-base font-semibold text-neutral-900">{children}</h3>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-brand-700 underline hover:text-brand-800"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs">{children}</code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-neutral-300 pl-3 italic text-neutral-600">
              {children}
            </blockquote>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
