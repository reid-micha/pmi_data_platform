const PM_MARKET_ICONS: Record<string, string> = {
    kalshi: '/images/PMMarkets/kalshi.svg',
    polymarket: '/images/PMMarkets/polymarket.svg',
    predictit: '/images/PMMarkets/predictit.svg',
    metaculus: '/images/PMMarkets/metaculus.svg',
    manifold: '/images/PMMarkets/manifold.svg',
    gemini: '/images/PMMarkets/gemini.svg',
    forecastex: '/images/PMMarkets/forecastex.svg',
    robinhood: '/images/PMMarkets/robinhood.svg',
    coinbase: '/images/PMMarkets/coinbase.svg',
    'interactive brokers': '/images/PMMarkets/interactive-brokers.svg',
    'interactive-brokers': '/images/PMMarkets/interactive-brokers.svg',
    'crypto.com': '/images/PMMarkets/crypto.svg',
    'crypto': '/images/PMMarkets/crypto.svg',
};

/** Resolve icon path for a prediction-market `website` / source slug, or `null` if unknown. */
export function getPMIcon(website: string): string | null {
    const key = website.trim().toLowerCase();
    return PM_MARKET_ICONS[key] ?? null;
}
