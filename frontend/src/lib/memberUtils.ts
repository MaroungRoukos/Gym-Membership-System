import type { MemberPlan } from "./api";

/** Today's date as YYYY-MM-DD in the user's local timezone (not UTC). */
export function localDateStringToday(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO date (YYYY-MM-DD) + N calendar days, local timezone. */
export function addCalendarDaysToIsoDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const pad = (n: number) => (n < 10 ? "0" : "") + n;
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Match Django `end_date_for_plan` (dateutil.relativedelta):
 * same day next month / +3 months / +1 year (e.g. Apr 4 + monthly → May 4).
 */
export function endDateForPlanFromStart(
  startDate: string,
  plan: MemberPlan
): string {
  const [y, m, d] = startDate.split("-").map((x) => parseInt(x, 10));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    throw new Error("Invalid date");
  }
  const dt = new Date(y, m - 1, d);
  if (plan === "monthly") dt.setMonth(dt.getMonth() + 1);
  else if (plan === "quarterly") dt.setMonth(dt.getMonth() + 3);
  else if (plan === "yearly") dt.setFullYear(dt.getFullYear() + 1);
  const pad = (n: number) => (n < 10 ? "0" : "") + n;
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Normalize toward +961######## for display/submit; server validates strictly. */
export function normalizeLbPhone(input: string): string {
  let s = input.replace(/[\s\-]/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    if (s.startsWith("961") && s.length === 11) s = "+" + s;
    else if (/^[0-9]{8}$/.test(s)) s = "+961" + s;
    else if (s.startsWith("0") && s.length === 9) s = "+961" + s.slice(1);
  }
  return s;
}

export const LB_PHONE_HINT =
  "Lebanon: +961 plus 8 digits (e.g. +96131234567)";
