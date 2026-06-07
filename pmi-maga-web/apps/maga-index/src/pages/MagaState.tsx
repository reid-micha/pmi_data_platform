import React from 'react';
import { useParams } from 'react-router-dom';
import MagaStateDetailPage from '../components/MagaStateDetailPage';

function MagaState(): React.ReactElement | null {
    const { stateId } = useParams<{ stateId: string }>();
    return <MagaStateDetailPage stateId={stateId} activeView="state" />;
}

export default MagaState;
