import type { MagaViewType } from '@micah/api';

export const MAGA_STATE_VIEWS: { label: string; value: MagaViewType }[] = [
    { label: 'All', value: 'state' },
    { label: 'Governor', value: 'governor' },
    { label: 'Senate', value: 'senate' },
    { label: 'House', value: 'house' },
];

