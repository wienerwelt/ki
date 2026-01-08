// frontend/src/components/widgetMapping.ts
import React from 'react';

// This object maps the 'component_key' or 'type_key' from your database 
// to the actual React component file.
export const WIDGET_COMPONENTS: { [key: string]: React.LazyExoticComponent<React.ComponentType<any>> } = {
    GenericAI: React.lazy(() => import('./widgets/GenericAIWidget')),
    GenericScrape: React.lazy(() => import('./widgets/GenericScrapeWidget')),
    BusinessPartnerInfo: React.lazy(() => import('./widgets/BusinessPartnerInfoWidget')),
    TrafficInfo: React.lazy(() => import('./widgets/TrafficInfoWidget')),
    FuelPrices: React.lazy(() => import('./widgets/FuelPricesWidget')),
    VignettePreise: React.lazy(() => import('./widgets/VignetteWidget')),
    EVStation: React.lazy(() => import('./widgets/EVStationWidget')),
    BusinessPartnerAktionen: React.lazy(() => import('./widgets/BusinessPartnerActionsWidget')),
    TrustedSources: React.lazy(() => import('./widgets/TrustedSourcesWidget')),
    CommodityPrices: React.lazy(() => import('./widgets/CommodityPricesWidget')),
    FileDownload: React.lazy(() => import('./widgets/FileDownloadWidget')),
    EventCalendar: React.lazy(() => import('./widgets/EventCalendarWidget')),
    PodcastWidget: React.lazy(() => import('./widgets/PodcastWidget')),
    VideoWidget: React.lazy(() => import('./widgets/VideoWidget')),
    survey_widget: React.lazy(() => import('./widgets/SurveyWidget')),
    TcoCalculatorWidget: React.lazy(() => import('./widgets/TcoCalculatorWidget')),
    FundingWidget: React.lazy(() => import('./widgets/FundingWidget')),
    EconomicStat: React.lazy(() => import('./widgets/EconomicStatWidget')),
    AccountIntelligenceWidget: React.lazy(() => import('./widgets/AccountIntelligenceWidget')),
    DailyCockpitWidget: React.lazy(() => import('./widgets/DailyCockpitWidget')),
    LegalMonitor: React.lazy(() => import('./widgets/LegalMonitorWidget')),
    community_feed: React.lazy(() => import('./widgets/CommunityFeedWidget')),
    user_profile: React.lazy(() => import('./widgets/UserProfileWidget')),
    sentiment_widget: React.lazy(() => import('./widgets/SentimentWidget')),
    CurrencyConverter: React.lazy(() => import('./widgets/CurrencyConverterWidget')),
};