import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PMI Platform",
    template: "%s — PMI Platform",
  },
  description:
    "Declarative Polymarket-based Predictive Market Indices. Track, explain, and backtest PMIs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-surface-border bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
              PMI Platform
            </Link>
            <nav className="text-sm text-ink-muted flex gap-6">
              <Link href="/" className="hover:text-ink">
                Indexes
              </Link>
              <Link href="/health" className="hover:text-ink">
                Health
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
        </main>
        <footer className="border-t border-surface-border bg-surface text-xs text-ink-muted">
          <div className="mx-auto max-w-6xl px-6 py-4 flex justify-between">
            <span>P1 M4 scaffold — Next.js 15 App Router</span>
            <span>
              <a
                href="https://github.com/"
                className="underline hover:text-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                pmi-web
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
