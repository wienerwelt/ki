// frontend/src/pages/PrivacyPage.tsx
import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';

// --- ZENTRALE KONFIGURATION ---
// Bitte tragen Sie hier Ihre Unternehmensdaten ein.
const config = {
    serviceName: "KI-Dashboard",
    companyName: "[Ihr Firmenname]",
    companyAddress: "[Ihre Straße, PLZ, Ort, Land]",
    companyEmail: "[Ihre Kontakt-E-Mail-Adresse]",
    representative: "[Name des Geschäftsführers/Inhabers]",
    dataProtectionAuthority: "[Name und Anschrift der für Sie zuständigen Datenschutzbehörde]"
};
// --------------------------------

const PrivacyPage: React.FC = () => {
    return (
        <Container maxWidth="md" sx={{ py: 5 }}>
            <Paper sx={{ p: { xs: 2, sm: 4 } }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Datenschutzerklärung für das {config.serviceName}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 3 }}>
                    Stand: 08. August 2025
                </Typography>

                <Stack spacing={2}>
                    <Box>
                        <Typography variant="h6" gutterBottom>1. Verantwortlicher</Typography>
                        <Typography variant="body1">
                            Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) und anderer nationaler Datenschutzgesetze ist:<br />
                            {config.companyName}<br />
                            {config.companyAddress}<br />
                            E-Mail: {config.companyEmail}<br />
                            Vertreten durch: {config.representative}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>2. Allgemeines zur Datenverarbeitung</Typography>
                        <Typography variant="body1">
                            Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies zur Bereitstellung eines funktionsfähigen Dashboards sowie unserer Inhalte und Leistungen erforderlich ist.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>3. Erhebung und Speicherung personenbezogener Daten</Typography>
                        <Typography variant="body1" component="div">
                            <ul>
                                <li><b>Registrierung:</b> Bei der Registrierung erheben wir folgende Daten: Benutzername, E-Mail-Adresse, Name und (optional) Firmenname. Diese Daten sind zur Erfüllung des Nutzungsvertrags erforderlich (Art. 6 Abs. 1 lit. b DSGVO).</li>
                                <li><b>Nutzungsdaten:</b> Bei der Nutzung unseres Dienstes speichern wir technische Daten wie IP-Adresse, Zeitpunkt des Zugriffs und aufgerufene Seiten. Dies geschieht zur Gewährleistung der Sicherheit und Stabilität unserer Systeme (Art. 6 Abs. 1 lit. f DSGVO).</li>
                                <li><b>Nutzergenerierte Inhalte:</b> Inhalte, die Sie im Feedback-Center oder Forum erstellen, werden mit Ihrem Benutzerprofil verknüpft und gespeichert (Art. 6 Abs. 1 lit. b DSGVO).</li>
                            </ul>
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>4. Einsatz von Cookies</Typography>
                        <Typography variant="body1">
                            Wir verwenden technisch notwendige Cookies, um die Nutzung unseres Dienstes zu ermöglichen (z.B. für den Login-Status). Unser berechtigtes Interesse an einer nutzerfreundlichen Webseite dient hierbei als Rechtsgrundlage (Art. 6 Abs. 1 lit. f DSGVO).
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>5. Weitergabe von Daten</Typography>
                        <Typography variant="body1">
                            Eine Weitergabe Ihrer persönlichen Daten an Dritte findet grundsätzlich nicht statt, es sei denn, Sie haben Ihre ausdrückliche Einwilligung erteilt oder wir sind gesetzlich dazu verpflichtet.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>6. Ihre Rechte als Betroffener</Typography>
                        <Typography variant="body1">
                            Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) und Widerspruch (Art. 21 DSGVO). Zudem haben Sie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (z.B. bei: {config.dataProtectionAuthority}).
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>7. Datensicherheit</Typography>
                        <Typography variant="body1">
                            Wir treffen alle angemessenen technischen und organisatorischen Sicherheitsmaßnahmen, um Ihre Daten vor Manipulation, Verlust, Zerstörung oder dem Zugriff unberechtigter Personen zu schützen.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>8. Kontakt</Typography>
                        <Typography variant="body1">
                            Bei Fragen zum Datenschutz können Sie sich jederzeit an uns wenden: {config.companyEmail}.
                        </Typography>
                    </Box>
                </Stack>
            </Paper>
        </Container>
    );
};

// Dummy-Stack für den Fall, dass er nicht importiert wurde
const Stack: React.FC<{ spacing?: number; children: React.ReactNode }> = ({ spacing, children }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: spacing }}>{children}</Box>
);

export default PrivacyPage;
