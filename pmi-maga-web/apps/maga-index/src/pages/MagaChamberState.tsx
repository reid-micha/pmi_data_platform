import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import MagaStateDetailPage from '../components/MagaStateDetailPage';
import { chamberViewFromPathname } from '../utils/stateRouteId';

function MagaChamberState(): React.ReactElement | null {
    const { stateId } = useParams<{ stateId: string }>();
    const { pathname } = useLocation();
    const activeView = chamberViewFromPathname(pathname);

    if (!activeView) {
        return null;
    }

    return <MagaStateDetailPage stateId={stateId} activeView={activeView} />;
}

export default MagaChamberState;
