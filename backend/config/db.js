/*
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

module.exports = pool;
*/

// backend/config/db.js
const { Pool } = require('pg'); // <-- Hier fehlte das Semikolon und ist jetzt korrekt

const pool = new Pool({

    user: 'postgres',       // HIER DEINEN USER EINTRAGEN
    host: 'localhost',
    database: 'dashboard', // HIER DEINEN DB-NAMEN EINTRAGEN
    password: 'dnp74npd', // HIER DEIN PASSWORT EINTRAGEN
    port: 5432,

}); // <-- Hier fehlte die schließende geschweifte Klammer

module.exports = pool;