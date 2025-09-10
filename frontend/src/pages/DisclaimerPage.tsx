// frontend/src/pages/DisclaimerPage.tsx
import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';

// --- ZENTRALE KONFIGURATION ---
// Bitte tragen Sie hier Ihre Unternehmensdaten ein.
const config = {
    serviceName: "KI-Dashboard",
    companyName: "[Ihr Firmenname]",
    companyAddress: "[Ihre Straße, PLZ, Ort, Land]",
    companyEmail: "[Ihre Kontakt-E-Mail-Adresse]",
    companyUrl: "https://dashboard.mobiliti.at",
    representative: "[Name des Geschäftsführers/Inhabers]",
    jurisdiction: "dem Sitz von [Ihr Firmenname]", // z.B. "München"
    governingLaw: "Bundesrepublik Deutschland" // oder Österreich / Schweiz
};
// --------------------------------

const DisclaimerPage: React.FC = () => {
    return (
        <Container maxWidth="md" sx={{ py: 5 }}>
            <Paper sx={{ p: { xs: 2, sm: 4 } }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Haftungsausschluss (Disclaimer) für das {config.serviceName}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 3 }}>
                    Stand: 08. September 2025
                </Typography>

                <Stack spacing={2}>
                    <Box>
                        <Typography variant="h6" gutterBottom>1. Herkunft der Daten</Typography>
                        <Typography variant="body1">
                            Die im {config.serviceName} bereitgestellten Informationen stammen aus unterschiedlichen
                            Quellen: automatisiert gesammelte Daten (Scraping), durch künstliche Intelligenz generierte
                            Inhalte sowie von Nutzern bereitgestellte Inhalte. Sämtliche externen Quellen werden
                            transparent angegeben. Zusätzlich erfolgt eine Verifizierung durch Nutzer und Mitarbeitende,
                            soweit dies technisch und organisatorisch möglich ist.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>2. Experimenteller Charakter von KI-Inhalten</Typography>
                        <Typography variant="body1">
                            Inhalte, die durch künstliche Intelligenz generiert wurden, haben einen experimentellen
                            Charakter. Sie können unvollständig, fehlerhaft, verzerrt oder veraltet sein. Wir
                            übernehmen keine Garantie für die inhaltliche Richtigkeit, Sinnhaftigkeit oder
                            rechtliche Verwertbarkeit solcher Inhalte.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>3. Keine Gewährleistung</Typography>
                        <Typography variant="body1">
                            Trotz sorgfältiger Prüfung übernehmen wir keine Gewähr für die Richtigkeit,
                            Vollständigkeit, Aktualität oder ständige Verfügbarkeit der dargestellten Inhalte.
                            Die Nutzung der im {config.serviceName} bereitgestellten Informationen erfolgt
                            ausschließlich auf eigene Verantwortung der Nutzer.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>4. Keine Beratung</Typography>
                        <Typography variant="body1">
                            Die im {config.serviceName} dargestellten Inhalte stellen keine rechtliche, finanzielle,
                            medizinische oder sonstige Beratung dar. Nutzer sollten Entscheidungen nicht ausschließlich
                            auf Grundlage der bereitgestellten Informationen treffen.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>5. Urheberrecht und Nutzergenerierte Inhalte</Typography>
                        <Typography variant="body1">
                            Für von Nutzern bereitgestellte Inhalte sind ausschließlich die jeweiligen Nutzer
                            verantwortlich. Mit dem Hochladen oder Bereitstellen von Inhalten bestätigen Sie, dass
                            Sie über die erforderlichen Rechte verfügen und keine Rechte Dritter verletzen. Wir
                            behalten uns vor, entsprechende Inhalte zu prüfen oder zu entfernen.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>6. Externe Verweise</Typography>
                        <Typography variant="body1">
                            Soweit das {config.serviceName} Links zu externen Webseiten enthält, übernehmen wir keine
                            Verantwortung für deren Inhalte. Für den Inhalt der verlinkten Seiten sind ausschließlich
                            deren Betreiber verantwortlich.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>7. Haftungsbeschränkung</Typography>
                        <Typography variant="body1">
                            Wir haften für Schäden unbeschränkt nur bei Vorsatz und grober Fahrlässigkeit. Bei einfacher
                            Fahrlässigkeit haften wir nur bei Verletzung einer wesentlichen Vertragspflicht. Die
                            Haftung ist in diesem Fall auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Diese
                            Haftungsbeschränkung gilt nicht bei Verletzung von Leben, Körper oder Gesundheit.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>8. Verfügbarkeit des Dienstes</Typography>
                        <Typography variant="body1">
                            Wir bemühen uns, den Dienst ohne Unterbrechungen zur Verfügung zu stellen. Dennoch kann
                            es zu Ausfallzeiten, Wartungsarbeiten oder technischen Störungen kommen. Ein Anspruch
                            auf jederzeitige Verfügbarkeit besteht nicht.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>9. Verweis auf Datenschutzerklärung</Typography>
                        <Typography variant="body1">
                            Unsere <a href="https://dashboard.mobiliti.at/register" target="_blank" rel="noopener noreferrer">Datenschutzerklärung</a> 
                            informiert Sie über den Umgang mit personenbezogenen Daten im Zusammenhang mit der Nutzung
                            des {config.serviceName}.
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

export default DisclaimerPage;
