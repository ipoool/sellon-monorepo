"use client";

import { useState } from "react";
import { GraduationCap, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

export type CourseVideoView = {
  title: string;
  youtube_id: string;
  description_md: string;
};

// CoursePlayer is the presentational course layout — playlist sidebar + a large
// video player + markdown description. Shared by the buyer viewer (after OTP)
// and the seller preview (no OTP). Pure: give it resolved videos, it renders.
export function CoursePlayer({
  productName,
  videos,
}: {
  productName: string;
  videos: CourseVideoView[];
}) {
  const [active, setActive] = useState(0);
  const current = videos[active];

  return (
    <div className="w-full px-4 py-8 lg:px-8">
      <header className="mb-6 flex items-center gap-2">
        <GraduationCap className="size-5 text-brand-600" aria-hidden />
        <h1 className="font-display text-xl font-semibold text-neutral-900">
          {productName || "Kelas"}
        </h1>
      </header>

      {videos.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-neutral-500">
            Belum ada video di kursus ini.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Sidebar: daftar video (sticky + scrollable di desktop) */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
              <p className="border-b border-neutral-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Daftar Video · {videos.length}
              </p>
              <div className="flex flex-col p-2 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
                {videos.map((v, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive(i)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      i === active
                        ? "bg-brand-50 text-brand-700"
                        : "text-neutral-700 hover:bg-neutral-100",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        i === active ? "bg-brand-600 text-white" : "bg-neutral-200 text-neutral-600",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className={cn("min-w-0 flex-1", i === active && "font-semibold")}>
                      {v.title || `Video ${i + 1}`}
                    </span>
                    {i === active && <PlayCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Konten full: player besar + deskripsi */}
          <div className="min-w-0">
            {current && (
              <>
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-card">
                  <iframe
                    key={current.youtube_id}
                    src={`https://www.youtube.com/embed/${current.youtube_id}`}
                    title={current.title || "Video"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="size-full"
                  />
                </div>
                {current.title && (
                  <h2 className="mt-5 font-display text-xl font-semibold text-neutral-900">
                    {current.title}
                  </h2>
                )}
                {current.description_md.trim() && (
                  <div className="mt-3 text-sm">
                    <Markdown>{current.description_md}</Markdown>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
