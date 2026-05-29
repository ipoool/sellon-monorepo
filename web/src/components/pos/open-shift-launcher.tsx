"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShiftOpenModal } from "./shift-open-modal";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  size?: "sm" | "md" | "lg";
  label?: string;
};

// OpenShiftLauncher: tombol "Buka Kasir" yang menampilkan modal
// langsung di halaman saat ini. Setelah shift berhasil dibuka,
// baru redirect ke /pos. Mencegah dialog auto-popup di halaman
// kosong /pos.
export function OpenShiftLauncher({ size = "sm", label = "Buka Kasir" }: Props) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleClick = async () => {
    setChecking(true);
    try {
      // Kalau sudah ada session aktif, langsung redirect.
      const res = await fetch(`${apiBase}/api/v1/pos/sessions/active`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          router.push("/pos");
          return;
        }
      }
      setShow(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Button size={size} onClick={handleClick} disabled={checking}>
        <Power className="size-4" aria-hidden />
        {label}
      </Button>
      {show && (
        <ShiftOpenModal
          onSuccess={() => {
            setShow(false);
            router.push("/pos");
            router.refresh();
          }}
          onCancel={() => setShow(false)}
        />
      )}
    </>
  );
}
