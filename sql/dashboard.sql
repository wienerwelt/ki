-- Tabelle: users (Benutzerverwaltung)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Gespeicherter Hash des Passworts (z.B. bcrypt)
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'fleet_manager', -- z.B. 'fleet_manager', 'procurement_manager', 'sustainability_manager', 'admin'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index für schnellen Login
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- Tabelle: dashboard_configurations (Speicherung individueller Dashboard-Layouts)
CREATE TABLE dashboard_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- Z.B. "Mein Flotten-Dashboard", "Nachhaltigkeitsübersicht"
    config JSONB NOT NULL, -- JSON-Objekt, das das Layout und die Widgets speichert
    is_default BOOLEAN DEFAULT FALSE, -- Kann ein User eine Standardkonfiguration haben?
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name) -- Jeder User kann nur eine Konfiguration pro Name haben
);

-- Index für schnellen Zugriff auf User-Konfigurationen
CREATE INDEX idx_dashboard_configs_user_id ON dashboard_configurations(user_id);

-- Tabelle: external_data_sources (Verwaltung externer Datenquellen - Metainformationen)
-- Diese Tabelle speichert nur die *Definition* der Datenquelle, nicht die Daten selbst.
-- Die eigentlichen Daten würden über den Node.js-Backend-Service aggregiert.
CREATE TABLE external_data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL, -- Z.B. "OpenWeatherMap", "Rohstoffpreise Bloomberg (API)", "Verkehrsinfos TomTom"
    description TEXT,
    api_endpoint VARCHAR(255), -- Die URL zum Abrufen der Daten
    api_key_name VARCHAR(100), -- Name des API-Schlüssels (z.B. "OPENWEATHER_API_KEY")
    data_format VARCHAR(50) DEFAULT 'JSON', -- Z.B. 'JSON', 'XML', 'CSV'
    refresh_interval_minutes INTEGER DEFAULT 60, -- Wie oft sollen Daten von dieser Quelle aktualisiert werden
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'maintenance'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabelle: user_data_source_subscriptions (Welcher User welche Datenquelle abonniert)
CREATE TABLE user_data_source_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES external_data_sources(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, source_id)
);

-- Index für schnelle Abfragen
CREATE INDEX idx_user_subscriptions_user_id ON user_data_source_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_source_id ON user_data_source_subscriptions(source_id);

-- Optional: Eine Tabelle für Widgets, falls wir vordefinierte Widgets haben wollen
-- und diese konfigurierbar sind. Ansonsten ist das im JSONB der dashboard_configurations.
/*
CREATE TABLE widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    component_type VARCHAR(100) NOT NULL, -- Z.B. 'FuelPriceChart', 'TrafficMap', 'ESGScoreCard'
    default_config JSONB, -- Standardkonfiguration für das Widget
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
*/

-- Beispiel-Daten für externe Datenquellen (diese würden später hinzugefügt)
/*
INSERT INTO external_data_sources (name, description, api_endpoint, api_key_name, refresh_interval_minutes) VALUES
('Global Fuel Prices', 'Aktuelle Benzin- und Dieselpreise weltweit', 'https://api.fuelprices.com/latest', 'FUEL_API_KEY', 30),
('Traffic Info Vienna', 'Echtzeit-Verkehrsdaten für Wien', 'https://api.tomtom.com/traffic/v1', 'TOMTOM_API_KEY', 5),
('EU Emissions Regulations', 'Aktuelle und kommende EU-Emissionsvorschriften', 'https://api.eu-regulations.org/emissions', NULL, 1440),
('Raw Material Prices Index', 'Preise für Stahl, Aluminium, Kunststoffe etc.', 'https://api.commodityprices.com/index', 'COMMODITY_API_KEY', 60),
('MSCI ESG Ratings', 'ESG-Bewertungen von Unternehmen', 'https://api.msci.com/esg-ratings', 'MSCI_API_KEY', 2880);
*/