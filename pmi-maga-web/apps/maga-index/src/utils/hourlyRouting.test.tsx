import { renderHook } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { parseHourlyParam, useHourlyParam, withHourlyParam } from "./hourlyRouting";

describe("parseHourlyParam", () => {
    it("is true only when the value is exactly 'true'", () => {
        expect(parseHourlyParam("true")).toBe(true);
        expect(parseHourlyParam(null)).toBe(false);
        expect(parseHourlyParam("")).toBe(false);
        expect(parseHourlyParam("false")).toBe(false);
        expect(parseHourlyParam("TRUE")).toBe(false);
    });
});

describe("withHourlyParam", () => {
    it("appends hourly=true when there is no query string", () => {
        expect(withHourlyParam("/regions", true)).toBe("/regions?hourly=true");
    });

    it("appends hourly to an existing query string", () => {
        expect(withHourlyParam("/regions?foo=1", true)).toBe("/regions?foo=1&hourly=true");
    });

    it("removes hourly when hourly flag is false", () => {
        expect(withHourlyParam("/regions?hourly=true", false)).toBe("/regions");
        expect(withHourlyParam("/regions?foo=1&hourly=true", false)).toBe("/regions?foo=1");
    });

    it("preserves the URL hash", () => {
        expect(withHourlyParam("/map#view", true)).toBe("/map?hourly=true#view");
        expect(withHourlyParam("/map?x=1#view", true)).toBe("/map?x=1&hourly=true#view");
    });
});

function hookWithSearch(initialEntry: string) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    );
    return renderHook(() => useHourlyParam(), { wrapper });
}

describe("useHourlyParam", () => {
    it("is true when the URL has hourly=true", () => {
        const { result } = hookWithSearch("/q?hourly=true");
        expect(result.current).toBe(true);
    });

    it("is false when hourly is missing or not exactly true", () => {
        expect(hookWithSearch("/q").result.current).toBe(false);
        expect(hookWithSearch("/q?hourly=false").result.current).toBe(false);
    });
});
