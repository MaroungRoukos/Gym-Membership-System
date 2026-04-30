"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchDashboard, type DashboardStats } from "@/lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchDashboard(30);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <Alert type="error">{error}</Alert>;
  }

  if (!data) {
    return <p className="text-[var(--muted)]">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-10">
      <PageHero
        eyebrow="Gym Operations"
        title="Performance control center for your fitness business."
        description="Track active members, revenue momentum, and expiring plans from a single premium dashboard built for gym teams."
        imageSrc="/images/gym-hero.jpg"
        actions={[
          { href: "/members/new", label: "Add member" },
          { href: "/payments", label: "Open payments", secondary: true },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total members" value={data.total_members} />
        <StatCard
          title="Active memberships"
          value={data.active_memberships}
        />
        <StatCard
          title="Expired memberships"
          value={data.expired_memberships}
        />
        <StatCard
          title="Not active (unpaid)"
          value={data.not_active_memberships}
        />
        <StatCard
          title="Expiring soon"
          value={data.expiring_soon}
          hint={`Within ${data.expiring_days} days`}
        />
        <StatCard
          title="Unpaid balances"
          value={`$${Number(data.unpaid_balances).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        />
        <StatCard
          title="Monthly revenue"
          value={`$${Number(data.monthly_revenue).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        />
        <StatCard
          title="Yearly revenue"
          value={`$${Number(data.yearly_revenue).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        />
        <StatCard
          title="New members this month"
          value={data.new_members_this_month}
        />
        <StatCard
          title="Total revenue"
          value={`$${Number(data.total_revenue).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          hint="Sum of paid payments"
        />
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Member onboarding",
            description: "Register new athletes and assign training plans quickly.",
            href: "/members/new",
            image: "/images/gym-members.jpg",
          },
          {
            title: "Revenue workflow",
            description: "Record and verify dues before sessions begin.",
            href: "/payments",
            image: "/images/gym-payments.jpg",
          },
          {
            title: "Attendance desk",
            description: "Run rapid check-ins and monitor gym traffic in real-time.",
            href: "/checkins",
            image: "/images/gym-checkins.jpg",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/30"
          >
            <Image
              src={item.image}
              alt=""
              fill
              className="object-cover opacity-25 transition group-hover:opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />
            <div className="relative">
              <p className="text-lg font-semibold text-white">{item.title}</p>
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Expiring in {data.expiring_days} days
          </h2>
          <Link
            href="/expiring"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            View all
          </Link>
        </div>
        {data.expiring_memberships.length === 0 ? (
          <EmptyState
            title="No urgent expirations"
            message="Great job. No membership plans are expiring in this selected window."
            imageSrc="/images/gym-members.jpg"
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/40">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-white/5 text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Ends</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.expiring_memberships.map((m) => (
                  <tr
                    key={m.id}
                    className="border-t border-white/10 hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-2">{m.full_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {m.id_number}
                    </td>
                    <td className="px-4 py-2 capitalize">{m.plan}</td>
                    <td className="px-4 py-2">{m.end_date}</td>
                    <td className="px-4 py-2">
                      <StatusBadge
                        label={m.membership_status.replace("_", " ")}
                        tone={m.membership_status === "active" ? "success" : "warning"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
