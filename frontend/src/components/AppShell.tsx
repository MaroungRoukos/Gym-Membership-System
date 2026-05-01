"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/api";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/members", label: "Members" },
  { href: "/membership", label: "Membership" },
  { href: "/payments", label: "Payments" },
  { href: "/checkins", label: "Check-ins" },
  { href: "/reports", label: "Reports" },
  { href: "/search", label: "Search & filter" },
  { href: "/expiring", label: "Expiring" },
  { href: "/settings", label: "Configuration" },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] md:flex-row">
      <aside className="border-b border-white/10 bg-slate-950/70 backdrop-blur md:w-72 md:border-b-0 md:border-r md:shrink-0">
        <div className="p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/85">
            Fitness Ops
          </p>
          <p className="mt-1 text-sm text-white">Gym membership admin</p>
          <nav className="mt-4 flex flex-wrap gap-1 md:flex-col md:gap-1">
            {links.map(({ href, label }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-xl px-3 py-2 text-sm transition ${
                    active
                      ? "bg-cyan-400/15 text-white ring-1 ring-cyan-300/30"
                      : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--foreground)]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={onLogout}
            className="mt-6 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm transition hover:border-white/35 hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
