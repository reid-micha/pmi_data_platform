import type { SearchResponse } from "@micah/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";
import { fetchSearch } from "./search";

vi.mock("./client");

describe("fetchSearch", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("passes query and optional limit to apiGet", async () => {
        const payload = { results: [] } as unknown as SearchResponse;
        vi.mocked(apiGet).mockResolvedValue(payload);

        await expect(fetchSearch("ukraine", 10)).resolves.toBe(payload);
        expect(apiGet).toHaveBeenCalledWith("/api/search", { q: "ukraine", limit: 10 });
    });

    it("omits limit in query when not provided", async () => {
        const payload = { results: [] } as unknown as SearchResponse;
        vi.mocked(apiGet).mockResolvedValue(payload);

        await fetchSearch("test");
        expect(apiGet).toHaveBeenCalledWith("/api/search", { q: "test", limit: undefined });
    });
});
