import { describe, expect, it } from "vitest";
import { hexToRgba } from "./color";

describe("hexToRgba", () => {
    it("converts #RRGGBB to rgba with the given alpha", () => {
        expect(hexToRgba("#FF0000", 1)).toBe("rgba(255, 0, 0, 1)");
        expect(hexToRgba("#00FF00", 0.5)).toBe("rgba(0, 255, 0, 0.5)");
        expect(hexToRgba("#0000FF", 0)).toBe("rgba(0, 0, 255, 0)");
    });

    it("handles lowercase hex", () => {
        expect(hexToRgba("#abcdef", 1)).toBe("rgba(171, 205, 239, 1)");
    });
});
