import "../globals.css";

import Link from "next/link";

/**
 * Operational dashboard chrome (was the old root layout). Shows index health,
 * stats and per-index detail. Tailwind-styled; lives entirely under
 * /pmi_dashboard so it never collides with the Micah design-system CSS.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-surface-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/pmi_dashboard"
            className="text-lg font-semibold tracking-tight text-ink"
          >
            PMI Dashboard
          </Link>
          <nav className="text-sm text-ink-muted flex gap-6">
            <Link href="/pmi_dashboard" className="hover:text-ink">
              Indexes
            </Link>
            <Link href="/pmi_dashboard/health" className="hover:text-ink">
              Health
            </Link>
            <Link href="/micah" className="hover:text-ink">
              Public site ↗
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
      <footer className="border-t border-surface-border bg-surface text-xs text-ink-muted">
        <div className="mx-auto max-w-6xl px-6 py-4 flex justify-between">
          <span>Platform dashboard — index health, stats & lineage</span>
          <span>pmi-web</span>
        </div>
      </footer>
    </>
  );
}
