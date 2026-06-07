import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("isStagingEnvEnabled", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns true only when VITE_IS_STAGING is exactly the string true", async () => {
        vi.stubEnv("VITE_IS_STAGING", "true");
        const { isStagingEnvEnabled } = await import("./env");
        expect(isStagingEnvEnabled()).toBe(true);
    });

    it("returns false for other values", async () => {
        vi.stubEnv("VITE_IS_STAGING", "false");
        const { isStagingEnvEnabled } = await import("./env");
        expect(isStagingEnvEnabled()).toBe(false);
        vi.resetModules();
        vi.unstubAllEnvs();
        vi.stubEnv("VITE_IS_STAGING", "");
        const m2 = await import("./env");
        expect(m2.isStagingEnvEnabled()).toBe(false);
    });
});

describe("getApiBase", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("prefers VITE_API_BASE over VITE_API_URL when both are set", async () => {
        vi.stubEnv("VITE_API_BASE", "https://api.example.com/");
        vi.stubEnv("VITE_API_URL", "https://fallback.example.com");
        const { getApiBase } = await import("./env");
        expect(getApiBase()).toBe("https://api.example.com");
    });

    it("uses VITE_API_URL when VITE_API_BASE is unset", async () => {
        vi.stubEnv("VITE_API_URL", "https://only.example.com///");
        const { getApiBase } = await import("./env");
        expect(getApiBase()).toBe("https://only.example.com");
    });

    it("strips trailing slashes", async () => {
        vi.stubEnv("VITE_API_BASE", "https://x.com/v1/");
        const { getApiBase } = await import("./env");
        expect(getApiBase()).toBe("https://x.com/v1");
    });
});
