export interface YAxisDomainResult {
    domain: [number, number];
    ticks: number[];
}

export interface ComputeYAxisDomainOptions {
    absoluteMin?: number;
    absoluteMax?: number;
}

const DEFAULT_ABS_MIN = 0;
const DEFAULT_ABS_MAX = 100;
const MAX_TICKS = 7;
const MIN_RANGE = 4;
const STEP_UNIT = 2;

/**
 * Compute a dynamic Y-axis domain that adapts to data spread.
 * When values cluster tightly (e.g. 85–90), the axis zooms in so differences
 * are visually apparent. For wide spreads (e.g. 10–90) it falls back to
 * the full [absoluteMin, absoluteMax] range.
 */
export function computeYAxisDomain(
    values: number[],
    options?: ComputeYAxisDomainOptions,
): YAxisDomainResult {
    const absMin = options?.absoluteMin ?? DEFAULT_ABS_MIN;
    const absMax = options?.absoluteMax ?? DEFAULT_ABS_MAX;

    if (values.length === 0) {
        return buildResult(absMin, absMax);
    }

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const spread = dataMax - dataMin;

    const padding = Math.max(spread * 0.3, 2);

    let yMin = Math.floor((dataMin - padding) / STEP_UNIT) * STEP_UNIT;
    let yMax = Math.ceil((dataMax + padding) / STEP_UNIT) * STEP_UNIT;

    if (yMax - yMin < MIN_RANGE) {
        const mid = (dataMin + dataMax) / 2;
        yMin = Math.floor((mid - MIN_RANGE / 2) / STEP_UNIT) * STEP_UNIT;
        yMax = yMin + MIN_RANGE;
    }

    yMin = Math.max(absMin, yMin);
    yMax = Math.min(absMax, yMax);

    if (yMax - yMin < MIN_RANGE) {
        if (yMin === absMin) {
            yMax = Math.min(absMax, yMin + MIN_RANGE);
        } else {
            yMin = Math.max(absMin, yMax - MIN_RANGE);
        }
    }

    return buildResult(yMin, yMax);
}

function pickStep(range: number): number {
    const multipliers = [1, 2, 5, 10, 25, 50];
    for (const m of multipliers) {
        const step = STEP_UNIT * m;
        if (range / step <= MAX_TICKS) return step;
    }
    return STEP_UNIT * 50;
}

function buildResult(rawMin: number, rawMax: number): YAxisDomainResult {
    const step = pickStep(rawMax - rawMin);
    const yMin = Math.floor(rawMin / step) * step;
    const yMax = Math.ceil(rawMax / step) * step;

    const ticks: number[] = [];
    for (let v = yMin; v <= yMax + step * 0.001; v += step) {
        ticks.push(Math.round(v));
    }
    return { domain: [yMin, yMax], ticks };
}
