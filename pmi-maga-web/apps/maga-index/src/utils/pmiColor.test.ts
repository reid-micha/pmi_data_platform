import { describe, expect, it } from "vitest";
import { getPmiColor } from "./pmiColor";
describe("getPmiColor", () => {
    it("uses lowest band color for null and undefined", () => {
        expect(getPmiColor(null)).toBe("#00317A");
        expect(getPmiColor(undefined)).toBe("#00317A");
    });
    it("0-10", () => {
        expect(getPmiColor(0)).toBe("#00317A");
        expect(getPmiColor(10)).toBe("#00317A");
        expect(getPmiColor(-5)).toBe("#00317A");
    });
    it("11-20", () => {
        expect(getPmiColor(11)).toBe("#1756B5");
        expect(getPmiColor(20)).toBe("#1756B5");
    });
    it("21-30", () => {
        expect(getPmiColor(21)).toBe("#3B7EE2");
        expect(getPmiColor(30)).toBe("#3B7EE2");
    });
    it("31-40", () => {
        expect(getPmiColor(31)).toBe("#7DA8E8");
        expect(getPmiColor(40)).toBe("#7DA8E8");
    });
    it("41-50", () => {
        expect(getPmiColor(41)).toBe("#C2C8E8");
        expect(getPmiColor(50)).toBe("#C2C8E8");
    });
    it("51-60", () => {
        expect(getPmiColor(51)).toBe("#D8C6D9");
        expect(getPmiColor(60)).toBe("#D8C6D9");
    });
    it("61-70", () => {
        expect(getPmiColor(61)).toBe("#E96777");
        expect(getPmiColor(70)).toBe("#E96777");
    });
    it("71-80", () => {
        expect(getPmiColor(71)).toBe("#E01E35");
        expect(getPmiColor(80)).toBe("#E01E35");
    });
    it("81-90", () => {
        expect(getPmiColor(81)).toBe("#C40018");
        expect(getPmiColor(90)).toBe("#C40018");
    });
    it("uses top band color for 91 and above", () => {
        expect(getPmiColor(91)).toBe("#AD2D42");
        expect(getPmiColor(100)).toBe("#AD2D42");
        expect(getPmiColor(150)).toBe("#AD2D42");
    });
});
