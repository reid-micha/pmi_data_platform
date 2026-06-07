import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("initAnalytics", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        delete window.dataLayer;
        delete window.gtag;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("does not inject script when measurement id is missing", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "");
        const appendSpy = vi.spyOn(document.head, "appendChild").mockReturnValue({} as unknown as Node);
        const { initAnalytics } = await import("./analytics");
        initAnalytics();
        expect(appendSpy).not.toHaveBeenCalled();
    });

    it("does not inject script when measurement id is invalid", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "not-a-g-id");
        const appendSpy = vi.spyOn(document.head, "appendChild").mockReturnValue({} as unknown as Node);
        const { initAnalytics } = await import("./analytics");
        initAnalytics();
        expect(appendSpy).not.toHaveBeenCalled();
    });

    it("sets dataLayer and gtag and appends gtag.js script when measurement id is valid", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "G-ABC12345");
        const appendSpy = vi.spyOn(document.head, "appendChild").mockImplementation((n) => n);
        const { initAnalytics } = await import("./analytics");
        initAnalytics();
        expect(window.dataLayer).toBeDefined();
        expect(typeof window.gtag).toBe("function");
        expect(appendSpy).toHaveBeenCalledTimes(1);
        const script = appendSpy.mock.calls[0]?.[0] as HTMLScriptElement;
        expect(script.tagName).toBe("SCRIPT");
        expect(script.src).toContain("googletagmanager.com");
        expect(script.src).toContain("G-ABC12345");
    });

    it("does not append a second script on repeated init", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "G-ABC12345");
        const appendSpy = vi.spyOn(document.head, "appendChild").mockImplementation((n) => n);
        const { initAnalytics } = await import("./analytics");
        initAnalytics();
        initAnalytics();
        expect(appendSpy).toHaveBeenCalledTimes(1);
    });
});

describe("trackPageView", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        delete window.dataLayer;
        delete window.gtag;
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "G-TRACK01");
        vi.spyOn(document.head, "appendChild").mockImplementation((n) => n);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("calls gtag with page_view payload when analytics was initialized", async () => {
        const { initAnalytics, trackPageView } = await import("./analytics");
        initAnalytics();
        const gtagCalls: unknown[][] = [];
        const realGtag = window.gtag!;
        window.gtag = (...args: unknown[]) => {
            gtagCalls.push(args);
            return realGtag(...args);
        };
        trackPageView("/custom-path");
        expect(gtagCalls.some((c) => c[0] === "event" && c[1] === "page_view")).toBe(true);
        const pageViewCall = gtagCalls.find((c) => c[0] === "event" && c[1] === "page_view");
        expect(pageViewCall?.[2]).toMatchObject({
            page_path: "/custom-path",
            send_to: "G-TRACK01",
        });
    });

    it("no-ops when gtag is not defined", async () => {
        const { trackPageView } = await import("./analytics");
        expect(window.gtag).toBeUndefined();
        expect(() => trackPageView("/any")).not.toThrow();
    });
});
