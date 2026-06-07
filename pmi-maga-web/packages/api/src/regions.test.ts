import type { HoldingsData, Region, RegionDetail } from "@micah/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";
import {
    fetchRegion,
    fetchRegionHoldings,
    fetchRegions,
} from "./regions";

vi.mock("./client");

describe("fetchRegions", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("uses hourly region path and filters null pmiScore", async () => {
        vi.mocked(apiGet).mockResolvedValue([
            { id: "a", pmiScore: 1 },
            { id: "b", pmiScore: null },
        ] as Region[]);

        const out = await fetchRegions();
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/region");
        expect(out).toHaveLength(1);
        expect(out[0]?.id).toBe("a");
    });
});

describe("fetchRegion", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("requests hourly region detail", async () => {
        const detail = { id: "r1" } as unknown as RegionDetail;
        vi.mocked(apiGet).mockResolvedValue(detail);

        await expect(fetchRegion("r1")).resolves.toBe(detail);
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/region/r1");
    });
});

describe("fetchRegionHoldings", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("requests hourly holdings endpoint for the region", async () => {
        const holdings = { items: [] } as unknown as HoldingsData;
        vi.mocked(apiGet).mockResolvedValue(holdings);

        await fetchRegionHoldings("eu");
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/region/eu/holdings");
    });
});
