"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert } from "@/components/Alert";
import { fetchSettings, updateSettings } from "@/lib/api";

export default function SettingsPage() {
  const [gymName, setGymName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSettings();
        if (cancelled) return;
        setGymName(data.gym_name);
        setLogoUrl(data.logo_url);
        setCurrency(data.currency);
        setAdminDisplayName(data.admin_display_name);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await updateSettings({
        gym_name: gymName.trim(),
        logo_url: logoUrl.trim(),
        currency: currency.trim().toUpperCase(),
        admin_display_name: adminDisplayName.trim(),
      });
      setSuccess("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-[var(--muted)]">Loading settings...</p>;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configure gym branding, currency, and admin profile display.
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <form
        onSubmit={onSave}
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-6"
      >
        <div>
          <label className="text-xs text-[var(--muted)]">Gym name</label>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={gymName}
            onChange={(e) => setGymName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Logo URL</label>
          <input
            type="url"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Currency</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            maxLength={8}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Admin display name</label>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={adminDisplayName}
            onChange={(e) => setAdminDisplayName(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </form>
    </div>
  );
}
