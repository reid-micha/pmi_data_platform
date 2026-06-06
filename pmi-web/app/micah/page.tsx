import { CropFrame, PageTitle, PMIRow } from "@/components/micah/chrome";
import { NortheastRail } from "@/components/micah/charts";
import { UsaMap } from "@/components/micah/UsaMap";
import { ScoreTile, StatCard, HeatScale, toneForHeat } from "@/components/micah/ui";
import { loadMagaByState, loadPmiList } from "@/lib/micah/adapters";
import { NORTHEAST } from "@/lib/micah/states";

export const dynamic = "force-dynamic";

export default async function WorldPage() {
  const [maga, { rows, error }] = await Promise.all([loadMagaByState(), loadPmiList()]);

  const national = maga?.national ?? null;
  const neStates = NORTHEAST.map((code) => ({
    code,
    value: maga?.dataByCode[code] ?? 50,
  }));

  return (
    <div className="view">
      <CropFrame>
        <PageTitle
          title="National MAGA Index"
          body="Micah aggregates contracts from prediction-market exchanges to structure and power the MAGA Index — a prediction market index (PMI) tracking sentiment and probabilities around political outcomes, policy direction, and narratives associated with the MAGA movement. As more data is incorporated, the index gains stronger predictive power."
        />

        <div className="row-between" style={{ marginTop: "var(--s-6)" }}>
          <span className="t-eyebrow">
            LIVE · {maga?.nStates ?? 0} STATES WITH RACE MARKETS · {maga?.nMarkets ?? 0} CONTRACTS
          </span>
        </div>

        <div className="world-grid" style={{ marginTop: "var(--s-5)" }}>
          <div className="world-grid__stats">
            <ScoreTile
              value={national == null ? "—" : national.toFixed(0)}
              label="National PMI Score"
              tone={national == null ? "neutral" : toneForHeat(national)}
            />
            <StatCard value={maga?.nStates ?? 0} label="States on Ballot" live />
            <StatCard value="1" label="Prediction Market Exchanges" />
            <StatCard value={maga?.nMarkets ?? 0} label="Race Contracts" info />
          </div>

          <div className="world-grid__viz">
            {maga && maga.nStates > 0 ? (
              <>
                <div className="world-grid__map">
                  <UsaMap width={760} height={500} dataByCode={maga.dataByCode} dimMissing />
                </div>
                <div className="world-grid__rail">
                  <NortheastRail states={neStates} />
                </div>
              </>
            ) : (
              <div className="map-skel" style={{ width: "100%", height: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="t-label">
                  No per-state race markets ingested yet — the map colours once
                  &quot;…win the &lt;State&gt; Senate/Governor race in 2026&quot; markets land.
                </span>
              </div>
            )}
          </div>
        </div>

        {maga && maga.nStates > 0 && (
          <div style={{ marginTop: "var(--s-6)", paddingLeft: "calc(220px + var(--s-8))" }}>
            <HeatScale />
          </div>
        )}

        <div className="section" style={{ marginTop: "var(--s-12)" }}>
          <h2 className="t-display" style={{ fontSize: 36 }}>
            Prediction Markets Indexes (PMIs)
          </h2>
          <p className="t-body" style={{ marginTop: "var(--s-2)", maxWidth: 820 }}>
            PMIs aggregate &amp; structure related prediction-market contracts into one
            index. Each is powered by live data and accounts for variables such as volume
            and relevancy.
          </p>

          {error ? (
            <div className="t-body" style={{ marginTop: "var(--s-5)", color: "var(--red-strong)" }}>
              Failed to load indexes from pmi-api: <code>{error}</code>
            </div>
          ) : rows.length === 0 ? (
            <div className="t-body" style={{ marginTop: "var(--s-5)", color: "var(--ink-2)" }}>
              No indexes yet. Seed with <code>just pmi-bootstrap</code> and score them.
            </div>
          ) : (
            <div className="pmi-list" style={{ marginTop: "var(--s-5)" }}>
              {rows.map((row) => (
                <PMIRow key={row.id} row={row} />
              ))}
            </div>
          )}
        </div>
      </CropFrame>
    </div>
  );
}
