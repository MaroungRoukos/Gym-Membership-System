"use client";

import { useRef, type InputHTMLAttributes } from "react";

function openDatePicker(input: HTMLInputElement | null) {
  if (!input) return;
  const withPicker = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof withPicker.showPicker === "function") {
    try {
      withPicker.showPicker();
      return;
    } catch {
      // Blocked in some cases (e.g. not from user gesture) — fall through
    }
  }
  input.focus();
  input.click();
}

const inputBaseClass =
  "date-input-poly min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 [color-scheme:dark] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "className"
> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Extra classes for the date input element. */
  inputClassName?: string;
  /** Screen reader + tooltip (default: "Choose date"). */
  openPickerLabel?: string;
  /**
   * If false, only the native `type="date"` control is shown (styled via globals).
   * Use when duplicate calendar affordances feel redundant next to browser chrome.
   */
  showPickerButton?: boolean;
};

function DateIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/** Native date input plus a control that opens the browser date picker (helps on Windows). */
export function DateInputWithCalendarButton({
  id,
  value,
  onChange,
  inputClassName = "",
  openPickerLabel = "Choose date",
  showPickerButton = true,
  required,
  autoComplete = "off",
  ...rest
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className={
        showPickerButton
          ? "flex min-w-0 items-stretch gap-2"
          : "w-full min-w-0"
      }
    >
      <input
        ref={ref}
        id={id}
        type="date"
        required={required}
        autoComplete={autoComplete}
        className={`${inputBaseClass} ${showPickerButton ? "flex-1" : "w-full"} ${inputClassName}`.trim()}
        value={value}
        onChange={onChange}
        {...rest}
      />
      {showPickerButton ? (
        <button
          type="button"
          onClick={() => openDatePicker(ref.current)}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          title={openPickerLabel}
          aria-label={openPickerLabel}
        >
          <DateIcon className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}
