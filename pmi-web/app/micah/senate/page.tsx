import type { Metadata } from "next";

import { CropFrame, Breadcrumb, PageTitle } from "@/components/micah/chrome";
import { TimeChart, NortheastRail } from "@/components/micah/charts";
import { UsaMap } from "@/components/micah/UsaMap";
import { ScoreTile, StatCard, ExchangeStack, HeatScale } from "@/components/micah/ui";
import { SeatBalanceBar, SenateRaceTable } from "@/components/micah/senate";
import { loadSenateBoard } from "@/lib/micah/adapters";
import { NORTHEAST } from "@/lib/micah/states";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "2026 US Senate Index" };

// Seats variant drives the Poisson-binomial board (CORR-1.6).
const SENATE_INDEX_ID = "us-senate-2026-republican-seats";

export default async function SenatePage() {
  const board = await loadSenateBoard(SENATE_INDEX_ID);

  if (!board) {
    return (
      <div className="view">
        <CropFrame>
          <PageTitle
            title="2026 US Senate Index"
            body={`No senate board available for "${SENATE_INDEX_ID}". Seed + score it, then refresh.`}
          />
        </CropFrame>
      </div>
    );
  }

  const races = board.races
    .slice()
    .sort((a, b) => Math.abs(a.prob_r - 50) - Math.abs(b.prob_r - 50));

  // Per-state P(GOP win), 0–100, on the same heat scale the map expects
  // (100 = deep Republican). States with no 2026 race are absent here and get
  // dimmed by the map's `dimMissing` (holdover seats, not on this cycle's ballot).
  const probByState = board.prob_by_state;
  const nMapped = Object.keys(probByState).length;
  // Northeast corridor rail — tiny states the choropleth can't show. Falls back
  // to neutral 50 for any corridor seat not on the 2026 ballot.
  const neStates = NORTHEAST.map((code) => ({ code, value: probByState[code] ?? 50 }));

  return (
    <div className="view">
      <CropFrame>
        <Breadcrumb trail={[{ label: "World", href: "/micah" }, { label: "2026 Senate" }]} />
        <PageTitle
          title="2026 US Senate Index"
          body="An aggregated, data-driven estimate of which party holds the US Senate after the 2026 midterms. The index composites probabilities from individual race markets and applies a Poisson-binomial seat distribution against the 51-seat majority threshold."
        />

        <div className="row-between" style={{ marginTop: "var(--s-6)" }}>
          <span className="t-eyebrow">
            LIVE · {board.n_contested} CONTESTED · {board.majority_threshold} TO CONTROL ·{" "}
            E[GOP seats] {board.expected_r_seats.toFixed(1)} ± {board.stdev_r_seats.toFixed(1)}
          </span>
        </div>

        <div className="senate-hero">
          <div className="senate-hero__stats">
            <StatCard value={board.total_seats} label="Total Seats" />
            <StatCard value={board.n_contested} label="Contested Races" live />
            <StatCard value="1" label="Prediction Market Exchanges">
              <ExchangeStack ids={["polymarket"]} size={22} />
            </StatCard>
            <StatCard value={board.races.length} label="Race PMIs" info />
          </div>

          <div className="senate-hero__main">
            <div className="senate-paired">
              <ScoreTile value={`${board.p_r_majority.toFixed(0)}%`} label="GOP Majority Probability" tone="red" size="lg" />
              <ScoreTile value={`${board.p_d_majority.toFixed(0)}%`} label="Dem Majority Probability" tone="blue" size="lg" />
            </div>
            <SeatBalanceBar counts={board.counts} tossups={board.tossups} />
          </div>
        </div>

        <div style={{ marginTop: "var(--s-10)", marginBottom: "var(--s-3)" }}>
          <span className="t-label">
            P(GOP wins) by state · {nMapped} contested · greyed = not on 2026 ballot
          </span>
        </div>
        <div className="senate-viz">
          {nMapped > 0 ? (
            <>
              <div className="senate-viz__map">
                <UsaMap width={760} height={500} dataByCode={probByState} dimMissing />
              </div>
              <div className="senate-viz__rail">
                <NortheastRail states={neStates} />
              </div>
            </>
          ) : (
            <div
              className="map-skel"
              style={{ width: "100%", height: 320, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span className="t-label">
                No per-state race attribution yet — the map colours once race markets
                carry state metadata.
              </span>
            </div>
          )}
        </div>

        {nMapped > 0 && (
          <div style={{ marginTop: "var(--s-6)" }}>
            <HeatScale />
          </div>
        )}

        <div className="senate-viz" style={{ marginTop: "var(--s-10)" }}>
          <div className="senate-viz__map" style={{ width: "100%" }}>
            <div style={{ marginBottom: "var(--s-3)" }}>
              <span className="t-label">P(GOP holds {board.majority_threshold}+) · trailing 14 days</span>
            </div>
            <TimeChart
              data={board.chart.data}
              width={960}
              height={460}
              color="#8B1E2D"
              yLabel="P(GOP Majority) %"
              noData={board.chart.data.length === 0}
            />
          </div>
        </div>

        <div className="section" style={{ marginTop: "var(--s-12)" }}>
          <h2 className="t-display" style={{ fontSize: 36 }}>
            Race PMIs
          </h2>
          <p className="t-body" style={{ marginTop: "var(--s-2)", maxWidth: 820 }}>
            Each race is a single-factor PMI. Probabilities derive from active Polymarket
            contracts, weighted by volume and recency. Per-race state attribution lands with
            the condition-grouping work (CORR-1.3).
          </p>
          <SenateRaceTable races={races} />
        </div>
      </CropFrame>
    </div>
  );
}
