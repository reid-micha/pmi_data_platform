import type { WorldMarker, Country, CountryInRegion } from '@micah/types';
import { getPmiColor } from '@micah/ui';
import { countryCoordinates } from './countryCoordinates';
import { STATIC_REGION_COUNTRIES } from './staticRegionCountries';

/** `true`：區域頁統一用世界地圖預覽（`/images/map.png`）。改回 `false` 即恢復各區獨立地圖。 */
export const USE_WORLD_MAP_PREVIEW = false;

const WORLD_MAP_IMAGE = '/images/map.png';

/** Region map images keyed by region slug. */
const regionMapImages: Record<string, string> = {
    'americas': '/images/america-map.png',
    'europe': '/images/europe-map.png',
    'africa': '/images/africa-map.png',
    'asia': '/images/asia-map.webp',
    'middle-east': '/images/middle-east.webp',
    'oceania': '/images/oceania-map.png',
};

/**
 * Build region markers from a static, manually-curated list of country slugs
 * per region (defined in staticRegionCountries.ts).
 * PMI score and colour are enriched from live country data when available.
 */
export function buildRegionMarkers(
    countries: (Country | CountryInRegion)[],
    regionSlug: string,
): WorldMarker[] {
    const mapImage = USE_WORLD_MAP_PREVIEW
        ? WORLD_MAP_IMAGE
        : (regionMapImages[regionSlug] ?? '');
    const staticSlugs = STATIC_REGION_COUNTRIES[regionSlug] ?? [];

    // Index live country data by slug for quick lookup
    const countryBySlug = new Map<string, Country | CountryInRegion>(countries.map((c) => [c.id, c]));

    return staticSlugs
        .filter((slug) => slug in countryCoordinates)
        .map((slug, i) => {
            const coords = countryCoordinates[slug];
            const liveData = countryBySlug.get(slug);
            const score = liveData?.pmiScore != null ? liveData.pmiScore : null;
            const displayNumber = score != null ? Number(score).toFixed(1) : 'N/A';
            const hotspotColor = getPmiColor(score ?? 0);

            return {
                id: i + 1,
                slug,
                top: coords.top,
                left: coords.left,
                mobileTop: coords.top,
                mobileLeft: coords.left,
                number: displayNumber,
                title: liveData?.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
                description: '',
                tags: [],
                hotspotColor,
                mapImage,
                countryId: slug,
            };
        });
}



