"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/api";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/members", label: "Members" },
  { href: "/members/new", label: "Add member" },
  { href: "/membership", label: "Membership" },
  { href: "/payments", label: "Payments" },
  { href: "/search", label: "Search & filter" },
  { href: "/expiring", label: "Expiring" },
];

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
      <aside className="border-b border-[var(--border)] bg-[var(--surface)] md:w-56 md:border-b-0 md:border-r md:shrink-0">
        <div className="p-4">
          <p className="text-sm font-semibold text-[var(--muted)]">
            Gym admin
          </p>
          <nav className="mt-4 flex flex-wrap gap-1 md:flex-col md:gap-0">
            {links.map(({ href, label }) => {
              const active =
                href === "/members"
                  ? pathname.startsWith("/members")
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    active
                      ? "bg-[var(--background)] text-white"
                      : "text-[var(--muted)] hover:bg-[var(--background)]/60"
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
            className="mt-6 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--background)]"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
