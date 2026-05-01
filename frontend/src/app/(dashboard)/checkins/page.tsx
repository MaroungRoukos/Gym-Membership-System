"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import {
  PaginationControls,
  parseOffset,
  parsePageSize,
} from "@/components/PaginationControls";
import { StatusBadge } from "@/components/StatusBadge";
import {
  fetchCheckinsPage,
  fetchMember,
  fetchMembersPage,
  quickCheckin,
  quickCheckout,
  type Checkin,
  type Member,
  type MemberPlan,
  type MembershipStatus,
} from "@/lib/api";

type DeskTab = "recent" | "today" | "in_gym";

const SEARCH_DEBOUNCE_MS = 380;

function planLabel(plan: MemberPlan) {
  const labels: Record<MemberPlan, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
    student: "Student",
    family: "Family",
    custom: "Custom",
  };
  return labels[plan];
}

function membershipLabel(status: MembershipStatus) {
  if (status === "active") return "Active";
  if (status === "expired") return "Expired";
  return "Inactive";
}

function membershipBadgeTone(status: MembershipStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "expired") return "warning";
  return "danger";
}

function formatDurationWithDays(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const sec = Math.max(0, Math.floor(seconds));
  const days = Math.floor(sec / 86400);
  const rest = sec % 86400;
  const h = Math.floor(rest / 3600);
  const m = Math.floor((rest % 3600) / 60);
  const s = rest % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (days === 0 && h === 0 && m === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

/** Local timestamp + Intl relative label (recent check-in / checkout). */
function formatDateTimeParts(iso: string): { local: string; relative: string } {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    return { local: "—", relative: "" };
  }
  const d = new Date(t);
  const local = d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  let relative = "";
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const diffSecRaw = (d.getTime() - Date.now()) / 1000;
    const magnitude = Math.abs(diffSecRaw);

    let unit: Intl.RelativeTimeFormatUnit = "second";
    let value = Math.round(diffSecRaw);
    if (magnitude >= 60) {
      unit = "minute";
      value = Math.round(diffSecRaw / 60);
    }
    if (magnitude >= 3600) {
      unit = "hour";
      value = Math.round(diffSecRaw / 3600);
    }
    if (magnitude >= 86400) {
      unit = "day";
      value = Math.round(diffSecRaw / 86400);
    }
    if (magnitude >= 604800) {
      unit = "week";
      value = Math.round(diffSecRaw / 604800);
    }
    relative = rtf.format(value, unit);
  } catch {
    relative = "";
  }

  return { local, relative };
}

