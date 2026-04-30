"use client";

const PAGE_SIZES = [10, 20, 50, 100] as const;

export function PaginationControls({
  limit,
  offset,
  count,
  loading,
  noun,
  onLimitChange,
  onOffsetChange,
}: {
  limit: number;
  offset: number;
  count: number;
  loading: boolean;
  noun: string;
  onLimitChange: (value: number) => void;
  onOffsetChange: (value: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const start = count === 0 ? 0 : offset + 1;
  const end = count === 0 ? 0 : Math.min(offset + limit, count);
  const disablePrev = loading || offset === 0;
  const disableNext = loading || offset + limit >= count;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <label className="text-xs text-[var(--muted)]">
          Page size
          <select
            className="ml-1 rounded-md border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--muted)]">
          Showing {start}-{end} of {count.toLocaleString()} {noun}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disablePrev}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-xs text-[var(--muted)]">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={disableNext}
          onClick={() => onOffsetChange(offset + limit)}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function parsePageSize(raw: string | null): number {
  const value = Number(raw);
  return PAGE_SIZES.includes(value as (typeof PAGE_SIZES)[number]) ? value : 20;
}

export function parseOffset(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
