// Ported Micah design system. Import order matters: tokens/type first, then the
// base site styles, then the per-surface sheets (ask / pro / senate). These are
// the ONLY styles loaded on /micah/* — Tailwind/preflight never reaches here
// (see app/layout.tsx note), so the design system renders pixel-faithfully.
import "./styles/colors_and_type.css";
import "./styles/site.css";
import "./styles/site-ask.css";
import "./styles/site-pro.css";
import "./styles/site-pro-options.css";
import "./styles/site-senate.css";

import type { Metadata } from "next";
import Link from "next/link";

import { Header, Footer } from "@/components/micah/chrome";

export const metadata: Metadata = {
  title: { default: "MAGA Index", template: "%s — Micah" },
  description:
    "The MAGA Index and War Index — prediction-market indices aggregating live contracts across exchanges.",
};

const NAV = [
  { href: "/micah", label: "MAGA Index" },
  { href: "/micah/war", label: "War Index" },
  { href: "/micah/senate", label: "2026 Senate" },
];

export default function MicahLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Header />
      <nav className="screen-nav">
        <div className="screen-nav__inner">
          <span className="t-label">VIEW:</span>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="screen-nav__btn">
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="app__main">{children}</main>
      <Footer />
    </div>
  );
}