function liveElapsedSeconds(checkInIso: string): number {
  const t = Date.parse(checkInIso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

function VisitTimestamp({ iso }: { iso: string | null }) {
  if (!iso) {
    return <span className="text-[var(--muted)]">—</span>;
  }
  const { local, relative } = formatDateTimeParts(iso);
  return (
    <div className="leading-snug">
      <div>{local}</div>
      {relative ? (
        <div className="text-[0.65rem] text-[var(--muted)]">{relative}</div>
      ) : null}
    </div>
  );
}

const BROWSE_PAGE_SIZE = 60;

type BrowseSort = "alpha" | "recent";

async function fetchMembersSearchFiltered(query: string): Promise<{ results: Member[]; total: number }> {
  const page = await fetchMembersPage({
    search: query.trim(),
    limit: 28,
    ordering: "first_name",
  });
  return { results: page.results, total: page.count };
}

async function fetchMembersBrowseChunk(
  sort: BrowseSort,
  offset: number,
): Promise<{ results: Member[]; total: number }> {
  const page = await fetchMembersPage({
    limit: BROWSE_PAGE_SIZE,
    offset,
    ordering: sort === "recent" ? "-updated_at" : "first_name",
  });
  return { results: page.results, total: page.count };
}

export default function CheckinsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchGeneration = useRef(0);
  /** DOM timer handle (Node types overload `setTimeout` differently from `window`). */
  const blurCloseTimer = useRef<number | null>(null);
  const memberInputRef = useRef<HTMLInputElement>(null);
  const deskFormRef = useRef<HTMLFormElement>(null);

  const [visits, setVisits] = useState<Checkin[]>([]);
  /** Unified combobox: name, member ID, or phone (same as API `search`). */
  const [memberQuery, setMemberQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deskHint, setDeskHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deskTab, setDeskTab] = useState<DeskTab>(
    () => (searchParams.get("desk") as DeskTab | null) ?? "recent",
  );
  const [limit, setLimit] = useState(() => parsePageSize(searchParams.get("limit")));
  const [offset, setOffset] = useState(() => parseOffset(searchParams.get("offset")));
  const ordering = searchParams.get("ordering") ?? "-check_in_time";
  const [totalCount, setTotalCount] = useState(0);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [browseSort, setBrowseSort] = useState<BrowseSort>("alpha");
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const tabVisitScope = useMemo(() => {
    if (deskTab === "in_gym") return "in_gym" as const;
    if (deskTab === "today") return "today" as const;
    return "";
  }, [deskTab]);

  /** Keep results fresh against GET cache TTL when selection exists. */
  const refreshAttendanceFields = useCallback(async (memberId: number) => {
    try {
      const fresh = await fetchMember(memberId);
      setSelectedMember(fresh);
    } catch {
      /* keep prior selection visible */
    }
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;

    setSearchLoading(true);
    setSearchError(null);
    const mine = ++searchGeneration.current;
    const trimmed = memberQuery.trim();
    const delay = trimmed ? SEARCH_DEBOUNCE_MS : 80;

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          if (trimmed) {
            const { results, total } = await fetchMembersSearchFiltered(memberQuery);
            if (mine !== searchGeneration.current) return;
            setSearchResults(results);
            setBrowseTotal(total);
          } else {
            const { results, total } = await fetchMembersBrowseChunk(browseSort, 0);
            if (mine !== searchGeneration.current) return;
            setSearchResults(results);
            setBrowseTotal(total);
          }
        } catch (e) {
          if (mine !== searchGeneration.current) return;
          setSearchError(e instanceof Error ? e.message : "Failed to load members");
          setSearchResults([]);
          setBrowseTotal(0);
        } finally {
          if (mine === searchGeneration.current) setSearchLoading(false);
        }
      })();
    }, delay);

    return () => window.clearTimeout(t);
  }, [pickerOpen, memberQuery, browseSort]);

  async function appendBrowsePage() {
    if (memberQuery.trim() !== "" || browseLoadingMore || !pickerOpen) return;
    const loaded = searchResults.length;
    if (browseTotal > 0 && loaded >= browseTotal) return;

    setBrowseLoadingMore(true);
    try {
      const { results } = await fetchMembersBrowseChunk(browseSort, loaded);
      if (results.length === 0) return;
      setSearchResults((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const next = [...prev];
        for (const m of results) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            next.push(m);
          }
        }
        return next;
      });
    } catch {
      /* keep list */
    } finally {
      setBrowseLoadingMore(false);
    }
  }

  function clearPickerBlurTimer() {
    if (blurCloseTimer.current) {
      window.clearTimeout(blurCloseTimer.current);
      blurCloseTimer.current = null;
    }
  }

  function openBrowseRoster(kind: BrowseSort) {
    clearPickerBlurTimer();
    setDeskHint(null);
    setBrowseSort(kind);
    setMemberQuery("");
    setPickerOpen(true);
    queueMicrotask(() => memberInputRef.current?.focus());
  }

  function togglePickerFromChevron() {
    clearPickerBlurTimer();
    if (pickerOpen) {
      setPickerOpen(false);
    } else {
      setPickerOpen(true);
      queueMicrotask(() => memberInputRef.current?.focus());
    }
  }

  function scrollDeskPanelIntoView() {
    queueMicrotask(() =>
      deskFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCheckinsPage({
        limit,
        offset,
        ordering,
        visit_scope: tabVisitScope || undefined,
      });
      setVisits(data.results);
      setTotalCount(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load visits");
      setVisits([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, ordering, tabVisitScope]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("ordering", ordering);
    params.set("desk", deskTab);
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [limit, offset, ordering, pathname, router, searchParams, deskTab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (totalCount > 0 && offset >= totalCount) {
      setOffset(Math.max(0, Math.floor((totalCount - 1) / limit) * limit));
    }
  }, [limit, offset, totalCount]);

  const cancelBlurClose = clearPickerBlurTimer;

  const scheduleClosePicker = useCallback(() => {
    clearPickerBlurTimer();
    blurCloseTimer.current = window.setTimeout(() => setPickerOpen(false), 200);
  }, []);

  function openPicker() {
    clearPickerBlurTimer();
    setPickerOpen(true);
  }

  const selectionHasQuery = !!memberQuery.trim();

  async function handlePick(row: Member) {
    cancelBlurClose();
    setDeskHint(null);
    setError(null);
    setMessage(null);
    setPickerOpen(false);
    try {
      const fresh = await fetchMember(row.id);
      setSelectedMember(fresh);
    } catch {
      setSelectedMember(row);
    }
    scrollDeskPanelIntoView();
  }

  /** Use a recent-visit row to load the member at the desk (check-in / checkout). */
  async function selectMemberFromVisit(memberId: number) {
    cancelBlurClose();
    setDeskHint(null);
    setMessage(null);
    setPickerOpen(false);
    try {
      const fresh = await fetchMember(memberId);
      setSelectedMember(fresh);
      setError(null);
    } catch {
      setDeskHint("Could not load that member. Use Browse / search above, then try again.");
    }
    scrollDeskPanelIntoView();
  }

  async function refreshAfterAttendance(memberId: number) {
    await load();
    await refreshAttendanceFields(memberId);
  }

  const isInGym = selectedMember?.is_checked_in === true;
  const selectedSessionCheckInParts =
    selectedMember?.last_check_in_time != null
      ? formatDateTimeParts(selectedMember.last_check_in_time)
      : null;

  const actionDisabled =
    submitting ||
    !selectedMember ||
    (!isInGym && selectedMember.membership_status !== "active");

  function actionLabel(): string {
    if (submitting) return isInGym ? "Checking out…" : "Checking in…";
    if (!selectedMember) return "Select member";
    if (isInGym) return "Check out";
    if (selectedMember.membership_status !== "active") return "Check-in blocked";
    return "Check in";
  }

  async function performAttendanceAction(member: Member) {
    setSubmitting(true);
    setError(null);
    setDeskHint(null);
    setMessage(null);
    try {
      if (member.is_checked_in === true) {
        await quickCheckout({ member: member.id });
        setMessage("Checked out successfully.");
      } else {
        await quickCheckin({
          member: member.id,
          source: "desk",
        });
        setMessage("Checked in successfully.");
      }
      await refreshAfterAttendance(member.id);
      setNowTick(Date.now());
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Enter / primary submit: narrow to one result only when picking or changing selection.
   * If the lone result is already the selected member, run check-in/out (fixes Check out appearing to do nothing).
   */
  function handleDeskEnterFlow() {
    setDeskHint(null);
    setError(null);

    if (searchResults.length === 1) {
      const only = searchResults[0];
      if (!selectedMember || selectedMember.id !== only.id) {
        void handlePick(only);
        return;
      }
    }
    if (!selectedMember) {
      setDeskHint("Select a member first.");
      return;
    }
    if (submitting || actionDisabled) return;
    void performAttendanceAction(selectedMember);
  }

  function deskFormSubmit(e: FormEvent) {
    e.preventDefault();
    handleDeskEnterFlow();
  }

  function onDeskAreaKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    setPickerOpen(false);
    setDeskHint(null);
  }

  function clearDeskSelection() {
    setSelectedMember(null);
    setDeskHint(null);
    setMessage(null);
    setError(null);
    setPickerOpen(false);
  }

  const previewEligible =
    !!selectedMember &&
    selectedMember.membership_status === "active" &&
    selectedMember.is_checked_in !== true;

  const previewExpired =
    !!selectedMember && selectedMember.membership_status !== "active" && !isInGym;

  function previewCue(): string | null {
    if (!selectedMember) return null;
    if (previewEligible) return "Eligible for check-in.";
    if (isInGym) return "Currently in gym. You can check this member out.";
    if (previewExpired) {
      return selectedMember.membership_status === "expired"
        ? "Membership expired. Check-in is blocked."
        : "Membership inactive. Check-in is blocked.";
    }
    return null;
  }

  const browseMode = pickerOpen && !memberQuery.trim();
  const searchEmptyConfirmed =
    selectionHasQuery && !searchLoading && !searchError && searchResults.length === 0;

  function showSuggestionPanel() {
    return (
      pickerOpen &&
      (browseMode ||
        searchLoading ||
        !!searchError ||
        searchResults.length > 0 ||
        searchEmptyConfirmed)
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Attendance"
        title="Front-desk attendance console"
        description="Use Browse A–Z or Browse recent to pick from the roster without typing, or search by name, ID, or phone — then check in or out."
        imageSrc="/images/gym-checkins.jpg"
      />

      {error && !submitting ? <Alert type="error">{error}</Alert> : null}
      {deskHint ? <Alert type="info">{deskHint}</Alert> : null}
      {message && <Alert type="success">{message}</Alert>}

      <form
        ref={deskFormRef}
        onSubmit={deskFormSubmit}
        onKeyDown={onDeskAreaKeyDown}
        className="space-y-5 rounded-2xl border border-[var(--border)]/80 bg-[var(--surface)]/30 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur scroll-mt-20"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="relative min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="member-combobox-input" className="text-xs font-medium text-[var(--muted)]">
                Member roster
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => openBrowseRoster("alpha")}
                  className="rounded-lg border border-white/14 bg-white/[0.04] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-cyan-100/95 transition hover:border-cyan-500/35 hover:bg-cyan-500/10"
                >
                  Browse A–Z
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => openBrowseRoster("recent")}
                  className="rounded-lg border border-white/14 bg-white/[0.04] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-200 transition hover:border-white/25 hover:bg-white/[0.07]"
                >
                  Recent
                </button>
              </div>
            </div>
            <p className="mt-1 text-[0.7rem] text-[var(--muted)]">
              Open the list with the arrows or Browse — or filter the list by typing a name, ID, or phone.
            </p>
            <div className="relative mt-1.5">
              <input
                ref={memberInputRef}
                id="member-combobox-input"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)]/55 py-2.5 pl-3.5 pr-11 text-sm text-[var(--foreground)] outline-none ring-cyan-500/30 placeholder:text-[var(--muted)] focus-visible:ring-2"
                placeholder="Type to narrow the roster, or browse using the buttons above…"
                value={memberQuery}
                onFocus={openPicker}
                onBlur={scheduleClosePicker}
                onChange={(e) => {
                  openPicker();
                  setMemberQuery(e.target.value);
                }}
                role="combobox"
                aria-label="Find member — browse roster or search by name ID or phone"
                aria-expanded={pickerOpen}
                aria-autocomplete="list"
                aria-controls="member-picker-listbox"
                autoComplete="off"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={pickerOpen ? "Close member list" : "Open member roster"}
                onMouseDown={(e) => {
                  e.preventDefault();
                  togglePickerFromChevron();
                }}
                className={`absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center rounded-md p-1 text-[var(--muted)] transition hover:bg-white/10 hover:text-[var(--foreground)] ${pickerOpen ? "rotate-180" : ""}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5H7z" />
                </svg>
              </button>
            </div>

            {showSuggestionPanel() ? (
              <div
                id="member-picker-listbox"
                className="absolute left-0 right-0 top-full z-[50] mt-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1419]/96 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md"
                onMouseDown={(e) => e.preventDefault()}
                role="listbox"
              >
                {browseMode && !searchLoading ? (
                  <div className="border-b border-white/[0.06] px-3 py-2.5">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setBrowseSort("alpha")}
                        className={`flex-1 rounded-lg px-3 py-2 text-center text-[0.72rem] font-semibold transition ${
                          browseSort === "alpha"
                            ? "bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-400/40"
                            : "bg-white/[0.04] text-[var(--muted)] hover:bg-white/[0.08]"
                        }`}
                      >
                        A–Z roster
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setBrowseSort("recent")}
                        className={`flex-1 rounded-lg px-3 py-2 text-center text-[0.72rem] font-semibold transition ${
                          browseSort === "recent"
                            ? "bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-400/40"
                            : "bg-white/[0.04] text-[var(--muted)] hover:bg-white/[0.08]"
                        }`}
                      >
                        Recently updated
                      </button>
                    </div>
                    <p className="mt-2 px-1 text-[0.68rem] leading-relaxed text-[var(--muted)]">
                      Tap a member to select. Use &ldquo;Load more&rdquo; for the full directory.
                    </p>
                  </div>
                ) : null}
                {!browseMode && !searchLoading ? (
                  <div className="border-b border-white/[0.06] px-4 py-2 text-[0.68rem] text-[var(--muted)]">
                    Filtered by search — clear the field to browse the full roster again.
                  </div>
                ) : null}

                {searchLoading ? (
                  <div className="px-4 py-3 text-sm text-[var(--muted)]">{browseMode ? "Loading…" : "Searching…"}</div>
                ) : searchError ? (
                  <div className="border-t border-white/[0.06] px-4 py-3 text-sm text-rose-200">
                    {searchError}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-[var(--muted)]">No members found.</div>
                ) : (
                  <ul className="max-h-[min(22rem,calc(100vh-220px))] divide-y divide-white/[0.06] overflow-y-auto">
                    {searchResults.map((row) => {
                      const attendanceIn = row.is_checked_in === true;
                      const isSelectedPick = selectedMember?.id === row.id;
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelectedPick}
                            className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition hover:bg-white/[0.05] ${isSelectedPick ? "border-l-2 border-l-cyan-400 bg-cyan-500/[0.07]" : "border-l-2 border-l-transparent"
                              }`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void handlePick(row)}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                              <div>
                                <p className="text-sm font-semibold text-[var(--foreground)]">
                                  {row.full_name}
                                </p>
                                <p className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">
                                  {row.id_number ?? "—"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge label={membershipLabel(row.membership_status)} tone={membershipBadgeTone(row.membership_status)} />
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${attendanceIn
                                    ? "bg-cyan-500/18 text-cyan-100 ring-cyan-400/35"
                                    : "bg-slate-500/12 text-slate-200 ring-white/14"
                                  }`}
                                >
                                  {attendanceIn ? "In gym" : "Not checked in"}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-[var(--muted)]">
                              Phone <span className="font-mono text-[var(--foreground)]">{row.phone || "—"}</span>
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {browseMode && !searchLoading && !searchError && browseTotal > searchResults.length ? (
                  <div className="border-t border-white/[0.06] bg-white/[0.02] p-2">
                    <button
                      type="button"
                      disabled={browseLoadingMore}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void appendBrowsePage()}
                      className="w-full rounded-xl border border-white/12 py-2.5 text-center text-[0.8rem] font-medium text-cyan-100/95 transition hover:border-cyan-500/35 hover:bg-cyan-500/10 disabled:cursor-wait disabled:opacity-50"
                    >
                      {browseLoadingMore
                        ? "Loading more…"
                        : `Load more (${searchResults.length} of ${browseTotal})`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:w-[11.5rem] sm:justify-start sm:pt-7">
            <button
              type="button"
              onClick={() => clearDeskSelection()}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-center text-[0.8125rem] font-medium text-[var(--muted)] transition hover:border-white/18 hover:bg-white/[0.04] hover:text-[var(--foreground)]"
              disabled={!selectedMember}
            >
              Clear selection
            </button>
            <button
              type="submit"
              disabled={actionDisabled}
              className="rounded-xl bg-cyan-500/90 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-45"
              aria-busy={submitting}
            >
              {actionLabel()}
            </button>
          </div>
        </div>

        {!selectionHasQuery && !selectedMember ? (
          <p className="text-[0.72rem] leading-relaxed text-[var(--muted)]">
            Use <span className="text-[var(--foreground)]/90">Browse A–Z</span> or{" "}
            <span className="text-[var(--foreground)]/90">Recent</span> to open the roster without typing, or focus the field and type to filter. Check-in/out uses only the member you select.
          </p>
        ) : (
          <p className="text-[0.72rem] leading-relaxed text-[var(--muted)]">
            Enter: if exactly one row matches your search it is selected first; otherwise, with someone selected it runs the highlighted action ({isInGym ? "checkout" : selectedMember?.membership_status === "active" ? "check-in" : "disabled"}).
            {searchEmptyConfirmed ? (
              <>
                {" "}
                <span className="text-[var(--foreground)]/90">No members found.</span>
              </>
            ) : null}
          </p>
        )}

        {selectedMember ? (
          <div className="rounded-2xl border border-[var(--border)]/70 bg-[var(--background)]/40 p-4 shadow-inner shadow-black/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                  {selectedMember.full_name}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                  {selectedMember.id_number ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={membershipLabel(selectedMember.membership_status)}
                  tone={membershipBadgeTone(selectedMember.membership_status)}
                />
                {isInGym ? (
                  <span className="inline-flex rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-cyan-100">
                    In gym
                  </span>
                ) : (
                  <span className="inline-flex rounded-lg border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-200">
                    Not checked in
                  </span>
                )}
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
                <dt className="text-[var(--muted)]">Phone</dt>
                <dd className="font-mono text-[0.8125rem]">{selectedMember.phone || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
                <dt className="text-[var(--muted)]">Plan</dt>
                <dd className="capitalize">{planLabel(selectedMember.plan)}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
                <dt className="text-[var(--muted)]">Membership status</dt>
                <dd>{membershipLabel(selectedMember.membership_status)}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
                <dt className="text-[var(--muted)]">Current visit</dt>
                <dd className={isInGym ? "font-medium text-cyan-100" : undefined}>
                  {isInGym ? "Currently checked in" : "Not currently checked in"}
                </dd>
              </div>
            </dl>
            {isInGym && selectedMember.last_check_in_time && selectedSessionCheckInParts ? (
              <div className="mt-3 space-y-1 text-xs">
                <p className="text-[var(--muted)]">
                  Recent check-in:&nbsp;
                  <span className="text-[var(--foreground)]">{selectedSessionCheckInParts.local}</span>
                  {selectedSessionCheckInParts.relative ? (
                    <span className="text-[var(--muted)]"> ({selectedSessionCheckInParts.relative})</span>
                  ) : null}
                </p>
                <p className="font-mono text-[0.7rem] text-cyan-100/95">
                  Session length:&nbsp;
                  {/* nowTick keeps live duration updating */}
                  {(() => {
                    void nowTick;
                    return formatDurationWithDays(
                      liveElapsedSeconds(selectedMember.last_check_in_time),
                    );
                  })()}
                  &nbsp;<span className="font-sans font-normal text-[var(--muted)]">(updates live)</span>
                </p>
              </div>
            ) : isInGym ? (
              <p className="mt-3 text-xs text-[var(--muted)]">Current session details are syncing…</p>
            ) : (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Most recent checkout and durations appear in Recent visits below.
              </p>
            )}

            {previewCue() ? (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${previewEligible
                  ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-50"
                  : isInGym
                    ? "border-cyan-500/30 bg-cyan-500/[0.07] text-cyan-50"
                    : "border-amber-400/35 bg-amber-500/[0.08] text-amber-100"
                }`}
              >
                <p>{previewCue()}</p>
                {!previewEligible && !isInGym ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href="/payments"
                      className="rounded-lg border border-amber-300/35 px-3 py-1 text-xs font-medium text-amber-50 hover:bg-amber-500/10"
                    >
                      Record payment
                    </Link>
                    <Link
                      href="/membership"
                      className="rounded-lg border border-amber-300/35 px-3 py-1 text-xs font-medium text-amber-50 hover:bg-amber-500/10"
                    >
                      Renew membership
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "recent" as DeskTab, label: "Recent visits" },
            { id: "today" as DeskTab, label: "Today" },
            { id: "in_gym" as DeskTab, label: "In gym now" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setDeskTab(t.id);
              setOffset(0);
            }}
            className={`rounded-xl border px-3.5 py-1.5 text-xs font-medium transition ${
              deskTab === t.id
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border)]/90 hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading visits…</p>
      ) : (
        <div className="space-y-2">
          <p className="text-[0.75rem] text-[var(--muted)]">
            <span className="text-[var(--foreground)]">Tip:</span> click any row to load that member in the desk panel above for checkout or another check-in.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]/80 bg-[var(--surface)]/20">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-[var(--border)]/70 bg-[var(--background)]/40 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">
                  Check-in
                  <span className="mt-1 block font-sans text-[0.55rem] font-normal lowercase tracking-normal opacity-85">
                    time · recent
                  </span>
                </th>
                <th className="px-4 py-3 font-medium">
                  Checkout
                  <span className="mt-1 block font-sans text-[0.55rem] font-normal lowercase tracking-normal opacity-85">
                    time · recent
                  </span>
                </th>
                <th className="px-4 py-3 font-medium">
                  Duration
                  <span className="mt-1 block font-sans text-[0.55rem] font-normal lowercase tracking-normal opacity-85">
                    days · h · min
                  </span>
                </th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Member ID</th>
                <th className="px-4 py-3 font-medium">Membership</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/60">
              {visits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10">
                    <EmptyState
                      title="No visits in this view"
                      message="Adjust filters or check someone in from the desk panel above."
                      imageSrc="/images/gym-checkins.jpg"
                    />
                  </td>
                </tr>
              ) : (
                visits.map((v) => {
                  void nowTick;
                  const secs =
                    v.duration_seconds !== null && v.duration_seconds !== undefined
                      ? v.duration_seconds
                      : v.is_in_gym
                        ? liveElapsedSeconds(v.check_in_time)
                        : null;
                  const selectedFromTable = selectedMember?.id === v.member;
                  return (
                    <tr
                      key={v.id}
                      tabIndex={0}
                      role="button"
                      title="Load this member at the desk"
                      aria-label={`Load ${v.member_name} at desk for check-in or check-out`}
                      onClick={() => void selectMemberFromVisit(v.member)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void selectMemberFromVisit(v.member);
                        }
                      }}
                      className={`outline-none ring-cyan-500/40 transition-colors focus-visible:bg-[var(--background)]/40 focus-visible:ring-2 ${
                        selectedFromTable
                          ? "cursor-pointer bg-cyan-500/[0.12] ring-1 ring-inset ring-cyan-400/30 hover:bg-cyan-500/[0.16]"
                          : "cursor-pointer hover:bg-[var(--background)]/45"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-[var(--foreground)]">
                        <VisitTimestamp iso={v.check_in_time} />
                      </td>
                      <td className="px-4 py-2.5 text-[var(--foreground)]">
                        <VisitTimestamp iso={v.check_out_time} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--foreground)]">
                        {v.is_in_gym ? (
                          <span className="inline-flex flex-col gap-0.5">
                            <span>{formatDurationWithDays(secs ?? 0)}</span>
                            <span className="font-sans text-[0.65rem] font-normal normal-case tracking-normal text-[var(--muted)]">
                              Live visit
                            </span>
                          </span>
                        ) : (
                          formatDurationWithDays(secs)
                        )}
                      </td>
                      <td className="px-4 py-2.5">{v.member_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{v.member_id_number}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge
                            label={membershipLabel(v.membership_status)}
                            tone={membershipBadgeTone(v.membership_status)}
                          />
                          {v.is_in_gym ? (
                            <span className="rounded-md border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-[0.62rem] font-semibold text-cyan-100">
                              In gym
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={v.source.replace("_", " ")} tone="neutral" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <PaginationControls
        noun="visits"
        count={totalCount}
        limit={limit}
        offset={offset}
        loading={loading}
        onLimitChange={(value) => {
          setLimit(value);
          setOffset(0);
        }}
        onOffsetChange={setOffset}
      />
    </div>
  );
}
