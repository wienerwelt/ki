// frontend/src/types/dashboard.types.ts

import type { Layouts } from 'react-grid-layout';

export interface Region {
  id: string;
  name: string;
  slug?: string | null;
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
    icon?: React.ReactNode;
    title?: React.ReactNode;
    widgetTypeKey?: string;
    widgetTitle?: string;
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
  name: string; 
  layouts: Layouts;
  widgets: WidgetConfig[];
}

export interface WidgetTypeMeta {
  id: string;
  name: string;
  type_key: string;
  component_key: string;
  description?: string | null;
  icon_name?: string;
  config?: any;
  is_removable?: boolean;
  is_multi_instance?: boolean;
  default_width?: number;
  default_height?: number;
  default_min_width?: number;
  default_min_height?: number;
}

// --- NEUE TYPEN HINZUGEFÜGT ---

/**
 * Definiert ein einzelnes Feld in einer Monitor-Vorlage.
 */
export interface MonitorField {
    name: string; // z.B. "title", "summary"
    label: string; // z.B. "Titel", "Zusammenfassung"
    type: 'text' | 'textarea' | 'date';
}

/**
 * Definiert die Struktur einer Monitor-Vorlage.
 */
export interface MonitorTemplate {
    id: string;
    business_partner_id: string;
    template_name: string;
    industry?: string;
    fields_definition: MonitorField[];
}

/**
 * Definiert einen einzelnen Monitor-Eintrag (z.B. ein Gesetz).
 */
export interface MonitorEntry {
    id: string;
    template_id: string;
    business_partner_id: string;
    is_published: boolean;
    content_data: Record<string, any>; // Das JSON-Objekt mit den Daten
    source_document_url: string | null; // Link zum Original-PDF
    created_at: string;
}
