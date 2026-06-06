/**
 * Micah design-system primitives — server-renderable (no client state).
 * Ported from `pmi-new-frontend/components.jsx`. Interactive primitives
 * (Segmented, ShareBtn, Header, PMIRow, Tooltip) live in ./interactive.tsx;
 * charts/map live in ./charts.tsx.
 *
 * Class names match the ported CSS in app/micah/styles/*. Colours come from
 * CSS custom properties, applied inline for the continuous heat scale.
 */
import type { CSSProperties, ReactNode } from "react";

import { EXCHANGES } from "@/lib/micah/exchanges";

// ---------- Crop marks frame (the dotted square in the mocks) ----------
export function CropFrame({ children }: { children: ReactNode }) {
  return (
    <div className="crop-frame">
      <span className="crop crop-tl">+</span>
      <span className="crop crop-tr">+</span>
      <span className="crop crop-bl">+</span>
      <span className="crop crop-br">+</span>
      {children}
    </div>
  );
}

export type ScoreTone =
  | "red"
  | "blue"
  | "soft-red"
  | "soft-blue"
  | "lavender"
  | "neutral";

const TONES: Record<ScoreTone, { bg: string; fg: string }> = {
  red: { bg: "var(--red-strong)", fg: "var(--ink-inverse)" },
  blue: { bg: "var(--blue-strong)", fg: "var(--ink-inverse)" },
  "soft-red": { bg: "var(--red-soft)", fg: "var(--ink-1)" },
  "soft-blue": { bg: "var(--blue-soft)", fg: "var(--ink-1)" },
  lavender: { bg: "var(--lavender)", fg: "var(--ink-1)" },
  neutral: { bg: "var(--surface-tint)", fg: "var(--ink-1)" },
};

/** Map a 0–100 heat value to a tone bucket (used by lists & score tiles). */
export function toneForHeat(heat: number): ScoreTone {
  if (heat >= 85) return "red";
  if (heat >= 60) return "soft-red";
  if (heat >= 40) return "lavender";
  if (heat >= 20) return "soft-blue";
  return "blue";
}

export function ScoreTile({
  value,
  label = "PMI Score",
  tone = "red",
  size = "lg",
  info = true,
}: {
  value: ReactNode;
  label?: string;
  tone?: ScoreTone;
  size?: "lg" | "sm";
  info?: boolean;
}) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <div className={`score-tile score-tile--${size}`} style={{ background: t.bg, color: t.fg }}>
      <div className="score-tile__value">{value}</div>
      <div className="score-tile__label">
        {label}
        {info && <InfoCircle />}
      </div>
    </div>
  );
}

export function StatCard({
  value,
  label,
  live,
  info,
  children,
}: {
  value: ReactNode;
  label: string;
  live?: boolean;
  info?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card__value">
        <span>{value}</span>
        {children}
      </div>
      <div className="stat-card__label">
        {live && <span className="live-dot" />}
        {label}
        {info && <InfoCircle />}
      </div>
    </div>
  );
}

export function InfoCircle() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      style={{ verticalAlign: "-2px", marginLeft: 4, opacity: 0.55 }}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.5" r="0.7" fill="currentColor" />
    </svg>
  );
}

export function ExchangeChip({ id, size = 22 }: { id: string; size?: number }) {
  const ex = EXCHANGES[id];
  if (!ex) return null;
  return (
    <span
      className="ex-chip"
      style={{ width: size, height: size, background: ex.color, color: ex.dark ? "#11192C" : "#fff" }}
      title={ex.name}
    >
      {ex.glyph}
    </span>
  );
}

export function ExchangeStack({
  ids,
  extras = 0,
  size = 22,
}: {
  ids: string[];
  extras?: number;
  size?: number;
}) {
  return (
    <span className="ex-stack">
      {ids.map((id, i) => (
        <span key={id + i} className="ex-stack__slot" style={{ width: size, height: size }}>
          <ExchangeChip id={id} size={size} />
        </span>
      ))}
      {extras > 0 && (
        <span className="ex-stack__more" style={{ height: size, lineHeight: `${size}px` }}>
          +{extras}
        </span>
      )}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "direct" | "indirect";
}) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}

export function HeatScale() {
  return (
    <div className="heat-scale">
      <div className="heat-scale__head">
        <span className="t-body-sm" style={{ color: "var(--ink-1)", fontWeight: 600 }}>
          PMI Heat Scale · 0 → 100
        </span>
      </div>
      <div className="heat-scale__row">
        <span className="t-label">Leaning Democrat</span>
        <span className="t-label" style={{ textAlign: "right" }}>
          Leaning Republican
        </span>
      </div>
      <div className="heat-scale__bar" />
      <div className="heat-scale__ticks">
        {[0, 25, 50, 75, 100].map((n) => (
          <span key={n} className="t-label">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Tooltip({
  title,
  children,
  style,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="tooltip" style={style}>
      <div className="tooltip__title">{title}</div>
      <div className="tooltip__body">{children}</div>
    </div>
  );
}
