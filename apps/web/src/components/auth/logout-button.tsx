"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
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
      {pending ? "Keluar…" : "Keluar"}
    </Button>
  );
}
