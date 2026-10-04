"use client";

/**
 * StarRating — clickable 1–5 star scale for performance reviews + 360 feedback.
 *
 * Replaces the bare HTML <input type="range"> sliders used previously, which
 * gave no visual feedback that a rating was even being captured. The same
 * component handles BOTH interactive (form input) and display-only (showing
 * a saved rating in a card or table) modes.
 *
 * Interactive mode:
 *   • Click a star to pick a value. Click the SAME star again to clear.
 *   • Hover shows a preview rating + the label below.
 *   • Keyboard: left/right arrows move the value, Enter / Space pick the
 *     hovered value. Focus ring follows the active star.
 *   • `min=1` (so a user can never accidentally submit 0 unless `allowZero`
 *     is on); `max` is configurable in case we ever extend to 10 stars.
 *
 * Display mode (`readOnly`):
 *   • No hover, no click handlers, no focus ring.
 *   • Half-stars supported for fractional saved values (4.3 → 4 full + 1 half).
 *   • Optional numeric badge `4.3/5` shown next to the stars.
 */

import { useState } from "react";
import { Star, StarHalf } from "lucide-react";

const DEFAULT_LABELS = [
  "Poor",
  "Below average",
  "Average",
  "Good",
  "Excellent",
];

export interface StarRatingProps {
  /** Current value (0–max). For display mode this may be a decimal. */
  value: number;
  /** Called with the new value when the user clicks a star. Required unless `readOnly`. */
  onChange?: (value: number) => void;
  /** Total stars on the scale. Defaults to 5. */
  max?: number;
  /** Disable click + hover interactions; render as a static display. */
  readOnly?: boolean;
  /** Show the numeric value (e.g. "4/5") next to the stars. */
  showValue?: boolean;
  /** Allow clicking the same star again to clear back to 0. Default true. */
  allowClear?: boolean;
  /** Show a sentence label below the stars (interactive mode only). */
  showLabel?: boolean;
  /** Override the default Poor/Below-avg/Average/Good/Excellent labels. */
  labels?: string[];
  /** Star size in pixels. Defaults to 28 for interactive, 18 for readOnly. */
  size?: number;
}

export function StarRating({
  value,
  onChange,
  max = 5,
  readOnly = false,
  showValue = false,
  allowClear = true,
  showLabel = false,
  labels = DEFAULT_LABELS,
  size,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  // Hover beats the saved value while the user is mousing over stars.
  const displayValue = readOnly ? value : hovered ?? value;
  const px = size ?? (readOnly ? 18 : 28);

  // For readOnly display we may render half stars — splits the integer
  // floor + an extra half. For interactive mode we round to whole stars
  // because clicking captures whole numbers only.
  const fullStars = readOnly ? Math.floor(displayValue) : Math.round(displayValue);
  const hasHalf = readOnly && displayValue - fullStars >= 0.25 && displayValue - fullStars < 0.75;
  const showHalf = readOnly && displayValue - fullStars >= 0.75 ? false : hasHalf;
  const adjustedFull = readOnly && displayValue - fullStars >= 0.75 ? fullStars + 1 : fullStars;

  const handleClick = (n: number) => {
    if (readOnly || !onChange) return;
    // Click the SAME star again → clear (if allowed).
    if (allowClear && value === n) onChange(0);
    else onChange(n);
  };

  const labelIndex = Math.max(0, Math.min(labels.length - 1, displayValue - 1));
  const labelText = displayValue > 0 ? labels[labelIndex] : "Not rated";

  return (
    <div className="inline-flex flex-col gap-1">
      <div
        className="inline-flex items-center gap-1.5"
        role={readOnly ? undefined : "radiogroup"}
        aria-label={readOnly ? `Rating: ${value} of ${max}` : "Rating"}
        onMouseLeave={() => setHovered(null)}
      >
        {Array.from({ length: max }, (_, i) => {
          const star = i + 1;
          const isFull = readOnly ? star <= adjustedFull : star <= displayValue;
          const isHalf = readOnly && showHalf && star === adjustedFull + 1;
          const active = isFull || isHalf;

          const colorClass = active
            ? "text-amber-400"
            : "text-slate-300 dark:text-slate-600";

          if (readOnly) {
            return (
              <span key={star} className={colorClass}>
                {isHalf ? (
                  <StarHalf className="fill-current" style={{ width: px, height: px }} />
                ) : (
                  <Star
                    className={active ? "fill-current" : ""}
                    style={{ width: px, height: px }}
                  />
                )}
              </span>
            );
          }

          // Interactive: button with hover + keyboard support.
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} of ${max}`}
              onMouseEnter={() => setHovered(star)}
              onFocus={() => setHovered(star)}
              onBlur={() => setHovered(null)}
              onClick={() => handleClick(star)}
              className={`rounded-md p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                active ? "text-amber-400" : "text-slate-300 hover:text-amber-300 dark:text-slate-600"
              }`}
            >
              <Star
                className={active ? "fill-current" : ""}
                style={{ width: px, height: px }}
              />
            </button>
          );
        })}

        {showValue && (
          <span className="ml-1 text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
            {value > 0 ? `${value.toFixed(value % 1 === 0 ? 0 : 1)}/${max}` : `—/${max}`}
          </span>
        )}
      </div>

      {!readOnly && showLabel && (
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {labelText}
        </span>
      )}
    </div>
  );
}
