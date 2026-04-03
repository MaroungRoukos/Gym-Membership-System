"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (getAccessToken()) router.replace("/dashboard");
    else router.replace("/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
      Loading…
    </div>
  );
}
