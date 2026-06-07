import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderPmiLineDot } from "./pmi-line-dot";

function renderInSvg(el: React.ReactElement | null) {
    if (!el) return null;
    return render(<svg>{el}</svg>);
}

describe("renderPmiLineDot", () => {
    it("renders visible dot (r=6) for the last data point", () => {
        const el = renderPmiLineDot({ cx: 10, cy: 20, index: 4 }, 5);
        const { container } = renderInSvg(el)!;
        const circle = container.querySelector("circle");
        expect(circle).toBeTruthy();
        expect(circle!.getAttribute("r")).toBe("6");
    });

    it("renders invisible dot (r=0) for non-last data points", () => {
        const el = renderPmiLineDot({ cx: 10, cy: 20, index: 2 }, 5);
        const { container } = renderInSvg(el)!;
        const circle = container.querySelector("circle");
        expect(circle).toBeTruthy();
        expect(circle!.getAttribute("r")).toBe("0");
    });

    it("uses default color (#F7B27A) when getDotColor is not provided", () => {
        const el = renderPmiLineDot({ cx: 10, cy: 20, index: 4 }, 5);
        const { container } = renderInSvg(el)!;
        const circle = container.querySelector("circle");
        expect(circle!.getAttribute("fill")).toBe("#F7B27A");
    });

    it("uses custom color from getDotColor callback", () => {
        const el = renderPmiLineDot({ cx: 10, cy: 20, index: 4 }, 5, () => "#FF0000");
        const { container } = renderInSvg(el)!;
        const circle = container.querySelector("circle");
        expect(circle!.getAttribute("fill")).toBe("#FF0000");
    });

    it("returns null when index is undefined", () => {
        const el = renderPmiLineDot({ cx: 10, cy: 20 }, 5);
        expect(el).not.toBeNull();
    });
});
