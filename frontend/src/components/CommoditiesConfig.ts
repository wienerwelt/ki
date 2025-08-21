// Dieser Typ definiert die Struktur für die Konfiguration jedes Rohstoffs
export interface CommodityConfig {
    name: string;
    formatOptions: Intl.NumberFormatOptions;
    color: string;
    unit: string; // Fügen wir die Einheit für die absolute Anzeige hinzu
}

// Hier ist die zentrale Konfiguration. 
// Wenn ein neuer Rohstoff hinzukommt, wird er einfach hier eingetragen.
export const commoditiesConfig: Record<string, CommodityConfig> = {
    'BRENT_OIL': { 
        name: 'Brent Rohöl', 
        formatOptions: { style: 'currency', currency: 'USD', minimumFractionDigits: 2 },
        color: '#8884d8',
        unit: 'USD/Barrel'
    },
    'EUR_USD': { 
        name: 'Wechselkurs EUR/USD', 
        formatOptions: { style: 'currency', currency: 'USD', minimumFractionDigits: 4 },
        color: '#82ca9d',
        unit: 'USD'
    },
    'EURIBOR_3M': { 
        name: 'Euribor 3M', 
        formatOptions: { style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 3 },
        color: '#ffc658',
        unit: '%'
    },
    'CO2_PRICE': { 
        name: 'CO2-Emissionspreis', 
        formatOptions: { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 },
        color: '#ff7300',
        unit: 'EUR/Tonne'
    },
    // Beispiel für einen zukünftigen Rohstoff:
    // 'NICKEL': { 
    //     name: 'Nickel', 
    //     formatOptions: { style: 'currency', currency: 'USD', minimumFractionDigits: 0 },
    //     color: '#0088FE',
    //     unit: 'USD/Tonne'
    // },
};