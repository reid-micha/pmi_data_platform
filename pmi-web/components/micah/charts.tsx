/**
 * Pure-SVG charts ported from `pmi-new-frontend/map.jsx`. These take no React
 * hooks — they're deterministic functions of their props — so they remain
 * server components. The d3-powered choropleth (UsaMap) is the only piece that
 * needs "use client"; it ships with the 50-state MAGA backend work.
 */
import { heatColor, isDarkHeat } from "@/lib/heat";

const AXIS = "#6B7180";
const GRID = "#E1DCD0";

export function TimeChart({
  data = [],
  width = 720,
  height = 460,
  color = "#3A4C6A",
  yLabel = "PMI Score",
  xLabels,
  noData = false,
  plain = false,
}: {
  /** Series values on the 0–100 scale; `null` gaps are skipped. */
  data?: Array<number | null>;
  width?: number;
  height?: number;
  color?: string;
  yLabel?: string;
  /** Up to 3 x-axis labels (start / mid / end). Defaults to none. */
  xLabels?: [string, string, string];
  noData?: boolean;
  plain?: boolean;
}) {
  const padding = { top: 30, right: 40, bottom: 50, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxY = 100;
  const minY = 0;

  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  // Build the path skipping null gaps (move-to after a gap).
  let d = "";
  let penDown = false;
  data.forEach((v, i) => {
    if (v === null || Number.isNaN(v)) {
      penDown = false;
      return;
    }
    const x = padding.left + i * xStep;
    const y = padding.top + innerH - ((v - minY) / (maxY - minY)) * innerH;
    d += `${penDown ? " L" : " M"} ${x},${y}`;
    penDown = true;
  });

  const yTicks = [0, 20, 40, 60, 80, 100];

  return (
    <div className="time-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {yTicks.map((t) => {
          const y = padding.top + innerH - (t / maxY) * innerH;
          return (
            <g key={t}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeWidth="1" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" fontSize="11" fill={AXIS} fontFamily="Inter, sans-serif">
                {t}
              </text>
            </g>
          );
        })}
        {!plain && (
          <text
            x={-(padding.top + innerH / 2)}
            y={20}
            transform="rotate(-90)"
            textAnchor="middle"
            fontSize="12"
            fill={AXIS}
            fontFamily="Inter, sans-serif"
          >
            {yLabel}
          </text>
        )}
        {!noData && xLabels && data.length > 0 && (
          <>
            <text x={padding.left} y={height - 18} fontSize="12" fill={AXIS} fontFamily="Inter, sans-serif">
              {xLabels[0]}
            </text>
            <text x={padding.left + innerW / 2} y={height - 18} fontSize="12" fill={AXIS} textAnchor="middle" fontFamily="Inter, sans-serif">
              {xLabels[1]}
            </text>
            <text x={width - padding.right} y={height - 18} fontSize="12" fill={AXIS} textAnchor="end" fontFamily="Inter, sans-serif">
              {xLabels[2]}
            </text>
          </>
        )}
        {!noData && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {noData && (
          <g>
            {[40, 70, 110, 150].map((r) => (
              <circle key={r} cx={padding.left + innerW / 2} cy={padding.top + innerH / 2} r={r} fill="none" stroke={GRID} strokeWidth="1" />
            ))}
            <text x={padding.left + innerW / 2} y={padding.top + innerH / 2 + 50} textAnchor="middle" fontSize="14" fill="#11192C" fontWeight="600" fontFamily="Inter, sans-serif">
              No data available
            </text>
            <text x={padding.left + innerW / 2} y={padding.top + innerH / 2 + 70} textAnchor="middle" fontSize="12" fill={AXIS} fontFamily="Inter, sans-serif">
              Data will appear once activity is recorded.
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function NortheastRail({ states }: { states: Array<{ code: string; value: number }> }) {
  return (
    <div className="ne-rail">
      <div className="ne-rail__title t-label">NORTHEAST CORRIDOR</div>
      <div className="ne-rail__list">
        {states.map(({ code, value }) => (
          <div
            key={code}
            className="ne-rail__cell"
            style={{ background: heatColor(value), color: isDarkHeat(value) ? "#FBFAF6" : "#11192C" }}
          >
            {code}
          </div>
        ))}
      </div>
    </div>
  );
}
