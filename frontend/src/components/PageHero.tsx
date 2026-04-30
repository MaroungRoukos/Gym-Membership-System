"use client";

import Image from "next/image";
import Link from "next/link";

type HeroAction = {
  href: string;
  label: string;
  secondary?: boolean;
};

export function PageHero({
  eyebrow,
  title,
  description,
  imageSrc,
  actions = [],
}: {
  eyebrow: string;
  title: string;
  description: string;
  imageSrc: string;
  actions?: HeroAction[];
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)]">
      <Image
        src={imageSrc}
        alt=""
        fill
        priority
        className="object-cover object-center opacity-50"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-900/50" />
      <div className="relative p-6 md:p-8 lg:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/90">
          {eyebrow}
        </p>
        <h1 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight text-white md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-200/90 md:text-base">
          {description}
        </p>
        {actions.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={
                  action.secondary
                    ? "rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                    : "rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
