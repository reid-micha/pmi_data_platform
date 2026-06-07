import type { PmiChartDataPoint } from "@micah/shared";
import { PmiScoreChart, type PmiChartType } from "@micah/ui";
import React from "react";
import { getPmiColor } from "../utils/pmiColor";

interface IndexGraphProps {
    data?: PmiChartDataPoint[];
    loading?: boolean;
    type: PmiChartType;
    pmiScore?: number | null;
}

export default function IndexGraph({ type, data = [], loading = false, pmiScore = null }: IndexGraphProps): React.ReactElement {
    return (
        <PmiScoreChart
            data={data}
            loading={loading}
            type={type}
            pmiScore={pmiScore}
            filterEnd="latestTs"
            getTooltipColor={(s) => getPmiColor(s)}
            getTooltipTextColor={(s) => ((s ?? 0) <= 20 || (s ?? 0) > 80 ? "#fff" : "#333")}
            getDotColor={() => getPmiColor(pmiScore ?? null)}
        />
    );
}
