// frontend/src/types/dashboard.types.ts

export interface Region {
  id: string;
  name: string;
  code: string;
  is_default: boolean;
}

export interface BusinessPartner {
  id: string;
  name: string;
  address?: string;
  logo_url?: string;
  url_businesspartner?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  level_1_name?: string;
  level_2_name?: string;
  level_3_name?: string;
  dashboard_title?: string;
  primary_color?: string;
  secondary_color?: string;
  regions?: Region[];
}

export interface BaseWidgetProps {
    onDelete: (widgetId: string) => void;
    widgetId: string;
    isRemovable: boolean;
    // Hinzugefügte optionale Props für eine bessere Integration
    icon?: React.ReactNode;
    title?: string;
    widgetTypeKey?: string;
}

export interface BusinessPartnerInfoWidgetProps extends BaseWidgetProps {
  businessPartner: BusinessPartner;
  loading?: boolean;
  error?: string | null;
}

export interface WidgetConfig {
  id: string;
  type: string;
}

export interface DashboardSavedConfig {
  layout: any[];
  widgets: WidgetConfig[];
}

export interface WidgetTypeMeta {
  id: string;
  name: string;
  type_key: string;
  component_key: string;
  description?: string | null; // === HIER IST DIE KORREKTUR ===
  icon_name?: string;
  config?: any;
  is_removable?: boolean;
  default_width?: number;
  default_height?: number;
  default_min_width?: number;
  default_min_height?: number;
}