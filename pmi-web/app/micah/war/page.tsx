import type { Metadata } from "next";

import { CropFrame, Breadcrumb, PageTitle } from "@/components/micah/chrome";
import { TimeChart } from "@/components/micah/charts";
import { ScoreTile, StatCard, ExchangeStack, Tag, toneForHeat } from "@/components/micah/ui";
import { venueChip } from "@/lib/micah/exchanges";
import { formatVolume, loadIndexDetail } from "@/lib/micah/adapters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The War Index" };

// The platform's seed war index slug (CLAUDE.md §15.10 / pmi-model.js).
const WAR_INDEX_ID = "polymarket-war-index";

export default async function WarIndexPage() {
  const detail = await loadIndexDetail(WAR_INDEX_ID);

  if (!detail) {
    return (
      <div className="view">
        <CropFrame>
          <PageTitle
            title="The War Index"
            body={`No index "${WAR_INDEX_ID}" is currently served by pmi-api. Seed it with \`just pmi-bootstrap\` and score it, then refresh.`}
          />
        </CropFrame>
      </div>
    );
  }

  const score = detail.score;
  const tone = score == null ? "neutral" : toneForHeat(score);

  return (
    <div className="view">
      <CropFrame>
        <Breadcrumb trail={[{ label: "World", href: "/micah" }, { label: "War Index" }]} />
        <PageTitle
          title="The War Index"
          body="An aggregated, data-driven estimate of market-implied probabilities across major geopolitical conflict outcomes, derived from live Polymarket contracts and exchange signals."
        />

        <div className="state-grid" style={{ marginTop: "var(--s-6)" }}>
          <div className="state-grid__stats">
            <ScoreTile
              value={score == null ? "—" : score.toFixed(1)}
              label="PMI Score"
              tone={tone}
            />
            <StatCard value={detail.componentCount.toLocaleString()} label="Component Contracts" live />
            <StatCard value={detail.exchanges.length} label="Prediction Market Exchanges">
              <ExchangeStack
                ids={detail.exchanges.slice(0, 4)}
                extras={Math.max(0, detail.exchanges.length - 4)}
                size={22}
              />
            </StatCard>
            <StatCard value={detail.holdingsTotal} label="PMI Holdings" info />
          </div>
          <div className="state-grid__chart">
            <TimeChart
              data={detail.chart.data}
              xLabels={detail.chart.xLabels}
              width={760}
              height={460}
              color="#3A4C6A"
              yLabel="PMI Score"
              noData={detail.chart.data.length === 0}
            />
          </div>
        </div>

        <div className="row-between" style={{ marginTop: "var(--s-10)" }}>
          <h3 className="t-h3">PMI Holdings</h3>
          {detail.holdingsTotal > detail.holdings.length && (
            <span className="t-label">
              Top {detail.holdings.length} of {detail.holdingsTotal.toLocaleString()} by relevancy
            </span>
          )}
        </div>
        <div className="war-grid" style={{ marginTop: "var(--s-5)" }}>
          {detail.holdings.map((h, i) => (
            <div key={i} className="holdings-card">
              <div className="holdings-card__head">
                <span
                  className="ex-chip"
                  style={{ width: 26, height: 26, background: venueChip(h.venue).color, color: venueChip(h.venue).dark ? "#11192C" : "#fff" }}
                  title={venueChip(h.venue).name}
                >
                  {venueChip(h.venue).glyph}
                </span>
                <span className="holdings-card__title">{h.title}</span>
              </div>
              <div className="holdings-card__row">
                <Tag tone={h.relationship === "Direct" ? "direct" : "indirect"}>{h.relationship}</Tag>
              </div>
              <div className="holdings-card__row holdings-card__row--foot">
                <span className="t-label">
                  Volume: <strong style={{ color: "var(--ink-1)" }}>{formatVolume(h.volume)}</strong>
                </span>
                <span className="holdings-card__yes">
                  Yes: <strong>{h.prob == null ? "—" : `${h.prob.toFixed(1)}%`}</strong>
                </span>
              </div>
            </div>
          ))}
          {detail.holdings.length === 0 && (
            <p className="t-body" style={{ color: "var(--ink-2)" }}>
              No component contracts evaluated yet. Run a scoring tick to populate holdings.
            </p>
          )}
        </div>
      </CropFrame>
    </div>
  );
}
