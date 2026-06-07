import type { AnchorQuestion } from "@micah/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";
import { fetchAnchorQuestion, fetchAnchorQuestions } from "./questions";

vi.mock("./client");

describe("fetchAnchorQuestions", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("filters out questions with peerCount below 3", async () => {
        vi.mocked(apiGet).mockResolvedValue([
            { peerGroupId: 1, peerCount: 2 },
            { peerGroupId: 2, peerCount: 3 },
            { peerGroupId: 3, peerCount: undefined },
        ] as AnchorQuestion[]);

        const out = await fetchAnchorQuestions();
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/question");
        expect(out).toHaveLength(1);
        expect(out[0]?.peerGroupId).toBe(2);
    });
});

describe("fetchAnchorQuestion", () => {
    beforeEach(() => {
        vi.mocked(apiGet).mockReset();
    });

    it("requests hourly anchor question by peer group id", async () => {
        const q = { peerGroupId: 99, peerCount: 10 } as AnchorQuestion;
        vi.mocked(apiGet).mockResolvedValue(q);

        await expect(fetchAnchorQuestion(99)).resolves.toBe(q);
        expect(apiGet).toHaveBeenCalledWith("/api/index/hourly/question/99");
    });
});
