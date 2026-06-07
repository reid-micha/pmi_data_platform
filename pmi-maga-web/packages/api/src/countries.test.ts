import type { Country, CountryDetail, HoldingsData } from "@micah/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";
import {
    fetchCountries,
    fetchCountry,
    fetchCountryHoldings,
} from "./countries";

vi.mock("./client");

describe("fetchCountries", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("uses hourly country list and drops countries without pmiScore", async () => {
        vi.mocked(apiGet).mockResolvedValue([
            { id: "us", pmiScore: 10 },
            { id: "xx", pmiScore: null },
        ] as Country[]);

        const out = await fetchCountries();
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/country");
        expect(out).toHaveLength(1);
        expect(out[0]?.id).toBe("us");
    });
});

describe("fetchCountry", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("requests hourly country detail by id", async () => {
        const detail = { id: "fr" } as unknown as CountryDetail;
        vi.mocked(apiGet).mockResolvedValue(detail);

        await fetchCountry("fr");
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/country/fr");
    });
});

describe("fetchCountryHoldings", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("requests hourly holdings for the country", async () => {
        const holdings = { items: [] } as unknown as HoldingsData;
        vi.mocked(apiGet).mockResolvedValue(holdings);

        await fetchCountryHoldings("de");
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/country/de/holdings");
    });
});
