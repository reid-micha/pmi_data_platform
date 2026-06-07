import type { WorldData } from "@micah/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";
import { fetchWorld } from "./world";

vi.mock("./client");

describe("fetchWorld", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("requests world index data from the expected path", async () => {
        const payload = { markers: [] } as unknown as WorldData;
        vi.mocked(apiGet).mockResolvedValue(payload);

        await expect(fetchWorld()).resolves.toBe(payload);
        expect(apiGet).toHaveBeenCalledTimes(1);
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/world");
    });
});
