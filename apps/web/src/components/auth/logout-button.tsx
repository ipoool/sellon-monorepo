"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  return (
    <Button
      size="icon"
      variant="outline"
      disabled={pending}
      aria-label="Keluar"
      title="Keluar"
      onClick={async () => {
        setPending(true);
        try {
          await fetch(`${apiBase}/api/v1/auth/logout`, {
            method: "POST",
            credentials: "include",
          });
        } finally {
          router.push("/");
          router.refresh();
        }
      }}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <LogOut className="size-4" aria-hidden />
      )}
    </Button>
  );
}
