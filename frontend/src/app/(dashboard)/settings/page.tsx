"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert } from "@/components/Alert";
import {
  fetchSettings,
  updateSettings,
  type GymSettings,
} from "@/lib/api";

const NAV = [
  { id: "general", label: "General" },
  { id: "financial", label: "Financial" },
  { id: "membership", label: "Membership" },
  { id: "attendance", label: "Attendance" },
] as const;

const DATE_FORMAT_OPTIONS: { label: string; value: string }[] = [
  { label: "ISO — YYYY-MM-DD", value: "%Y-%m-%d" },
  { label: "EU — DD/MM/YYYY", value: "%d/%m/%Y" },
  { label: "US — MM/DD/YYYY", value: "%m/%d/%Y" },
  { label: "Long — Apr 30, 2026", value: "%b %d, %Y" },
];

type FormState = Omit<GymSettings, "updated_at" | "checkin_sources"> & {
  checkin_sources_text: string;
};

function fromApi(data: GymSettings): FormState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- not editable in this form
  const { updated_at, checkin_sources, ...rest } = data;
  return {
    ...rest,
    checkin_sources_text: checkin_sources.join(", "),
  };
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function inputClassName(disabled?: boolean) {
  return [
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]",
    "outline-none ring-0 transition placeholder:text-[var(--muted)]/70",
    "focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/35",
    disabled ? "opacity-60" : "",
  ].join(" ");
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{children}</p>;
}

