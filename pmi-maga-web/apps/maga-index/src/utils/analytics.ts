let initialized = false;

declare global {
    interface Window {
        dataLayer?: unknown[];
        gtag?: (...args: unknown[]) => void;
    }
}

function getMeasurementId(): string {
    return import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';
}

function isValidMeasurementId(id: string): boolean {
    return /^G-[A-Z0-9]+$/i.test(id);
}

export function initAnalytics(): void {
    const measurementId = getMeasurementId();
    if (!isValidMeasurementId(measurementId) || initialized) return;

    // 1. Initialize dataLayer and gtag stub FIRST
    window.dataLayer = window.dataLayer || [];

    // Use standard function to preserve 'arguments' object for gtag.js
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function () { window.dataLayer?.push(arguments); };

    // 2. Queue consent, js, and config BEFORE injecting the script
    window.gtag('consent', 'default', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
    });

    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: false });

    // 3. THEN inject the script tag
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    initialized = true;
}

export function trackPageView(path: string): void {
    const measurementId = getMeasurementId();
    if (!isValidMeasurementId(measurementId) || !window.gtag) return;

    window.gtag('event', 'page_view', {
        page_path: path,
        page_title: document.title,
        page_location: window.location.href,
        send_to: measurementId,
    });
}
