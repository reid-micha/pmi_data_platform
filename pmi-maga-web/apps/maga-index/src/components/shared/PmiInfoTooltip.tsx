import React, { useState } from 'react';

const PMI_SCORE_TITLE = 'PMI Score';
const PMI_SCORE_TEXT =
    "The Prediction Market Index (PMI) Score is calculated by aggregating and structuring related prediction market contracts (PMI Holdings). A higher PMI Score reflects a greater likelihood of MAGA-aligned political outcomes and narratives materializing.";

const PMI_HOLDINGS_TITLE = 'PMI Holdings';
const PMI_HOLDINGS_TEXT =
    "PMI Holdings are the component prediction market contracts that make up a PMI. A PMI's holdings are structured using Micah's proprietary software and algorithms to create a PMI Score for multi-factor indexes, and a PMI Probability (%) for single-factor indexes.";

type TooltipKey = 'pmiScore' | 'pmiHoldings';

interface PmiInfoTooltipProps {
    type: TooltipKey;
}

export default function PmiInfoTooltip({ type }: PmiInfoTooltipProps): React.ReactElement {
    const [open, setOpen] = useState(false);

    const title = type === 'pmiScore' ? PMI_SCORE_TITLE : PMI_HOLDINGS_TITLE;
    const text  = type === 'pmiScore' ? PMI_SCORE_TEXT  : PMI_HOLDINGS_TEXT;

    return (
        <>
            {/* Icon + desktop hover tooltip */}
            <div className="relative group">
                <img
                    src="/images/info-circle.svg"
                    alt="Info Icon"
                    className="cursor-pointer"
                    onClick={() => setOpen(true)}

                />
                {/* Desktop only — shown on hover */}
                <div className="hidden lg:group-hover:block p-3 bg-white rounded-lg shadow-md min-w-80 w-full absolute left-8 top-0 text-start z-50 pointer-events-none">
                    <h6 className="text-sm font-semibold text-text-primary">{title}</h6>
                    <p className="text-sm text-border-secondary mt-1">{text}</p>
                </div>
            </div>

            {/* Mobile bottom sheet — only rendered when open */}
            {open && (
                <>
                    {/* Backdrop */}
                    <div
                        className="lg:hidden fixed inset-0 bg-black/40 z-40"
                        onClick={() => setOpen(false)}
                    />
                    {/* Sheet */}
                    <div className="lg:hidden fixed text-start bottom-0 left-0 right-0 z-100 bg-white rounded-t-2xl shadow-xl pl-6 pr-6 pt-6 pb-16 animate-slideUp">
                        <div className="flex justify-end p-2 cursor-pointer" onClick={() => setOpen(false)}><img src="/images/close-btn.svg" alt="Close Btn"/></div>
                        <h6 className="text-base font-semibold text-text-primary mb-2">{title}</h6>
                        <p className="text-sm text-border-secondary leading-6">{text}</p>
                    </div>
                </>
            )}
        </>
    );
}

