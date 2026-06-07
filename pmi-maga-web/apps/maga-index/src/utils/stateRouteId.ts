import type { MagaViewType } from '@micah/api';
import type { MagaState, TabType } from '@micah/types';

/** Route slug for /state/:stateId — prefers API id, else matches backend state_id(). */
export function stateRouteId(name: string, state?: MagaState | null): string {
    return state?.id ?? name.toLowerCase().replace(/\s+/g, '-');
}

export function statePagePath(name: string, state?: MagaState | null): string {
    return `/state/${stateRouteId(name, state)}`;
}

const CHAMBER_PATH_PREFIX: Record<'governor' | 'senate' | 'house', string> = {
    governor: '/governor/states',
    senate: '/senate/states',
    house: '/house/states',
};

export function chamberStatePagePath(
    chamber: 'governor' | 'senate' | 'house',
    name: string,
    state?: MagaState | null,
): string {
    return `${CHAMBER_PATH_PREFIX[chamber]}/${stateRouteId(name, state)}`;
}

/** Map / small-state links follow the active home tab. */
export function statePagePathForTab(
    name: string,
    state: MagaState | null | undefined,
    tab: TabType,
): string {
    switch (tab) {
        case 'governor':
            return chamberStatePagePath('governor', name, state);
        case 'senate':
            return chamberStatePagePath('senate', name, state);
        case 'house':
            return chamberStatePagePath('house', name, state);
        default:
            return statePagePath(name, state);
    }
}

export const CHAMBER_VIEW_LABELS: Record<'governor' | 'senate' | 'house', string> = {
    governor: 'Governor',
    senate: 'Senate',
    house: 'House',
};

export function chamberViewFromPathname(pathname: string): 'governor' | 'senate' | 'house' | null {
    if (pathname.startsWith('/governor/states/')) return 'governor';
    if (pathname.startsWith('/senate/states/')) return 'senate';
    if (pathname.startsWith('/house/states/')) return 'house';
    return null;
}

export function isChamberMagaView(view: MagaViewType): view is 'governor' | 'senate' | 'house' {
    return view === 'governor' || view === 'senate' || view === 'house';
}
