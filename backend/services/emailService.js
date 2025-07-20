const nodemailer = require('nodemailer');

// Konfiguriert den E-Mail-Transporter mit den Daten aus der .env-Datei
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: (process.env.EMAIL_PORT === '465'), // true für Port 465, sonst false
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Sendet eine E-Mail.
 * @param {string} to - Die E-Mail-Adresse des Empfängers.
 * @param {string} subject - Der Betreff der E-Mail.
 * @param {string} html - Der HTML-Inhalt der E-Mail.
 * @param {string} [fromName='KI-Dashboard'] - Der angezeigte Name des Absenders.
 * @returns {Promise<void>}
 */
const sendEmail = async ({ to, subject, html, fromName = 'KI-Dashboard' }) => {
    try {
        const mailOptions = {
            // KORRIGIERT: Verwendet den dynamischen Namen oder einen Standardwert.
            from: `"${fromName}" <${process.env.EMAIL_USER}>`, // Absender-Adresse
            to: to,
            subject: subject,
            html: html, // Wir senden HTML, um Links und Formatierungen zu ermöglichen
        };

        await transporter.sendMail(mailOptions);
        console.log(`E-Mail erfolgreich an ${to} gesendet.`);
    } catch (error) {
        console.error(`Fehler beim Senden der E-Mail an ${to}:`, error);
        // Wirft den Fehler weiter, damit der Controller ihn fangen kann
        throw new Error('E-Mail konnte nicht versendet werden.');
    }
};

module.exports = { sendEmail };
