import { Layout } from 'react-grid-layout';

// Konfiguration und Metadaten
export interface WidgetConfig {
    id: string;
    type: string;
}

export interface WidgetTypeMeta {
    id: string;
    name: string;
    type_key: string;
    component_key?: string;
    description: string | null;
    icon_name: string | null;
    default_width: number;
    default_height: number;
    default_min_width?: number;
    default_min_height?: number;
    is_removable: boolean;
    config?: any;
}

export interface DashboardSavedConfig {
    layout: Layout[];
    widgets: WidgetConfig[];
}

// KORREKTUR: Zentrale Definition für eine Region mit Koordinaten
export interface Region {
    id: string;
    name: string;
    code: string;
    latitude?: number | null;
    longitude?: number | null;
}

// Basis-Props für alle Widgets
export interface BaseWidgetProps {
    loading?: boolean;
    error?: string | null;
    onDelete?: (id: string) => void;
    widgetId?: string;
    isRemovable?: boolean;
}

// Spezifische Widget-Props
export interface FuelPricesWidgetProps extends BaseWidgetProps {}
export interface TrafficInfoWidgetProps extends BaseWidgetProps { data?: any; }
export interface BusinessPartnerInfoWidgetProps extends BaseWidgetProps { businessPartner?: any; }
export interface TaxChangesWidgetProps extends BaseWidgetProps { data?: any; }
export interface FleetNewsWidgetProps extends BaseWidgetProps { data?: any; }
export interface EVStationWidgetProps extends BaseWidgetProps {}
export interface VignetteWidgetProps extends BaseWidgetProps {}
