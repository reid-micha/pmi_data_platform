import { fetchRegion } from '@micah/api';
import type { RegionDetail, WorldMarker } from '@micah/types';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import RegionTabs from '../components/RegionTabs';
import RegionView from '../components/RegionView';
import { buildRegionMarkers } from '../data/regionMarkersMap';
import { worldMarkers } from '../data/worldMarkers';

function RegionPage(): React.ReactElement | null {
    const [activeMarker, setActiveMarker] = useState<WorldMarker | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const { regionSlug } = useParams<{ regionSlug: string }>();
    const navigate = useNavigate();
    const [region, setRegion] = useState<RegionDetail | null>(null);
    const [loading, setLoading] = useState(true);

    // Find the selected region based on the URL slug parameter
    const selectedRegion = worldMarkers.find(marker => marker.slug === regionSlug);

    // Fetch region detail (includes countries with stats)
    useEffect(() => {
        if (!selectedRegion) return;

        setLoading(true);
        fetchRegion(selectedRegion.slug)
            .then(setRegion)
            .catch((err) => {
                console.error('Failed to fetch region:', err);
            })
            .finally(() => setLoading(false));
    }, [selectedRegion?.slug]);

    const regionCountries = region?.countries ?? [];

    // Build markers dynamically from country data
    const regionMarkers = selectedRegion
        ? buildRegionMarkers(regionCountries, selectedRegion.slug)
        : [];
        
    const handleBack = () => {
        navigate('/');
    };
    // Redirect to home when the slug doesn't match any region
    useEffect(() => {
        if (!selectedRegion) {
            navigate('/');
        }
    }, [selectedRegion, navigate]);

    if (!selectedRegion) {
        return null;
    }

    return (
        <Layout>
            <RegionView
                markers={regionMarkers}
                activeMarker={activeMarker}
                setActiveMarker={setActiveMarker}
                popupRef={popupRef}
                selectedRegion={selectedRegion}
                onBack={handleBack}
                region={region}
            />
            <div className="p-6 lg:p-12 border-dashed-spaced relative">
                <RegionTabs countries={regionCountries} loading={loading} regionSlug={selectedRegion.slug} />
                <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -left-[7px] -bottom-2 z-10"/>
                <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -right-[7px] -bottom-2 z-10"/>
            </div>
        </Layout>
    );
}

export default RegionPage;
