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
  { href: "/settings", label: "Settings" },
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
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="border-b border-[var(--border)]/70 bg-[var(--surface)]/90 backdrop-blur md:w-60 md:border-b-0 md:border-r md:shrink-0">
        <div className="p-4 md:p-5">
          <p className="text-sm font-semibold text-[var(--muted)]">
            Gym admin
          </p>
          <nav className="mt-4 flex flex-wrap gap-1 md:flex-col md:gap-0">
            {links.map(({ href, label }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-[var(--accent)]/20 text-white ring-1 ring-[var(--accent)]/35"
                      : "text-[var(--muted)] hover:bg-[var(--background)]/50 hover:text-[var(--foreground)]"
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
            className="mt-6 w-full rounded-lg border border-[var(--border)]/90 bg-[var(--background)]/35 px-3 py-2 text-left text-sm transition hover:border-[var(--muted)]/60 hover:bg-[var(--background)]/60"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
