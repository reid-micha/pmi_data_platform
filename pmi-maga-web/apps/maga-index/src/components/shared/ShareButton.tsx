import React, { useState, useEffect, useRef } from 'react';

interface ShareButtonProps {
    /** The URL to share. Defaults to the current page URL when not provided. */
    url?: string;
}
export default function ShareButton({ url }: ShareButtonProps): React.ReactElement {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleToggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen((prev) => !prev);
    };

    const shareUrl = url ?? window.location.href;

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(shareUrl);
        setIsOpen(false);
    };

    const handleNativeShare = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        try {
            await navigator.share({ url: shareUrl });
        } catch {
            // User cancelled the share sheet
        }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                className="flex items-center gap-1.5 w-9 h-9 border border-border-primary rounded-lg justify-center cursor-pointer"
                onClick={handleToggle}
            >
                <img src="/images/share.svg" alt="Share" />
            </button>

            {isOpen && (
                <div className="absolute right-0 w-full min-w-44 p-5 bg-bg-dark-primary rounded-lg shadow-md bottom-[120%] flex flex-col gap-2">
                    <button
                        className="flex items-center gap-1.5 py-2.5 px-3.5 border border-border-primary rounded-lg justify-center cursor-pointer"
                        onClick={handleCopy}
                    >
                        <img src="/images/copy-button.svg" alt="Copy URL" />
                        <p className="text-base text-text-secondary font-semibold">Copy URL</p>
                    </button>

                    {canNativeShare && (
                        <button
                            className="flex items-center gap-1.5 py-2.5 px-3.5 border border-border-primary rounded-lg justify-center cursor-pointer whitespace-nowrap"
                            onClick={handleNativeShare}
                        >
                            <img src="/images/share-external.svg" alt="Share via" />
                            <p className="text-base text-text-secondary font-semibold">Share via...</p>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
