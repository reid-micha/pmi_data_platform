import type { ContractDetailData, ContractListResponse } from "@micah/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";
import {
    fetchContractDetail,
    fetchContracts,
    fetchLastUpdatedContractPrice,
} from "./contracts";

vi.mock("./client");

describe("fetchContracts", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("calls hourly contracts path by default", async () => {
        const list = { contracts: [] } as unknown as ContractListResponse;
        vi.mocked(apiGet).mockResolvedValue(list);

        await fetchContracts();
        expect(apiGet).toHaveBeenCalledWith("/api/contracts/hourly", {
            limit: undefined,
            offset: undefined,
            search: undefined,
            source: undefined,
        });
    });

    it("passes through filters to hourly path", async () => {
        vi.mocked(apiGet).mockResolvedValue({ contracts: [] } as unknown as ContractListResponse);

        await fetchContracts({ limit: 5, offset: 0, search: "x", source: "kalshi" });
        expect(apiGet).toHaveBeenCalledWith("/api/contracts/hourly", {
            limit: 5,
            offset: 0,
            search: "x",
            source: "kalshi",
        });
    });
});

describe("fetchContractDetail", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("requests detail by contract id", async () => {
        const detail = { id: 42 } as unknown as ContractDetailData;
        vi.mocked(apiGet).mockResolvedValue(detail);

        await fetchContractDetail(42);
        expect(apiGet).toHaveBeenCalledWith("/api/contracts/hourly/42");
    });
});

describe("fetchLastUpdatedContractPrice", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("requests hourly last-updated endpoint", async () => {
        vi.mocked(apiGet).mockResolvedValue({ recordedAt: "2024-01-01" });

        await fetchLastUpdatedContractPrice();
        expect(apiGet).toHaveBeenCalledWith("/api/contracts/hourly/last-updated");
    });
});
