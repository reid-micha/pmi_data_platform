import React from "react";

export interface PmiLineDotInput {
    cx?: number;
    cy?: number;
    index?: number;
}

const DEFAULT_DOT_COLOR = "#F7B27A";

export function renderPmiLineDot(
    props: PmiLineDotInput,
    dataLength: number,
    getDotColor?: () => string,
): React.ReactElement | null {
    const { cx, cy, index } = props;
    if (index === dataLength - 1) {
        const color = getDotColor ? getDotColor() : DEFAULT_DOT_COLOR;
        return <circle cx={cx} cy={cy} r={6} fill={color} />;
    }
    return <circle cx={cx} cy={cy} r={0} fill="#6594AB" opacity={0.9} />;
}
