import { notFound } from "next/navigation";

import { CropFrame, Breadcrumb, PageTitle } from "@/components/micah/chrome";
import { ScoreTile, StatCard, ExchangeStack, Tag, toneForHeat } from "@/components/micah/ui";
import { loadMagaByState } from "@/lib/micah/adapters";
import { STATE_NAME_BY_CODE } from "@/lib/micah/states";

export const dynamic = "force-dynamic";

export default async function StatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const name = STATE_NAME_BY_CODE[code];
  if (!name) notFound();

  const maga = await loadMagaByState();
  const row = maga?.states[code];
  const heat = row?.heat ?? null;
  const tone = heat == null ? "neutral" : toneForHeat(heat);

  return (
    <div className="view">
      <CropFrame>
        <Breadcrumb trail={[{ label: "World", href: "/micah" }, { label: "By State" }, { label: name }]} />
        <PageTitle
          title={`${name} MAGA Index`}
          body="An aggregated, data-driven estimate of market-implied partisan lean across this state's 2026 general-election races, derived from active Polymarket contracts. 0 = Democrat, 100 = Republican."
        />

        <div className="state-grid" style={{ marginTop: "var(--s-6)" }}>
          <div className="state-grid__stats">
            <ScoreTile value={heat == null ? "—" : heat.toFixed(0)} label="PMI Score" tone={tone} />
            <StatCard value={row?.n_markets ?? 0} label="Race Contracts" live />
            <StatCard value="1" label="Prediction Market Exchanges">
              <ExchangeStack ids={["polymarket"]} size={22} />
            </StatCard>
            <StatCard value={row?.offices.length ?? 0} label="Offices on Ballot" info />
          </div>
          <div className="state-grid__chart">
            {row ? (
              <div className="holdings-table">
                <div className="holdings-table__head t-label">
                  <span>Signal</span>
                  <span style={{ textAlign: "right" }}>Value</span>
                </div>
                <div className="holdings-table__row">
                  <span>Partisan lean (P Republican)</span>
                  <span style={{ textAlign: "right", fontWeight: 600 }}>{row.heat.toFixed(1)}</span>
                </div>
                <div className="holdings-table__row">
                  <span>Offices contributing</span>
                  <span style={{ textAlign: "right" }}>
                    {row.offices.map((o) => (
                      <Tag key={o}>{o}</Tag>
                    ))}
                  </span>
                </div>
                <div className="holdings-table__row">
                  <span>24h volume across races</span>
                  <span style={{ textAlign: "right", fontWeight: 600 }}>
                    ${row.volume_24h.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="map-skel" style={{ width: "100%", height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="t-label">No 2026 race markets ingested for {name} yet.</span>
              </div>
            )}
          </div>
        </div>
      </CropFrame>
    </div>
  );
}
