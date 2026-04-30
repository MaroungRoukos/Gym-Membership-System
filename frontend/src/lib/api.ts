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

export type MemberPlan = "monthly" | "quarterly" | "yearly";
export type MembershipStatus = "active" | "expired" | "not_active";
export type PaymentStatus = "pending" | "paid" | "failed";

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
  member_payment_status: MemberPaymentStatus;
  /** When payment was received (can be before membership start). */
  payment_received_on: string | null;
  start_date: string;
  end_date: string;
  membership_status: MembershipStatus;
  latest_payment_status: PaymentStatus | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: number;
  member: number;
  member_name: string;
  member_id_number: string;
  amount: string;
  status: PaymentStatus;
  description: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardStats = {
  total_members: number;
  active_memberships: number;
  expired_memberships: number;
  total_revenue: string;
  expiring_memberships: Member[];
  expiring_days: number;
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
      const err = (await res.json()) as { detail?: unknown };
      if (typeof err.detail === "string") detail = err.detail;
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
  status?: "" | MembershipStatus;
  plan?: "" | MemberPlan;
  payment_status?: "" | PaymentStatus | "none";
}) {
  const q = new URLSearchParams();
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.status) q.set("status", params.status);
  if (params.plan) q.set("plan", params.plan);
  if (params.payment_status) q.set("payment_status", params.payment_status);
  const suffix = q.toString();
  return `/api/members/${suffix ? `?${suffix}` : ""}`;
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

export async function renewMember(id: number, plan?: MemberPlan) {
  const body = plan ? { plan } : {};
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
}) {
  const q = new URLSearchParams();
  if (params.member) q.set("member", String(params.member));
  if (params.status) q.set("status", params.status);
  const suffix = q.toString();
  return `/api/payments/${suffix ? `?${suffix}` : ""}`;
}

export async function fetchPayments(params?: {
  member?: number;
  status?: PaymentStatus;
}) {
  const path = paymentsQuery(params ?? {});
  return apiFetch<Payment[]>(path);
}

export async function createPayment(body: {
  member: number;
  amount: string;
  status?: PaymentStatus;
  description?: string;
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
    description: string;
  }>
) {
  return apiFetch<Payment>(`/api/payments/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
