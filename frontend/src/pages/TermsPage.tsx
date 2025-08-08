// frontend/src/pages/TermsPage.tsx
import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';

// --- ZENTRALE KONFIGURATION ---
// Bitte tragen Sie hier Ihre Unternehmensdaten ein.
const config = {
    serviceName: "KI-Dashboard",
    companyName: "[Ihr Firmenname]",
    companyAddress: "[Ihre Straße, PLZ, Ort, Land]",
    companyEmail: "[Ihre Kontakt-E-Mail-Adresse]",
    companyUrl: "https://german.stackexchange.com/questions/55010/auf-der-webseite-ihrer-oder-ihrer-firma",
    representative: "[Name des Geschäftsführers/Inhabers]",
    jurisdiction: "dem Sitz von [Ihr Firmenname]", // z.B. "München"
    governingLaw: "Bundesrepublik Deutschland" // oder Österreich / Schweiz
};
// --------------------------------

const TermsPage: React.FC = () => {
    return (
        <Container maxWidth="md" sx={{ py: 5 }}>
            <Paper sx={{ p: { xs: 2, sm: 4 } }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Nutzungsbedingungen für das {config.serviceName}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 3 }}>
                    Stand: 08. August 2025
                </Typography>

                <Stack spacing={2}>
                    <Box>
                        <Typography variant="h6" gutterBottom>1. Geltungsbereich</Typography>
                        <Typography variant="body1">
                            Diese Nutzungsbedingungen regeln die Nutzung des Dienstes "{config.serviceName}" (nachfolgend "Dienst"), bereitgestellt von {config.companyName} (nachfolgend "wir" oder "uns"). Mit der Registrierung und Nutzung unseres Dienstes erklären Sie sich mit diesen Bedingungen einverstanden.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>2. Vertragsgegenstand</Typography>
                        <Typography variant="body1">
                            Wir stellen eine Software-as-a-Service (SaaS) Plattform zur Verfügung, die branchenspezifische Informationen aggregiert, analysiert und visualisiert. Der genaue Funktionsumfang ergibt sich aus der aktuellen Leistungsbeschreibung auf unserer Webseite. Wir behalten uns das Recht vor, Funktionen zu erweitern, zu ändern oder einzuschränken, sofern die Kernfunktionalität des Dienstes erhalten bleibt.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>3. Registrierung und Nutzerkonto</Typography>
                        <Typography variant="body1">
                            Die Nutzung des Dienstes erfordert eine Registrierung. Sie sind verpflichtet, wahrheitsgemäße und vollständige Angaben zu machen und Ihre Zugangsdaten vertraulich zu behandeln. Sie sind für alle Aktivitäten, die über Ihr Konto erfolgen, verantwortlich.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>4. Nutzergenerierte Inhalte</Typography>
                        <Typography variant="body1">
                            Sie haben die Möglichkeit, eigene Inhalte beizutragen (z.B. im Feedback & Ideen-Center). Sie gewähren uns hiermit ein nicht-exklusives, weltweites, unbefristetes und unentgeltliches Recht, diese Inhalte im Rahmen des Dienstes zu nutzen, zu vervielfältigen und zu veröffentlichen. Sie garantieren, dass Ihre Inhalte keine Rechte Dritter verletzen und nicht gegen geltendes Recht verstoßen.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>5. Haftungsbeschränkung</Typography>
                        <Typography variant="body1">
                            Wir haften für Schäden unbeschränkt nur bei Vorsatz und grober Fahrlässigkeit. Bei einfacher Fahrlässigkeit haften wir nur bei Verletzung einer wesentlichen Vertragspflicht. Die Haftung ist in diesem Fall auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Diese Haftungsbeschränkungen gelten nicht bei Verletzung von Leben, Körper oder Gesundheit. Die von uns dargestellten Daten stammen aus externen Quellen und werden ohne Gewähr auf Richtigkeit und Vollständigkeit zur Verfügung gestellt.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>6. Änderungen der Bedingungen</Typography>
                        <Typography variant="body1">
                            Wir behalten uns vor, diese Nutzungsbedingungen zu ändern. Über wesentliche Änderungen werden wir Sie per E-Mail informieren. Ihre fortgesetzte Nutzung des Dienstes nach Inkrafttreten der Änderungen gilt als Zustimmung.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" gutterBottom>7. Schlussbestimmungen</Typography>
                        <Typography variant="body1">
                            Sollten einzelne Bestimmungen dieser Bedingungen unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Es gilt das Recht der {config.governingLaw} unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist {config.jurisdiction}.
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

export default TermsPage;
