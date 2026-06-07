import Cookies from "js-cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    WAR_INDEX_AUTH_TOKEN_COOKIE_NAME,
    clearWarIndexAuthTokenCookie,
    hasWarIndexAuthTokenCookie,
    setWarIndexAuthTokenCookie,
    STAGING_PASSWORD_GATE_COOKIE_VALUE,
} from "./authCookie";

const { mockGet } = vi.hoisted(() => ({
    mockGet: vi.fn<(name: string) => string | undefined>(),
}));

vi.mock("js-cookie", () => ({
    default: {
        set: vi.fn(),
        remove: vi.fn(),
        get: (name: string) => mockGet(name),
    },
}));

describe("authCookie", () => {
    const originalLocation = globalThis.location;

    beforeEach(() => {
        vi.mocked(Cookies.set).mockClear();
        vi.mocked(Cookies.remove).mockClear();
        mockGet.mockReset();
    });

    afterEach(() => {
        Object.defineProperty(globalThis, "location", {
            value: originalLocation,
            configurable: true,
            writable: true,
        });
    });

    function setProtocol(protocol: string) {
        Object.defineProperty(globalThis, "location", {
            value: { protocol },
            configurable: true,
            writable: true,
        });
    }

    it("exports expected cookie name and staging sentinel value", () => {
        expect(WAR_INDEX_AUTH_TOKEN_COOKIE_NAME).toBe("war_index_auth_token");
        expect(STAGING_PASSWORD_GATE_COOKIE_VALUE).toBe("staging-shared-password");
    });

    it("setWarIndexAuthTokenCookie passes token and options to Cookies.set", () => {
        setProtocol("http:");
        setWarIndexAuthTokenCookie("jwt-here");
        expect(Cookies.set).toHaveBeenCalledWith(
            WAR_INDEX_AUTH_TOKEN_COOKIE_NAME,
            "jwt-here",
            expect.objectContaining({
                expires: 7,
                path: "/",
                sameSite: "lax",
                secure: false,
            })
        );
    });

    it("setWarIndexAuthTokenCookie sets secure when protocol is https", () => {
        setProtocol("https:");
        setWarIndexAuthTokenCookie("x");
        expect(Cookies.set).toHaveBeenCalledWith(
            WAR_INDEX_AUTH_TOKEN_COOKIE_NAME,
            "x",
            expect.objectContaining({ secure: true })
        );
    });

    it("clearWarIndexAuthTokenCookie removes cookie with path", () => {
        setProtocol("http:");
        clearWarIndexAuthTokenCookie();
        expect(Cookies.remove).toHaveBeenCalledWith(WAR_INDEX_AUTH_TOKEN_COOKIE_NAME, { path: "/" });
    });

    it("clearWarIndexAuthTokenCookie passes secure when https", () => {
        setProtocol("https:");
        clearWarIndexAuthTokenCookie();
        expect(Cookies.remove).toHaveBeenCalledWith(WAR_INDEX_AUTH_TOKEN_COOKIE_NAME, {
            path: "/",
            secure: true,
        });
    });

    it("hasWarIndexAuthTokenCookie is false when cookie missing or empty", () => {
        mockGet.mockReturnValue(undefined);
        expect(hasWarIndexAuthTokenCookie()).toBe(false);
        mockGet.mockReturnValue("");
        expect(hasWarIndexAuthTokenCookie()).toBe(false);
    });

    it("hasWarIndexAuthTokenCookie is true when cookie has non-empty string", () => {
        mockGet.mockReturnValue("token");
        expect(hasWarIndexAuthTokenCookie()).toBe(true);
    });
});
