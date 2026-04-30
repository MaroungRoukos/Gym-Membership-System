"use client";

import Image from "next/image";

export function EmptyState({
  title,
  message,
  imageSrc,
}: {
  title: string;
  message: string;
  imageSrc: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-6">
      <Image
        src={imageSrc}
        alt=""
        fill
        className="object-cover object-center opacity-20"
      />
      <div className="absolute inset-0 bg-slate-950/70" />
      <div className="relative text-center">
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="mt-2 text-sm text-slate-300">{message}</p>
      </div>
    </div>
  );
}
