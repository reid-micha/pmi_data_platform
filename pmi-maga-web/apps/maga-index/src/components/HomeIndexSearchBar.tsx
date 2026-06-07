import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import HoldingsSearchInput from './shared/HoldingsSearchInput';

/** Local draft; committed query lives in URL `?q=` so Home does not need a callback. */
export default function HomeIndexSearchBar(): React.ReactElement {
    const [, setSearchParams] = useSearchParams();
    const [draft, setDraft] = useState('');

    const commitSearch = () => {
        const q = draft.trim();
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (q) {
                next.set('q', q);
            } else {
                next.delete('q');
            }
            return next;
        });
    };

    return (
        <HoldingsSearchInput
            value={draft}
            onChange={setDraft}
            onSearch={commitSearch}
            placeholder="Search indexes"
        />
    );
}
