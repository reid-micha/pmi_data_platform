import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { highlightMatch, matchesFilter } from "./searchFilter";

describe("matchesFilter", () => {
    it("treats empty or whitespace-only filter as no filter (always true)", () => {
        expect(matchesFilter("anything", "")).toBe(true);
        expect(matchesFilter("anything", "   ")).toBe(true);
    });

    it("uses valid regex case-insensitively", () => {
        expect(matchesFilter("Hello World", "world")).toBe(true);
        expect(matchesFilter("Hello", "^h")).toBe(true);
        expect(matchesFilter("Hello", "^x")).toBe(false);
    });

    it("falls back to case-insensitive includes() for invalid regex", () => {
        expect(matchesFilter("a(b)c", "(")).toBe(true);
        expect(matchesFilter("abc", "[")).toBe(false);
    });
});

describe("highlightMatch", () => {
    it("returns plain text when filter is empty", () => {
        expect(highlightMatch("abc", "")).toBe("abc");
        expect(highlightMatch("abc", "  ")).toBe("abc");
    });

    it("wraps matches in a span for a valid pattern", () => {
        const { container } = render(<>{highlightMatch("Hello", "ell")}</>);
        const spans = container.querySelectorAll("span");
        expect(spans.length).toBeGreaterThan(0);
        expect(spans[0]?.textContent).toBe("ell");
        expect(spans[0]?.className).toContain("bg-[#FEF6EE]");
    });

    it("escapes pattern and matches when regex is invalid", () => {
        const { container } = render(<>{highlightMatch("a(1)b", "(")}</>);
        expect(container.textContent).toBe("a(1)b");
        expect(container.querySelector("span")?.textContent).toBe("(");
    });
});
