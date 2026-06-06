"use client";

/**
 * US choropleth — d3-geo + bundled us-atlas topojson, React-rendered. Ported
 * from the prototype's map.jsx, but the atlas is bundled (npm us-atlas) instead
 * of CDN-fetched, and projection is computed once with useMemo. Colours come
 * from the shared heat scale. Clicking a state with data navigates to its
 * detail page.
 */
import { geoAlbersUsa, geoPath } from "d3-geo";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import usAtlas from "us-atlas/states-10m.json";

import { heatColor } from "@/lib/heat";
import { stateNameToCode } from "@/lib/micah/states";

// Pixel nudges for states whose centroid falls outside the land mass.
const LABEL_OFFSETS: Record<string, [number, number]> = {
  FL: [22, 22], MI: [12, 22], LA: [-8, -4], MD: [10, 4],
  ID: [0, 8], OK: [10, 4], WV: [-4, 4],
};
const TINY = new Set(["RI", "CT", "NJ", "DE", "MD", "MA", "NH", "VT", "DC"]);

interface ShapedState {
  id: string;
  code: string;
  name: string;
  d: string | null;
  centroid: [number, number];
  value: number;
  hasData: boolean;
}

export function UsaMap({
  width = 760,
  height = 500,
  dataByCode,
  dimMissing = false,
}: {
  width?: number;
  height?: number;
  /** code → heat (0–100). States absent here are "no data". */
  dataByCode: Record<string, number>;
  dimMissing?: boolean;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<ShapedState | null>(null);

  const shaped = useMemo<ShapedState[]>(() => {
    // us-atlas Topology → GeoJSON FeatureCollection of states.
    const fc = feature(
      usAtlas as never,
      (usAtlas as never as { objects: { states: unknown } }).objects.states as never,
    ) as unknown as FeatureCollection<Geometry, { name: string }>;
    const projection = geoAlbersUsa().fitSize([width, height], fc);
    const path = geoPath(projection);
    return fc.features.map((f, i) => {
      const name = f.properties.name;
      const code = stateNameToCode(name);
      let c = path.centroid(f) as [number, number];
      const off = LABEL_OFFSETS[code];
      if (off && c && !Number.isNaN(c[0])) c = [c[0] + off[0], c[1] + off[1]];
      // Round to 2 decimals so SSR (Node) and client (browser) serialise the
      // same string — path.centroid() returns raw floats whose last ULPs differ
      // across V8 builds, causing a hydration mismatch on the <text> x/y attrs.
      // (geoPath already rounds the path `d` output to 3 digits, so it's fine.)
      if (c && !Number.isNaN(c[0])) c = [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100];
      const override = dataByCode[code];
      const hasData = override !== undefined;
      return {
        id: String(f.id ?? i),
        code,
        name,
        d: path(f),
        centroid: c,
        value: hasData ? override : 50,
        hasData,
      };
    });
  }, [width, height, dataByCode]);

  return (
    <div className="usa-map" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="usa-map__svg" preserveAspectRatio="xMidYMid meet">
        {shaped.map((p) => {
          const dim = dimMissing && !p.hasData;
          const fill = dim ? "#E1DCD0" : heatColor(p.value);
          return (
            <path
              key={p.id}
              d={p.d ?? undefined}
              fill={fill}
              stroke="#FBFAF6"
              strokeWidth={0.8}
              opacity={dim ? 0.55 : 1}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              onClick={() => p.hasData && router.push(`/micah/state/${p.code}`)}
              style={{ cursor: dim ? "default" : "pointer", transition: "opacity .2s" }}
            />
          );
        })}
        {shaped.map((p) => {
          if (!p.centroid || Number.isNaN(p.centroid[0]) || TINY.has(p.code)) return null;
          return (
            <text
              key={`${p.id}_t`}
              x={p.centroid[0]}
              y={p.centroid[1] + 3}
              textAnchor="middle"
              fontSize={p.code === "CA" || p.code === "TX" ? 11 : 9}
              fill={p.hasData && (p.value > 65 || p.value < 25) ? "#FBFAF6" : "#11192C"}
              style={{ fontWeight: 600, fontFamily: "Inter, sans-serif", pointerEvents: "none" }}
            >
              {p.code}
            </text>
          );
        })}
      </svg>
      {hover && (
        <div className="map-tip" style={{ position: "absolute", left: 8, bottom: 8 }}>
          <div className="map-tip__name">{hover.name}</div>
          <div className="map-tip__val">
            {dimMissing && !hover.hasData ? "Not on 2026 ballot" : `MAGA ${hover.value.toFixed(0)}`}
          </div>
        </div>
      )}
    </div>
  );
}
