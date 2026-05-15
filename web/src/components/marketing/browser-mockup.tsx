import * as React from "react";
import { cn } from "@/lib/utils";

type BrowserMockupProps = {
  url?: string;
  className?: string;
  children: React.ReactNode;
};

// Stylized browser frame for fake screenshots — top bar with traffic light
// dots and a URL pill, body slot for any content. No real screenshots needed.
export function BrowserMockup({
  url = "sellon.id/dashboard",
  className,
  children,
}: BrowserMockupProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-popout",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-neutral-300" />
          <span className="size-2.5 rounded-full bg-neutral-300" />
          <span className="size-2.5 rounded-full bg-neutral-300" />
        </div>
        <div className="ml-3 flex h-6 flex-1 items-center justify-center rounded-md border border-neutral-200 bg-white px-3 text-xs text-neutral-500">
          {url}
        </div>
      </div>
      <div className="bg-white">{children}</div>
    </div>
  );
}
