export interface SearchBarMoreResultsHintProps {
    hiddenCount: number;
    className?: string;
}

/** Footer line when more than `MAX_VISIBLE_SUGGESTIONS` matches exist (aligned with `SearchBar`). */
export default function SearchBarMoreResultsHint(props: SearchBarMoreResultsHintProps) {
    if (props.hiddenCount <= 0) return null;
    return (
        <p
            className={`border-t border-border-tertiary/40 bg-[#F1F2F5] px-2 py-2 text-xs font-medium leading-snug text-[#5D6B98] ${props.className ?? ''}`.trim()}
        >
            +{props.hiddenCount} more in matching results. Press Enter to see all results.
        </p>
    );
}
