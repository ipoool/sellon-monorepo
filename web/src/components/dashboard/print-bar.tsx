"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  backHref: string;
};

export function PrintBar({ backHref }: Props) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 print:hidden sm:px-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Kembali
      </Link>
      <Button
        type="button"
        size="sm"
        onClick={() => window.print()}
      >
        <Printer className="size-4" aria-hidden />
        Cetak / Simpan PDF
      </Button>
    </div>
  );
}
