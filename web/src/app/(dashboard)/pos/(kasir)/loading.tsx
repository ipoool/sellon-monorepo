// Suspense fallback untuk /pos saat data products + session lagi di-fetch.
// Layout luar (layout.tsx) tetap di-render — file ini hanya untuk konten
// body sebelum page data siap.
export default function POSLoading() {
  return (
    <div className="flex h-svh flex-col">
      {/* Header skeleton */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-6 w-20 animate-pulse rounded bg-neutral-200" />
          <div className="h-5 w-24 animate-pulse rounded-full bg-neutral-200" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 animate-pulse rounded-lg bg-neutral-200" />
          <div className="h-8 w-16 animate-pulse rounded-lg bg-neutral-200" />
          <div className="h-8 w-24 animate-pulse rounded-lg bg-amber-100" />
          <div className="h-8 w-8 animate-pulse rounded-md bg-neutral-200" />
        </div>
      </div>

      {/* Body skeleton: product grid + cart panel */}
      <div className="grid flex-1 overflow-hidden lg:grid-cols-[1fr_420px]">
        {/* Product grid */}
        <div className="flex flex-col overflow-hidden">
          {/* Search + categories */}
          <div className="border-b border-neutral-200 bg-white p-3 space-y-2">
            <div className="h-10 w-full animate-pulse rounded-lg bg-neutral-100" />
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-neutral-100" />
              ))}
            </div>
          </div>
          {/* Grid */}
          <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white"
              >
                <div className="aspect-square animate-pulse bg-neutral-100" />
                <div className="space-y-1.5 p-2">
                  <div className="h-3 w-full animate-pulse rounded bg-neutral-200" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
                  <div className="h-3.5 w-16 animate-pulse rounded bg-neutral-300" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cart panel */}
        <aside className="hidden border-l border-neutral-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-neutral-200 px-4 py-3">
            <div className="h-5 w-32 animate-pulse rounded bg-neutral-200" />
          </div>
          <div className="flex-1 p-3" />
          <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-neutral-200" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-neutral-200" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-neutral-200" />
          </div>
        </aside>
      </div>
    </div>
  );
}
