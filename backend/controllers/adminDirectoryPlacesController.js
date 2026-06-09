// backend/controllers/adminDirectoryPlacesController.js
const axios = require('axios');

exports.autoFillFromGoogle = async (req, res) => {
    
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    console.log("API KEY vorhanden:", !!apiKey); // <-- PRÜFUNG!
    if (!apiKey) return res.status(500).json({ message: 'Google API Key fehlt im Backend.' });

    const { companyName } = req.query;
    if (!companyName) return res.status(400).json({ message: 'Firmenname fehlt.' });

    try {
        const response = await axios.post(
            'https://places.googleapis.com/v1/places:searchText',
            { 
                textQuery: companyName,
                languageCode: 'de' 
            },
            {
                headers: {
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,places.addressComponents',
                    'Content-Type': 'application/json',
                    // HIER NEU: Den erwarteten Referrer mitsenden
                    'Referer': 'https://dashboard.mobiliti.at' 
                }
            }
        );

        if (!response.data.places || response.data.places.length === 0) {
            return res.status(404).json({ message: 'Kein passendes Unternehmen auf Google Maps gefunden.' });
        }

        const p = response.data.places[0];
        let zip = '', city = '', street = '', houseNo = '', country = '';
        
        if (p.addressComponents) {
            p.addressComponents.forEach(comp => {
                const types = comp.types;
                if (types.includes('postal_code')) zip = comp.longText;
                if (types.includes('locality') || types.includes('postal_town')) city = comp.longText;
                if (types.includes('route')) street = comp.longText;
                if (types.includes('street_number')) houseNo = comp.longText;
                if (types.includes('country')) country = comp.shortText;
            });
        }

        res.json({
            name: p.displayName?.text || '',
            website_url: p.websiteUri || '',
            contact_phone: p.nationalPhoneNumber || '',
            location: {
                address: `${street} ${houseNo}`.trim(),
                zip_code: zip,
                city: city,
                country: country,
                latitude: p.location?.latitude || null,
                longitude: p.location?.longitude || null,
                google_place_id: p.id,
                is_headquarter: true
            }
        });
    } catch (err) {
        console.error('Google Places API (New) Fehler:', err.response?.data || err.message);
        res.status(500).json({ message: 'Fehler bei der Kommunikation mit Google.' });
    }
};