import React from 'react';
import { Link } from 'react-router-dom';
import { PLACEHOLDER_TAGS } from '../../constants';

interface TagListProps {
    tags: string[];
    max?: number;
    /** Optional: return a route path for a tag to make it a clickable link */
    getTagLink?: (tag: string) => string | null;
}

export default function TagList({ tags, max = 8, getTagLink }: TagListProps): React.ReactElement {
    const resolved = tags.length > 0 ? tags : PLACEHOLDER_TAGS;
    const visible = resolved.slice(0, max);
    const extra = resolved.length - visible.length;

    const tagClass = "py-1 px-2 bg-bg-dark-primary border border-border-primary rounded-md text-sm text-text-secondary hover:bg-border-primary transition-all duration-300 hover:text-white cursor-pointer whitespace-nowrap";

    return (
        <div className="flex items-center gap-1 mt-3 overflow-hidden" style={{ maxHeight: '2rem' }}>
            <div className="flex items-center gap-1 overflow-hidden min-w-0">
                {visible.map((tag, i) => {
                    const link = getTagLink ? getTagLink(tag) : null;
                    return link ? (
                        <Link key={`${tag}-${i}`} to={link} className={tagClass}>
                            {tag}
                        </Link>
                    ) : (
                        <span key={`${tag}-${i}`} className={tagClass}>
                            {tag}
                        </span>
                    );
                })}
            </div>
            {extra > 0 && (
                <span className="py-1 px-2 bg-bg-dark-primary border border-border-primary rounded-md text-sm text-text-secondary whitespace-nowrap flex-shrink-0">
                    +{extra} More
                </span>
            )}
        </div>
    );
}
