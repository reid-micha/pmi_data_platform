import type { Metadata } from "next";
// NOTE: globals.css (Tailwind + preflight) is intentionally NOT imported here.
// It is loaded only by the Tailwind surfaces (app/page.tsx landing &
// app/pmi_dashboard/layout.tsx) so its preflight reset never reaches the
// Micah pages, which run on their own ported design-system CSS.

export const metadata: Metadata = {
  title: {
    default: "PMI Platform",
    template: "%s — PMI Platform",
  },
  description:
    "Declarative Polymarket-based Predictive Market Indices. Track, explain, and backtest PMIs.",
};

/**
 * Root layout is intentionally bare: just <html>/<body> + global resets.
 * The two product surfaces own their own chrome via nested layouts:
 *   - app/pmi_dashboard/layout.tsx  — operational dashboard (Tailwind)
 *   - app/micah/layout.tsx          — public Micah index UI (ported design system)
 * Keeping the root thin lets the Micah CSS and the Tailwind dashboard coexist
 * without one bleeding header/footer into the other.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