export default function SettingsPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [initialJson, setInitialJson] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(
    () => form !== null && JSON.stringify(form) !== initialJson,
    [form, initialJson]
  );

  const load = useCallback(async () => {
    const data = await fetchSettings();
    const next = fromApi(data);
    setForm(next);
    setInitialJson(JSON.stringify(next));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function validateClient(f: FormState): string | null {
    if (!f.currency.trim()) return "Currency is required.";
    if (!f.invoice_prefix.trim()) return "Invoice prefix is required.";
    const reg = Number(f.registration_fee);
    if (Number.isNaN(reg) || reg < 0) return "Registration fee must be a number ≥ 0.";
    const tax = Number(f.tax_rate);
    if (Number.isNaN(tax) || tax < 0) return "Tax rate must be a number ≥ 0.";
    if (f.default_payment_due_days < 0) return "Default payment due days cannot be negative.";
    if (f.default_membership_duration_days < 1)
      return "Default membership duration must be at least 1 day.";
    if (f.grace_period_days < 0) return "Grace period cannot be negative.";
    if (f.auto_checkout_hours < 1) return "Auto checkout hours must be at least 1.";
    return null;
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSuccess(null);
    const clientErr = validateClient(form);
    if (clientErr) {
      setError(clientErr);
      return;
    }
    setSaving(true);
    try {
      const { checkin_sources_text, ...rest } = form;
      const checkin_sources = checkin_sources_text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await updateSettings({
        ...rest,
        gym_name: form.gym_name.trim(),
        logo_url: form.logo_url.trim(),
        currency: form.currency.trim().toUpperCase(),
        admin_display_name: form.admin_display_name.trim(),
        invoice_prefix: form.invoice_prefix.trim(),
        timezone: form.timezone.trim(),
        date_format: form.date_format.trim(),
        registration_fee: form.registration_fee,
        tax_rate: form.tax_rate,
        checkin_sources,
      });
      await load();
      setSuccess("Configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <p className="text-[var(--muted)]">Loading configuration…</p>;
  }

  return (
    <div className="relative pb-28">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Gym configuration
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Branding, finance, membership rules, and attendance defaults. Changes apply to new
            operations; existing payment and check-in logic still uses current hard-coded behavior
            until wired to these fields.
          </p>
        </header>

        {error && (
          <div className="mb-6">
            <Alert type="error">{error}</Alert>
          </div>
        )}
        {success && (
          <div className="mb-6">
            <Alert type="success">{success}</Alert>
          </div>
        )}

        <form ref={formRef} onSubmit={onSave}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
            <nav
              aria-label="Configuration sections"
              className="lg:sticky lg:top-6 lg:w-52 lg:shrink-0"
            >
              <div className="rounded-2xl border border-white/10 bg-[var(--surface)]/80 p-3 shadow-lg shadow-black/15 backdrop-blur">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Sections
                </p>
                <ul className="space-y-0.5">
                  {NAV.map(({ id, label }) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => scrollToSection(id)}
                        className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--muted)] transition hover:bg-white/5 hover:text-[var(--foreground)]"
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>

            <div className="min-w-0 flex-1 space-y-8">
              <ConfigCard id="general" title="General" description="Identity and regional display.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-[var(--muted)]">Gym name</label>
                    <input
                      required
                      className={inputClassName()}
                      value={form.gym_name}
                      onChange={(e) => patch("gym_name", e.target.value)}
                    />
                    <Helper>Shown in headers, receipts, and staff-facing surfaces.</Helper>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-[var(--muted)]">Logo URL</label>
                    <input
                      type="url"
                      className={inputClassName()}
                      value={form.logo_url}
                      onChange={(e) => patch("logo_url", e.target.value)}
                      placeholder="https://…"
                    />
                    <Helper>HTTPS image URL for branding; leave empty if you do not use a logo.</Helper>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">
                      Admin display name
                    </label>
                    <input
                      className={inputClassName()}
                      value={form.admin_display_name}
                      onChange={(e) => patch("admin_display_name", e.target.value)}
                    />
                    <Helper>Optional label for signed-in staff (e.g. front desk alias).</Helper>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">Timezone</label>
                    <input
                      className={inputClassName()}
                      value={form.timezone}
                      onChange={(e) => patch("timezone", e.target.value)}
                      placeholder="America/New_York"
                    />
                    <Helper>IANA timezone name. Used when we wire scheduling and reports to gym-local time.</Helper>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-[var(--muted)]">Date format</label>
                    <input
                      className={inputClassName()}
                      value={form.date_format}
                      onChange={(e) => patch("date_format", e.target.value)}
                      list="date-format-presets"
                    />
                    <datalist id="date-format-presets">
                      {DATE_FORMAT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value} label={o.label} />
                      ))}
                    </datalist>
                    <Helper>
                      strftime-style pattern for member-facing dates once the app reads this setting.
                    </Helper>
                  </div>
                </div>
              </ConfigCard>

              <ConfigCard
                id="financial"
                title="Financial"
                description="Money, invoicing, and tax display defaults."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">Currency</label>
                    <input
                      required
                      className={inputClassName()}
                      value={form.currency}
                      onChange={(e) => patch("currency", e.target.value)}
                      maxLength={8}
                    />
                    <Helper>Required. ISO-style code (e.g. USD, EUR) used in UI and exports.</Helper>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">
                      Registration fee
                    </label>
                    <input
                      inputMode="decimal"
                      className={inputClassName()}
                      value={form.registration_fee}
                      onChange={(e) => patch("registration_fee", e.target.value)}
                    />
                    <Helper>One-time or default signup fee amount (≥ 0).</Helper>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">
                      Default payment due (days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={inputClassName()}
                      value={form.default_payment_due_days}
                      onChange={(e) =>
                        patch("default_payment_due_days", Number(e.target.value) || 0)
                      }
                    />
                    <Helper>Days after issue for default due date when creating invoices (≥ 0).</Helper>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">
                      Invoice prefix
                    </label>
                    <input
                      required
                      className={inputClassName()}
                      value={form.invoice_prefix}
                      onChange={(e) => patch("invoice_prefix", e.target.value)}
                    />
                    <Helper>Required prefix for generated invoice numbers (default INV).</Helper>
                  </div>
                  <ToggleRow
                    label="Allow credit balance"
                    checked={form.allow_credit_balance}
                    onChange={(v) => patch("allow_credit_balance", v)}
                    helper="When enabled, members may carry a positive (prepaid) balance in policy."
                  />
                  <ToggleRow
                    label="Allow outstanding balance"
                    checked={form.allow_outstanding_balance}
                    onChange={(v) => patch("allow_outstanding_balance", v)}
                    helper="When enabled, unpaid balances are expected in normal operations."
                  />
                  <ToggleRow
                    label="Tax enabled"
                    checked={form.tax_enabled}
                    onChange={(v) => patch("tax_enabled", v)}
                    helper="Turn on when prices should show or compute tax (UI integration pending)."
                  />
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">Tax rate (%)</label>
                    <input
                      inputMode="decimal"
                      className={inputClassName()}
                      value={form.tax_rate}
                      onChange={(e) => patch("tax_rate", e.target.value)}
                    />
                    <Helper>Percentage amount (≥ 0). Used when tax is enabled.</Helper>
                  </div>
                </div>
              </ConfigCard>

              <ConfigCard
                id="membership"
                title="Membership"
                description="Duration, grace, and renewal-related policy flags."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">
                      Default membership duration (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      className={inputClassName()}
                      value={form.default_membership_duration_days}
                      onChange={(e) =>
                        patch(
                          "default_membership_duration_days",
                          Math.max(1, Number(e.target.value) || 1)
                        )
                      }
                    />
                    <Helper>Baseline length for custom flows (plans still use their own rules today).</Helper>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">
                      Grace period (days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={inputClassName()}
                      value={form.grace_period_days}
                      onChange={(e) =>
                        patch("grace_period_days", Math.max(0, Number(e.target.value) || 0))
                      }
                    />
                    <Helper>Optional days after expiry before treating access as lapsed.</Helper>
                  </div>
                  <ToggleRow
                    label="Block check-in when expired"
                    checked={form.block_checkin_when_expired}
                    onChange={(v) => patch("block_checkin_when_expired", v)}
                    helper="Recommended. Prevents check-in for expired memberships once enforcement uses this flag."
                  />
                  <ToggleRow
                    label="Allow renewal with outstanding balance"
                    checked={form.allow_renewal_with_outstanding_balance}
                    onChange={(v) => patch("allow_renewal_with_outstanding_balance", v)}
                    helper="If off, renewals should require a non-negative account balance (matches current API behavior once wired)."
                  />
                  <ToggleRow
                    label="Require payment before renewal"
                    checked={form.require_payment_before_renewal}
                    onChange={(v) => patch("require_payment_before_renewal", v)}
                    helper="Off by default; turn on to require recorded payment before extending membership."
                  />
                </div>
              </ConfigCard>

              <ConfigCard
                id="attendance"
                title="Attendance"
                description="Check-in session behavior and allowed entry channels."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <ToggleRow
                    label="Require checkout"
                    checked={form.require_checkout}
                    onChange={(v) => patch("require_checkout", v)}
                    helper="Expect a matching checkout to close each visit when visits are enforced."
                  />
                  <div>
                    <label className="text-xs font-medium text-[var(--muted)]">
                      Auto checkout (hours)
                    </label>
                    <input
                      type="number"
                      min={1}
                      className={inputClassName()}
                      value={form.auto_checkout_hours}
                      onChange={(e) =>
                        patch("auto_checkout_hours", Math.max(1, Number(e.target.value) || 1))
                      }
                    />
                    <Helper>Close open sessions automatically after this many hours (automation not yet connected).</Helper>
                  </div>
                  <ToggleRow
                    label="Allow duplicate check-in same day"
                    checked={form.allow_duplicate_checkin_same_day}
                    onChange={(v) => patch("allow_duplicate_checkin_same_day", v)}
                    helper="If off, only one visit per calendar day (when policy is enforced)."
                  />
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-[var(--muted)]">
                      Check-in sources
                    </label>
                    <input
                      className={inputClassName()}
                      value={form.checkin_sources_text}
                      onChange={(e) => patch("checkin_sources_text", e.target.value)}
                      placeholder="Desk, Staff, QR, Kiosk"
                    />
                    <Helper>
                      Comma-separated labels for allowed channels (default: Desk, Staff, QR, Kiosk).
                    </Helper>
                  </div>
                </div>
              </ConfigCard>
            </div>
          </div>
        </form>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-end p-4 md:pl-72">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/15 bg-[var(--surface)]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-md">
          {isDirty && (
            <span className="hidden text-xs text-amber-200/90 sm:inline">Unsaved changes</span>
          )}
          <button
            type="button"
            disabled={saving || !isDirty}
            onClick={() => formRef.current?.requestSubmit()}
            className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-500/20 transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-2xl border border-white/10 bg-gradient-to-b from-[var(--surface)] to-[var(--surface-soft)]/40 p-6 shadow-lg shadow-black/20"
    >
      <div className="mb-5 border-b border-white/10 pb-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  helper,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  helper: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)]/80 bg-[var(--background)]/40 p-4 sm:col-span-2">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[var(--border)] bg-[var(--background)] text-[var(--accent)] focus:ring-[var(--accent)]/40"
        />
        <span>
          <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
          <Helper>{helper}</Helper>
        </span>
      </label>
    </div>
  );
}
