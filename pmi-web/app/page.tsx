import "./globals.css";

import Link from "next/link";

import { api, PmiApiError } from "@/lib/api-client";

export const dynamic = "force-dynamic";

/**
 * Landing chooser between the two product surfaces. Kept deliberately small —
 * the real homepages are /micah (public index UI) and /pmi_dashboard
 * (operational health). Probes pmi-api so a broken backend is obvious here.
 */
export default async function Home() {
  let apiOk = false;
  let apiNote = "";
  try {
    const h = await api.health();
    apiOk = h.status === "ok" || h.db === "ok";
    apiNote = `db: ${h.db}`;
  } catch (e) {
    apiNote = e instanceof PmiApiError ? `${e.status} @ ${e.url}` : String(e);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">PMI Platform</h1>
        <p className="text-ink-muted mt-2">
          Declarative Polymarket-based Predictive Market Indices.
        </p>
        <p className="mt-3 text-xs font-mono text-ink-muted">
          pmi-api: {apiOk ? "✓ healthy" : "✗ unreachable"} ({apiNote})
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Link
          href="/micah"
          className="block rounded-xl border border-surface-border bg-surface p-6 hover:border-accent transition-colors"
        >
          <h2 className="text-lg font-medium">Public site →</h2>
          <p className="text-sm text-ink-muted mt-2">
            The Micah index experience: MAGA Index map, state & question
            breakdowns, the War Index, and the 2026 Senate board.
          </p>
        </Link>
        <Link
          href="/pmi_dashboard"
          className="block rounded-xl border border-surface-border bg-surface p-6 hover:border-accent transition-colors"
        >
          <h2 className="text-lg font-medium">Platform dashboard →</h2>
          <p className="text-sm text-ink-muted mt-2">
            Operational view: every index definition, score freshness,
            lineage, and source health.
          </p>
        </Link>
      </div>
    </div>
  );
}
