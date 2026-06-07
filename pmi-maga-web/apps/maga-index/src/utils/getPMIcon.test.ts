import { describe, expect, it } from "vitest";
import { getPMIcon } from "./getPMIcon";

describe("getPMIcon", () => {
    it("returns the icon path for known slugs (lowercase)", () => {
        expect(getPMIcon("kalshi")).toBe("/images/PMMarkets/kalshi.svg");
        expect(getPMIcon("polymarket")).toBe("/images/PMMarkets/polymarket.svg");
    });

    it("trims whitespace and is case-insensitive for lookup", () => {
        expect(getPMIcon("  Kalshi  ")).toBe("/images/PMMarkets/kalshi.svg");
        expect(getPMIcon("POLYMARKET")).toBe("/images/PMMarkets/polymarket.svg");
    });

    it("resolves keys that include spaces or hyphens", () => {
        expect(getPMIcon("Interactive Brokers")).toBe("/images/PMMarkets/interactive-brokers.svg");
        expect(getPMIcon("interactive-brokers")).toBe("/images/PMMarkets/interactive-brokers.svg");
    });

    it("resolves crypto.com", () => {
        expect(getPMIcon("crypto.com")).toBe("/images/PMMarkets/crypto.svg");
    });

    it("returns null for unknown slugs", () => {
        expect(getPMIcon("unknown-market")).toBeNull();
        expect(getPMIcon("")).toBeNull();
    });
});

