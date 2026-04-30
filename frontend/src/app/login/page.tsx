"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
      <Image
        src="/images/gym-login.jpg"
        alt=""
        fill
        priority
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-950/75 to-cyan-950/40" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/45 shadow-[0_35px_80px_-30px_rgba(0,0,0,0.85)] backdrop-blur md:grid-cols-2">
        <div className="hidden border-r border-white/10 bg-white/5 p-10 md:block">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/90">
            Gym Membership Platform
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-white">
            Train smarter. Run your gym better.
          </h1>
          <p className="mt-4 max-w-md text-sm text-slate-300">
            Welcome to your premium admin dashboard for member lifecycle, payments,
            and attendance operations.
          </p>
        </div>
        <div className="p-8 md:p-10">
          <h2 className="text-2xl font-semibold tracking-tight text-white">Sign in</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use your staff administrator account to continue.
          </p>
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="username" className="text-sm text-[var(--muted)]">
                Username
              </label>
              <input
                id="username"
                autoComplete="username"
                suppressHydrationWarning
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-[var(--foreground)] outline-none focus:border-cyan-400/70"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="text-sm text-[var(--muted)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                suppressHydrationWarning
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-[var(--foreground)] outline-none focus:border-cyan-400/70"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-[var(--danger)]" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-xs text-slate-400">
            Secure JWT authentication with admin-only access.
          </p>
        </div>
      </div>
    </div>
  );
}
