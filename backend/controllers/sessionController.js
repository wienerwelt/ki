// backend/controllers/sessionController.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Funktion zum Erneuern des Tokens
exports.renewToken = async (req, res) => {
    try {
        // Die Benutzerdaten wurden bereits von der authMiddleware an das req-Objekt angehängt
        const userPayload = req.user;

        // Erstellen Sie den Payload für das neue Token.
        // Stellen Sie sicher, dass der Payload dieselbe Struktur wie in authController.js hat.
        const payload = {
            user: {
                id: userPayload.id,
                username: userPayload.username,
                role: userPayload.role,
                business_partner_id: userPayload.business_partner_id,
                business_partner_name: userPayload.business_partner_name,
            },
        };

        // Erstellen Sie ein neues Token mit einer neuen Laufzeit
        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        // Senden Sie das neue Token an den Client
        res.json({ token });

    } catch (err) {
        console.error('Fehler bei der Token-Erneuerung:', err.message);
        res.status(500).send('Serverfehler');
    }
};
