import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartTooltip, PmiScoreChart } from "./PmiScoreChart";

vi.mock("recharts", () => {
    const React = require("react");
    return {
        ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
        LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => <div data-testid="line-chart" data-count={data.length}>{children}</div>,
        CartesianGrid: () => <div data-testid="cartesian-grid" />,
        XAxis: () => <div data-testid="x-axis" />,
        YAxis: ({ domain, ticks }: { domain: number[]; ticks: number[] }) => (
            <div data-testid="y-axis" data-domain={JSON.stringify(domain)} data-ticks={JSON.stringify(ticks)} />
        ),
        Tooltip: () => <div data-testid="tooltip" />,
        Line: () => <div data-testid="line" />,
    };
});

describe("PmiScoreChart", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("renders loading skeleton when loading=true", () => {
        const { container } = render(<PmiScoreChart type="region" loading />);
        const skeletons = container.querySelectorAll('[class*="react-loading-skeleton"]');
        expect(skeletons.length).toBeGreaterThan(0);
        expect(screen.queryByTestId("line-chart")).toBeNull();
    });

    it("renders chart when loading=false with data", () => {
        const data = [
            { month: "2024-06-10", value: 85 },
            { month: "2024-06-11", value: 87 },
            { month: "2024-06-12", value: 86 },
        ];
        render(<PmiScoreChart type="region" data={data} />);
        expect(screen.getByTestId("line-chart")).toBeTruthy();
    });

    it("applies dynamic Y-axis domain (not hardcoded 0-100) for tight data", () => {
        const data = [
            { month: "2024-06-10", value: 85 },
            { month: "2024-06-11", value: 87 },
            { month: "2024-06-12", value: 86 },
        ];
        render(<PmiScoreChart type="region" data={data} />);
        const yAxis = screen.getByTestId("y-axis");
        const domain = JSON.parse(yAxis.getAttribute("data-domain")!);
        expect(domain[0]).toBeGreaterThan(0);
        expect(domain[1]).toBeLessThan(100);
    });

    it("renders with empty data without crashing", () => {
        render(<PmiScoreChart type="country" data={[]} />);
        expect(screen.getByTestId("line-chart")).toBeTruthy();
    });
});

describe("ChartTooltip", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("returns null when inactive", () => {
        const { container } = render(
            <ChartTooltip active={false} payload={[{ name: "value", value: 12.3 }]} label={Date.now()} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("returns null when payload is empty", () => {
        const { container } = render(<ChartTooltip active payload={[]} label={Date.now()} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders payload values with one decimal place", () => {
        render(<ChartTooltip active payload={[{ name: "a", value: 42.567 }]} label={Date.now()} />);
        expect(screen.getByText("42.6")).toBeTruthy();
    });

    it("applies custom tooltip colors", () => {
        const { container } = render(
            <ChartTooltip
                active
                payload={[{ name: "a", value: 50 }]}
                label={Date.now()}
                tooltipColor="#FF0000"
                tooltipTextColor="#FFFFFF"
            />,
        );
        const div = container.firstChild as HTMLElement;
        expect(div.style.backgroundColor).toBe("rgb(255, 0, 0)");
        expect(div.style.color).toBe("rgb(255, 255, 255)");
    });

    it("uses default colors when custom colors not provided", () => {
        const { container } = render(
            <ChartTooltip active payload={[{ name: "a", value: 50 }]} label={Date.now()} />,
        );
        const div = container.firstChild as HTMLElement;
        expect(div.style.backgroundColor).toBe("rgb(247, 178, 122)");
    });

    it("formats label with toLocaleString including time (en-US)", () => {
        const ts = Date.UTC(2024, 5, 15, 14, 30, 0);
        const spy = vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("Jun 15, 2024, 2:30 PM");

        render(
            <ChartTooltip active payload={[{ name: "value", value: 1 }]} label={ts} />,
        );

        expect(spy).toHaveBeenCalledWith("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
        expect(screen.getByText("Jun 15, 2024, 2:30 PM")).toBeTruthy();
    });

    it("accepts label as numeric timestamp string", () => {
        const ts = Date.UTC(2024, 5, 15, 14, 30, 0);
        const spy = vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("stub-date-time");

        render(
            <ChartTooltip active payload={[{ name: "value", value: 5 }]} label={String(ts)} />,
        );

        expect(spy).toHaveBeenCalled();
        expect(screen.getByText("stub-date-time")).toBeTruthy();
    });
});
