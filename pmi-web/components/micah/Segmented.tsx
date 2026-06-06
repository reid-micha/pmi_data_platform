"use client";

/**
 * Controlled segmented control (toggle group). Client component — used inside
 * client "view" wrappers that hold toggle state and swap between pre-fetched
 * data slices passed down from the server page.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange?: (value: T) => void;
  size?: "md" | "sm";
}) {
  return (
    <div className={`segmented segmented--${size}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`segmented__btn ${o.value === value ? "is-active" : ""}`}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
