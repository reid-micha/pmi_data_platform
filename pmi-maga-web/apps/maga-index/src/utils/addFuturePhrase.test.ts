import { describe, expect, it } from "vitest";
import { addFuturePhrase } from "./addFuturePhrase";

const PHRASE = "within the next 12 months";

describe("addFuturePhrase", () => {
    it("returns empty or whitespace-only input unchanged", () => {
        expect(addFuturePhrase("", PHRASE)).toBe("");
        expect(addFuturePhrase("   ", PHRASE)).toBe("   ");
    });

    it('for titles with trailing "?", inserts phrase before the question mark', () => {
        expect(addFuturePhrase("Is it raining?", PHRASE)).toBe(
            "Is it raining within the next 12 months?"
        );
    });

    it('for "Will …?" titles, inserts phrase before the question mark', () => {
        expect(addFuturePhrase("Will Trump win in 2028?", PHRASE)).toBe(
            "Will Trump win in 2028 within the next 12 months?"
        );
    });

    it('for titles without "?", appends phrase at the end', () => {
        expect(addFuturePhrase("Forecast", PHRASE)).toBe(
            "Forecast within the next 12 months"
        );
    });
});
