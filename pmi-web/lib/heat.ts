/**
 * Political heat scale — the brand's spine (see pmi-new-frontend design system
 * README "Brand heat scale 0 → 100" and components.jsx `heatColor`).
 *
 * A continuous value (0 = deep Democrat navy → 50 = neutral cream → 100 = deep
 * Republican wine) maps to an rgb() string. Because the value is continuous we
 * compute the colour in JS and apply it via inline `style`, rather than as a
 * Tailwind class (Tailwind can't express a continuous scale and would purge
 * dynamic class names anyway).
 */

type Stop = [pos: number, rgb: [number, number, number]];

const STOPS: Stop[] = [
  [0, [22, 52, 138]], // #16348A deep Dem
  [15, [45, 91, 204]], // #2D5BCC
  [30, [111, 143, 219]], // #6F8FDB
  [45, [184, 197, 227]], // #B8C5E3
  [50, [233, 226, 220]], // #E9E2DC neutral cream
  [55, [236, 201, 207]], // #ECC9CF
  [70, [220, 139, 149]], // #DC8B95
  [85, [181, 55, 71]], // #B53747
  [100, [139, 30, 45]], // #8B1E2D deep Rep
];

/** Interpolate the 9-stop heat scale. `v` is clamped to [0, 100]. */
export function heatColor(v: number): string {
  const x = Math.max(0, Math.min(100, v));
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (x >= STOPS[i][0] && x <= STOPS[i + 1][0]) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const t = (x - lo[0]) / span;
  const c = lo[1].map((ch, i) => Math.round(ch + (hi[1][i] - ch) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * Whether to use light (inverse) text on a heat-coloured background. Mirrors
 * the design's rule: light text on the saturated wine/navy ends.
 */
export function isDarkHeat(v: number): boolean {
  return v > 65 || v < 35;
}

/** Band metadata — order is load-bearing (Dem → Rep, left → right). */
export const BAND_ORDER = [
  "safe-d",
  "likely-d",
  "lean-d",
  "tossup",
  "lean-r",
  "likely-r",
  "safe-r",
] as const;

export type Band = (typeof BAND_ORDER)[number];

/** Display label + a representative heat value for each band's swatch. */
export const BAND_META: Record<Band, { label: string; heat: number }> = {
  "safe-d": { label: "Safe D", heat: 5 },
  "likely-d": { label: "Likely D", heat: 18 },
  "lean-d": { label: "Lean D", heat: 33 },
  tossup: { label: "Toss-up", heat: 50 },
  "lean-r": { label: "Lean R", heat: 67 },
  "likely-r": { label: "Likely R", heat: 82 },
  "safe-r": { label: "Safe R", heat: 95 },
};
