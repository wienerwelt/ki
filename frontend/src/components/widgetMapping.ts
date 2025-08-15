// frontend/src/components/widgetMapping.ts
import React from 'react';

// Importiere hier ALLE deine Widget-Komponenten
import GenericAIWidget from './widgets/GenericAIWidget';
import GenericScrapeWidget from './widgets/GenericScrapeWidget';
import BusinessPartnerInfoWidget from './widgets/BusinessPartnerInfoWidget';
import TrafficInfoWidget from './widgets/TrafficInfoWidget';
import FuelPricesWidget from './widgets/FuelPricesWidget';
import TaxChangesWidget from './widgets/TaxChangesWidget';
import FleetNewsWidget from './widgets/FleetNewsWidget';
import VignetteWidget from './widgets/VignetteWidget';
import EVStationWidget from './widgets/EVStationWidget';
import BusinessPartnerActionsWidget from './widgets/BusinessPartnerActionsWidget';
import TrustedSourcesWidget from './widgets/TrustedSourcesWidget';
import CommodityPricesWidget from './widgets/CommodityPricesWidget';
import FileDownloadWidget from './widgets/FileDownloadWidget';

// Definiere die zentrale Zuordnung. Die Schlüssel hier sind die `type_key`s.
export const WIDGET_COMPONENTS: { [key: string]: React.ElementType<any> } = {
    BusinessPartnerInfo: BusinessPartnerInfoWidget,
    TrafficInfo: TrafficInfoWidget,
    FuelPrices: FuelPricesWidget,
    TaxChanges: TaxChangesWidget,
    FleetNews: FleetNewsWidget,
    VignettePreise: VignetteWidget,
    GenericAI: GenericAIWidget,
    EVStation: EVStationWidget,
    GenericScrape: GenericScrapeWidget,
    BusinessPartnerAktionen: BusinessPartnerActionsWidget,
    TrustedSources: TrustedSourcesWidget,
    CommodityPrices: CommodityPricesWidget,
    FileDownload: FileDownloadWidget,
};