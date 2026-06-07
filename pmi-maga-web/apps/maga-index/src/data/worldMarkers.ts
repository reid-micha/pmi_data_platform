import type { WorldMarker } from '@micah/types';

export const worldMarkers: WorldMarker[] = [
    {
        id: 1,
        slug: 'americas',
        top: '40%',
        left: '20%',
        mobileTop: '50%',
        mobileLeft: '25%',
        number: '73',
        title: 'Americas Conflict Index',
        description: 'An aggregated, data-driven estimate of the likelihood of significant geopolitical or military conflict across North, Central, and South America, derived from active prediction market contracts and exchange signals.',
        tags: ['War', 'Europe', 'Ukraine', 'Russia', '+3'],
        hotspotColor: '#E04F16',
        mapImage: '/images/Americas.svg'
    },
    {
        id: 2,
        slug: 'europe',
        top: '32%',
        left: '50%',
        mobileTop: '8%',
        mobileLeft: '38%',
        number: '55',
        title: 'Europe Conflict Index',
        description: 'An aggregated, data-driven estimate of the likelihood of significant geopolitical or military conflict across Europe, derived from active prediction market contracts and exchange signals.',
        tags: ['War', 'Europe', 'Ukraine', 'Russia', '+3'],
        hotspotColor: '#F7B27A',
        mapImage: '/images/Europe.svg'
    },
    {
        id: 3,
        slug: 'africa',
        top: '57%',
        left: '52%',
        mobileTop: '30%',
        mobileLeft: '55%',
        number: '35',
        title: 'Africa Conflict Index',
        description: 'An aggregated, data-driven estimate of the likelihood of significant geopolitical or military conflict across Africa, derived from active prediction market contracts and exchange signals.',
        tags: ['War', 'Europe', 'Ukraine', 'Russia', '+3'],
        hotspotColor: '#B93815',
        mapImage: '/images/Africa.svg'
    },
    {
        id: 4,
        slug: 'asia',
        top: '44%',
        left: '77%',
        mobileTop: '46%',
        mobileLeft: '76%',
        number: '40',
        title: 'Asia Conflict Index',
        description: 'An aggregated, data-driven estimate of the likelihood of significant geopolitical or military conflict across Asia, derived from active prediction market contracts and exchange signals.',
        tags: ['War', 'Europe', 'Ukraine', 'Russia', '+3'],
        hotspotColor: '#BC1B06',
        mapImage: '/images/Asia.svg'
    },
    {
        id: 5,
        slug: 'middle-east',
        top: '47%',
        left: '60%',
        mobileTop: '18%',
        mobileLeft: '72%',
        number: '80',
        title: 'Middle East Conflict Index',
        description: 'An aggregated, data-driven estimate of the likelihood of significant geopolitical or military conflict across the Middle East, derived from active prediction market contracts and exchange signals.',
        tags: ['War', 'Europe', 'Ukraine', 'Russia', '+3'],
        hotspotColor: '#F38744',
        mapImage: '/images/Middle-East.svg'
    },
    {
        id: 6,
        slug: 'oceania',
        top: '80%',
        left: '85%',
        mobileTop: '18%',
        mobileLeft: '72%',
        number: '25',
        title: 'Oceania Conflict Index',
        description: 'An aggregated, data-driven estimate of the likelihood of significant geopolitical or military conflict across Oceania, derived from active prediction market contracts and exchange signals.',
        tags: ['War', 'Europe', 'Ukraine', 'Russia', '+3'],
        hotspotColor: '#F38744',
        mapImage: '/images/Oceania.svg'
    }
];
