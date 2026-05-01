import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth";

const base = () =>
  (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const GET_CACHE_TTL_MS = 15_000;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

function cacheKey(path: string): string {
  return `${base()}${path}`;
}

function readCached<T>(path: string): T | null {
  const key = cacheKey(path);
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return hit.value as T;
}

function writeCached(path: string, value: unknown) {
  responseCache.set(cacheKey(path), {
    expiresAt: Date.now() + GET_CACHE_TTL_MS,
    value,
  });
}

function invalidateCache() {
  responseCache.clear();
}

export type MemberPlan =
  | "monthly"
  | "quarterly"
  | "yearly"
  | "student"
  | "family"
  | "custom";
export type MembershipStatus = "active" | "expired" | "not_active";
export type PaymentStatus = "pending" | "paid" | "failed" | "overdue";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_money" | "other";
export type PaymentPurpose =
  | "membership"
  | "registration"
  | "personal_training"
  | "merchandise"
  | "penalty"
  | "other";

/** Recorded enrollment/dues status on the member (see member_payment_status in API). */
export type MemberPaymentStatus = "pending" | "paid";

export type Member = {
  id: number;
  id_number: string;
  first_name: string;
  last_name: string;
  /** Combined first + last (read-only from API). */
  full_name: string;
  email: string;
  phone: string;
  plan: MemberPlan;
  custom_plan_name: string;
  discount_percent: string;
  member_payment_status: MemberPaymentStatus;
  /** When payment was received (can be before membership start). */
  payment_received_on: string | null;
  start_date: string;
  end_date: string;
  membership_status: MembershipStatus;
  latest_payment_status: PaymentStatus | null;
  total_paid: string;
  total_charged: string;
  outstanding_amount: string;
  account_balance: string;
  balance_status: "credit" | "owes" | "settled";
  /** Open attendance session — present when list/detail includes attendance annotations. */
  is_checked_in?: boolean;
  open_checkin_id?: number | null;
  last_check_in_time?: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: number;
  member: number;
  member_name: string;
  member_id_number: string;
  amount: string;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  computed_status?: PaymentStatus;
  method: PaymentMethod;
  payment_date: string;
  due_date: string | null;
  invoice_number: string;
  notes: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardStats = {
  total_members: number;
  active_memberships: number;
  expired_memberships: number;
  not_active_memberships: number;
  monthly_revenue: string;
  yearly_revenue: string;
  unpaid_balances: string;
  expiring_soon: number;
  new_members_this_month: number;
  total_revenue: string;
  expiring_memberships: Member[];
  expiring_days: number;
};

export type MemberNote = {
  id: number;
  member: number;
  body: string;
  created_at: string;
  updated_at: string;
};

export type MembershipHistory = {
  id: number;
  member: number;
  event: "created" | "updated" | "assigned" | "renewed";
  plan: MemberPlan;
  start_date: string;
  end_date: string;
  payment_status: "pending" | "paid";
  created_at: string;
};

export type Checkin = {
  id: number;
  member: number;
  member_name: string;
  member_id_number: string;
  membership_status: MembershipStatus;
  source: "desk" | "staff" | "self";
  check_in_time: string;
  check_out_time: string | null;
  duration_seconds: number | null;
  is_in_gym: boolean;
  recorded_by_username: string | null;
};

export type ReportsData = {
  monthly_revenue: Array<{ label: string; revenue: number; new_members: number }>;
  attendance_week: Array<{ label: string; checkins: number }>;
  expired_members_count: number;
};

export type GymSettings = {
  gym_name: string;
  logo_url: string;
  currency: string;
  admin_display_name: string;
  timezone: string;
  date_format: string;
  registration_fee: string;
  default_payment_due_days: number;
  invoice_prefix: string;
  allow_credit_balance: boolean;
  allow_outstanding_balance: boolean;
  tax_enabled: boolean;
  tax_rate: string;
  default_membership_duration_days: number;
  grace_period_days: number;
  block_checkin_when_expired: boolean;
  allow_renewal_with_outstanding_balance: boolean;
  require_payment_before_renewal: boolean;
  require_checkout: boolean;
  auto_checkout_hours: number;
  allow_duplicate_checkin_same_day: boolean;
  checkin_sources: string[];
  updated_at: string;
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

async function refreshAccess(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  const res = await fetch(`${base()}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const data = (await res.json()) as { access: string };
  const nextRefresh = getRefreshToken();
  if (nextRefresh) setTokens(data.access, nextRefresh);
  return data.access;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  if (method === "GET" && !retried) {
    const cached = readCached<T>(path);
    if (cached !== null) return cached;
  }

  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${base()}${path}`, { ...options, headers });
  if (res.status === 401 && !retried) {
    const newAccess = await refreshAccess();
    if (newAccess) return apiFetch<T>(path, options, true);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { detail?: unknown; error?: unknown };
      const firstStr = (v: unknown): string | null => {
        if (typeof v === "string") return v;
        if (Array.isArray(v) && v.length > 0) return String(v[0]);
        return null;
      };
      const errMsg = firstStr(err.error);
      if (errMsg) detail = errMsg;
      else if (typeof err.detail === "string") detail = err.detail;
      else if (Array.isArray(err.detail))
        detail = err.detail.map((d) => JSON.stringify(d)).join(", ");
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T;
  if (method === "GET") {
    writeCached(path, data);
  } else {
    invalidateCache();
  }
  return data;
}

export async function login(username: string, password: string) {
  const res = await fetch(`${base()}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let message = "Login failed";
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { access: string; refresh: string };
  setTokens(data.access, data.refresh);
  invalidateCache();
}

export async function logout() {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await fetch(`${base()}/api/auth/logout/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
    } catch {
      /* still clear local session */
    }
  }
  clearTokens();
  invalidateCache();
}

export function membersQuery(params: {
  search?: string;
  phone?: string;
  status?: "" | MembershipStatus;
  plan?: "" | MemberPlan;
  payment_status?: "" | PaymentStatus | "none";
  expiry_before?: string;
  expiry_after?: string;
  limit?: number;
  offset?: number;
  ordering?: string;
}) {
  const q = new URLSearchParams();
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.phone?.trim()) q.set("phone", params.phone.trim());
  if (params.status) q.set("status", params.status);
  if (params.plan) q.set("plan", params.plan);
  if (params.payment_status) q.set("payment_status", params.payment_status);
  if (params.expiry_before) q.set("expiry_before", params.expiry_before);
  if (params.expiry_after) q.set("expiry_after", params.expiry_after);
  if (typeof params.limit === "number") q.set("limit", String(params.limit));
  if (typeof params.offset === "number") q.set("offset", String(params.offset));
  if (params.ordering?.trim()) q.set("ordering", params.ordering.trim());
  const suffix = q.toString();
  return `/api/members/${suffix ? `?${suffix}` : ""}`;
}

export async function fetchMembersPage(params: {
  search?: string;
  phone?: string;
  status?: "" | MembershipStatus;
  plan?: "" | MemberPlan;
  payment_status?: "" | PaymentStatus | "none";
  expiry_before?: string;
  expiry_after?: string;
  limit?: number;
  offset?: number;
  ordering?: string;
}) {
  return apiFetch<PaginatedResponse<Member>>(membersQuery(params));
}

export async function fetchDashboard(expiringDays = 30) {
  return apiFetch<DashboardStats>(
    `/api/dashboard/?expiring_days=${expiringDays}`
  );
}

export async function fetchMember(id: number) {
  return apiFetch<Member>(`/api/members/${id}/`);
}

export async function createMember(body: Record<string, unknown>) {
  return apiFetch<Member>("/api/members/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateMember(id: number, body: Record<string, unknown>) {
  return apiFetch<Member>(`/api/members/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteMember(id: number) {
  return apiFetch<void>(`/api/members/${id}/`, { method: "DELETE" });
}

export async function renewMember(
  id: number,
  plan?: MemberPlan,
  options?: { force_renew?: boolean }
) {
  const body: Record<string, unknown> = {};
  if (plan) body.plan = plan;
  if (options?.force_renew) body.force_renew = true;
  return apiFetch<Member>(`/api/members/${id}/renew/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function assignMembership(
  id: number,
  body: { plan: MemberPlan; start_date: string; end_date?: string | null }
) {
  return apiFetch<Member>(`/api/members/${id}/assign-membership/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function markMemberPaid(id: number) {
  return apiFetch<Member>(`/api/members/${id}/mark-paid/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function paymentsQuery(params: {
  member?: number;
  status?: PaymentStatus;
  search?: string;
  payment_date_from?: string;
  payment_date_to?: string;
  limit?: number;
  offset?: number;
  ordering?: string;
}) {
  const q = new URLSearchParams();
  if (params.member) q.set("member", String(params.member));
  if (params.status) q.set("status", params.status);
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.payment_date_from) q.set("payment_date_from", params.payment_date_from);
  if (params.payment_date_to) q.set("payment_date_to", params.payment_date_to);
  if (typeof params.limit === "number") q.set("limit", String(params.limit));
  if (typeof params.offset === "number") q.set("offset", String(params.offset));
  if (params.ordering?.trim()) q.set("ordering", params.ordering.trim());
  const suffix = q.toString();
  return `/api/payments/${suffix ? `?${suffix}` : ""}`;
}

export async function fetchPayments(params?: {
  member?: number;
  status?: PaymentStatus;
  search?: string;
  payment_date_from?: string;
  payment_date_to?: string;
}) {
  const path = paymentsQuery(params ?? {});
  return apiFetch<Payment[]>(path);
}

export async function fetchPaymentsPage(params?: {
  member?: number;
  status?: PaymentStatus;
  search?: string;
  payment_date_from?: string;
  payment_date_to?: string;
  limit?: number;
  offset?: number;
  ordering?: string;
}) {
  const path = paymentsQuery(params ?? {});
  return apiFetch<PaginatedResponse<Payment>>(path);
}

export async function createPayment(body: {
  member: number;
  amount: string;
  purpose: PaymentPurpose;
  status?: "pending" | "paid";
  mark_as_paid?: boolean;
  method?: PaymentMethod;
  payment_date: string;
  due_date?: string | null;
  notes?: string;
}) {
  return apiFetch<Payment>("/api/payments/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updatePayment(
  id: number,
  body: Partial<{
    amount: string;
    status: PaymentStatus;
    purpose: PaymentPurpose;
    method: PaymentMethod;
    payment_date: string;
    due_date: string | null;
    notes: string;
  }>
) {
  return apiFetch<Payment>(`/api/payments/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchMemberNotes(memberId: number) {
  return apiFetch<MemberNote[]>(`/api/member-notes/?member=${memberId}`);
}

export async function addMemberNote(memberId: number, body: string) {
  return apiFetch<MemberNote>("/api/member-notes/", {
    method: "POST",
    body: JSON.stringify({ member: memberId, body }),
  });
}

export async function fetchMembershipHistory(memberId: number) {
  return apiFetch<MembershipHistory[]>(`/api/membership-history/?member=${memberId}`);
}

export async function fetchCheckins(params?: {
  member?: number;
  visit_scope?: "" | "in_gym" | "today";
}) {
  const q = new URLSearchParams();
  if (params?.member) q.set("member", String(params.member));
  if (params?.visit_scope) q.set("visit_scope", params.visit_scope);
  const suffix = q.toString();
  return apiFetch<Checkin[]>(`/api/checkins/${suffix ? `?${suffix}` : ""}`);
}

export async function fetchCheckinsPage(params?: {
  member?: number;
  visit_scope?: "" | "in_gym" | "today";
  limit?: number;
  offset?: number;
  ordering?: string;
}) {
  const q = new URLSearchParams();
  if (params?.member) q.set("member", String(params.member));
  if (params?.visit_scope) q.set("visit_scope", params.visit_scope);
  if (typeof params?.limit === "number") q.set("limit", String(params.limit));
  if (typeof params?.offset === "number") q.set("offset", String(params.offset));
  if (params?.ordering?.trim()) q.set("ordering", params.ordering.trim());
  const suffix = q.toString();
  return apiFetch<PaginatedResponse<Checkin>>(`/api/checkins/${suffix ? `?${suffix}` : ""}`);
}

export async function quickCheckin(body: {
  member?: number;
  id_number?: string;
  search?: string;
  source?: "desk" | "staff" | "self";
}) {
  return apiFetch<Checkin>("/api/checkins/quick/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function quickCheckout(body: {
  member?: number;
  id_number?: string;
  search?: string;
}) {
  return apiFetch<Checkin>("/api/checkins/quick-checkout/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchReports() {
  return apiFetch<ReportsData>("/api/reports/");
}

export async function fetchSettings() {
  return apiFetch<GymSettings>("/api/settings/");
}

export async function updateSettings(body: Partial<GymSettings>) {
  return apiFetch<GymSettings>("/api/settings/", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
