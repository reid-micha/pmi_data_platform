/**
 * Site chrome + navigational rows for the Micah surface. Ported from
 * `pmi-new-frontend/components.jsx`, but the prototype's in-memory
 * `onNavigate({view})` router is replaced with real Next routes via <Link>,
 * which keeps these server-renderable (SSR/SEO — CLAUDE.md §9) and drops the
 * need for client state.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import {
  ExchangeStack,
  ScoreTile,
  Tag,
  toneForHeat,
  type ScoreTone,
} from "./ui";

// Re-export so pages can pull layout + chrome primitives from one module.
export { CropFrame } from "./ui";

const LOGO = "/micah/assets/micah-logo.svg";

export function Header({ title = "MAGA Index" }: { title?: string }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand-mark" href="/micah">
          <span className="brand-mark__title">{title}</span>
        </Link>
        <div className="site-header__center">
          <label className="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input type="text" placeholder="Search" />
          </label>
        </div>
        <div className="site-header__right">
          <span className="powered-by">Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Micah" className="powered-logo" width={140} height={44} />
        </div>
      </div>
    </header>
  );
}

export function Footer({ title = "MAGA Index" }: { title?: string }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__left">
        <span className="powered-by">Powered by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Micah" className="powered-logo" />
      </div>
      <div className="site-footer__right t-display-caps" style={{ fontSize: "22px" }}>
        {title}
      </div>
    </footer>
  );
}

/** Visual share affordance. Static in the prototype; kept as a no-op control. */
export function ShareBtn() {
  return (
    <button className="icon-btn" aria-label="Share" type="button">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12V19 a2 2 0 0 0 2 2 h10 a2 2 0 0 0 2-2 v-7" />
        <path d="M16 6 L12 2 L8 6" />
        <path d="M12 2 V15" />
      </svg>
    </button>
  );
}

export function PageTitle({
  caps = false,
  title,
  body,
  breadcrumb,
}: {
  caps?: boolean;
  title: ReactNode;
  body?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="page-title">
      {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
      <div className="page-title__row">
        <h1 className={caps ? "t-display-caps" : "t-display"}>{title}</h1>
        <ShareBtn />
      </div>
      {body && <p className="page-title__body t-body">{body}</p>}
    </div>
  );
}

export function Breadcrumb({ trail }: { trail: Array<{ label: string; href?: string }> }) {
  return (
    <div className="breadcrumb">
      {trail.map((t, i) => (
        <span key={i}>
          {t.href ? (
            <Link className="breadcrumb__link" href={t.href}>
              {t.label}
            </Link>
          ) : (
            <span>{t.label}</span>
          )}
          {i < trail.length - 1 && <span className="breadcrumb__sep">›</span>}
        </span>
      ))}
    </div>
  );
}

export interface PmiRowModel {
  id: string;
  href: string;
  title: string;
  score: number;
  scoreType: "score" | "prob";
  heat: number;
  tags: string[];
  excs: string[];
  extras?: number;
  contracts: number;
}

/** One row in a PMI list. Navigates via <Link> (was `onClick` in the mock). */
export function PMIRow({ row }: { row: PmiRowModel }) {
  const dotted = row.heat >= 50 ? "dotted-red" : "dotted-blue";
  const tone: ScoreTone = toneForHeat(row.heat);
  return (
    <Link className="pmi-row" href={row.href} role="button">
      <span className={`pmi-row__dots ${dotted}`} aria-hidden />
      <span className="pmi-row__score">
        <ScoreTile
          value={row.scoreType === "prob" ? `${row.score}%` : row.score}
          label={row.scoreType === "prob" ? "PMI Probability" : "PMI Score"}
          tone={tone}
          size="sm"
          info={false}
        />
      </span>
      <span className="pmi-row__body">
        <span className="pmi-row__title">{row.title}</span>
        <span className="pmi-row__tags">
          {row.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </span>
      </span>
      <span className="pmi-row__right">
        <ExchangeStack ids={row.excs} extras={row.extras ?? 0} size={26} />
        <span className="pmi-row__contracts">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          {row.contracts.toLocaleString()} Contracts
        </span>
      </span>
      <span className="pmi-row__share" aria-hidden>
        <ShareBtn />
      </span>
    </Link>
  );
}
