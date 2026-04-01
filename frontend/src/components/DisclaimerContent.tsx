// frontend/src/components/DisclaimerContent.tsx
import React from 'react';
import { Typography, Box, Stack, Link } from '@mui/material';

// --- ZENTRALE KONFIGURATION ---
// Vor Go-Live bitte vollständig befüllen und rechtlich prüfen.
const config = {
    serviceName: "mobiliti KI-Dashboard",
    companyName: "mobiliti",
    companyEmail: "hello@mobiliti.at",
    companyUrl: "https://dashboard.mobiliti.at",
    privacyUrl: "/privacy",
    termsUrl: "/terms"
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Box>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <Box sx={{ '& ul': { pl: 3, my: 1 }, '& li': { mb: 0.75 } }}>
            {children}
        </Box>
    </Box>
);

export const DisclaimerContent: React.FC = () => {
    return (
        <Box>
            <Typography variant="h4" component="h1" gutterBottom>
                Haftungsausschluss (Disclaimer) für das {config.serviceName}
            </Typography>

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 3 }}>
                Stand: 18. März 2026
            </Typography>

            <Stack spacing={3}>
                <Section title="1. Zweck dieses Hinweises">
                    <Typography variant="body1">
                        Dieser Disclaimer erläutert die Grenzen der Verlässlichkeit und Verwendbarkeit der
                        im {config.serviceName} bereitgestellten Informationen, Analysen, Visualisierungen,
                        KI-generierten Texte und sonstigen Inhalte.
                    </Typography>
                </Section>

                <Section title="2. Herkunft und Bearbeitung von Inhalten">
                    <Typography variant="body1">
                        Inhalte im {config.serviceName} können aus unterschiedlichen Quellen stammen,
                        insbesondere aus Nutzerangaben, hochgeladenen Dokumenten, automatisiert verarbeiteten
                        Datenquellen, öffentlich zugänglichen Informationen sowie durch künstliche Intelligenz
                        generierten oder bearbeiteten Ausgaben.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Auch wenn wir angemessene technische und organisatorische Maßnahmen einsetzen, kann
                        nicht ausgeschlossen werden, dass Inhalte fehlerhaft, unvollständig, uneinheitlich,
                        missverständlich, veraltet oder kontextlich ungeeignet sind.
                    </Typography>
                </Section>

                <Section title="3. KI-generierte und KI-bearbeitete Inhalte">
                    <Typography variant="body1">
                        Das {config.serviceName} kann externe KI-Modelle nutzen, um Inhalte zu erstellen,
                        zu überarbeiten, zusammenzufassen, zu klassifizieren oder anderweitig zu transformieren.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        KI-Ausgaben haben experimentellen Charakter. Sie können sogenannte Halluzinationen,
                        sachliche Fehler, Bias, Auslassungen oder unangemessene Formulierungen enthalten.
                        KI-Ausgaben dürfen daher nicht ungeprüft als alleinige Entscheidungsgrundlage
                        verwendet werden.
                    </Typography>
                </Section>

                <Section title="4. Keine Beratung und keine Entscheidungsautomatisierung">
                    <Typography variant="body1">
                        Die im {config.serviceName} dargestellten Inhalte stellen keine Rechts-, Steuer-,
                        Finanz-, Anlage-, Medizin-, Compliance-, Personal- oder sonstige Fachberatung dar.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Entscheidungen mit rechtlichen, wirtschaftlichen, gesundheitlichen oder sonst
                        erheblichen Auswirkungen sollten nur nach eigener Prüfung und – soweit erforderlich –
                        unter Einbindung qualifizierter Fachpersonen getroffen werden.
                    </Typography>
                </Section>

                <Section title="5. Nutzerverantwortung">
                    <Typography variant="body1" component="div">
                        Nutzer sind selbst dafür verantwortlich,
                        <ul>
                            <li>eingegebene, hochgeladene oder freigegebene Inhalte rechtmäßig zu verwenden,</li>
                            <li>Ergebnisse vor Weitergabe, Veröffentlichung oder operativer Nutzung zu prüfen,</li>
                            <li>bei sensiblen, vertraulichen oder personenbezogenen Daten besondere Vorsicht walten zu lassen,</li>
                            <li>keine Rechte Dritter oder vertragliche Geheimhaltungspflichten zu verletzen.</li>
                        </ul>
                    </Typography>
                </Section>

                <Section title="6. Externe Verweise, Drittinhalte und Werbung">
                    <Typography variant="body1">
                        Soweit der Dienst Links, eingebettete Inhalte, externe Datenquellen oder Werbeinhalte
                        (z.B. über Google Ads oder andere Drittanbieter) enthält, machen wir uns deren Inhalte
                        nicht zu eigen.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Für Inhalt, Aktualität, Richtigkeit, Rechtmäßigkeit und Sicherheit externer Angebote
                        sind ausschließlich deren jeweilige Betreiber verantwortlich.
                    </Typography>
                </Section>

                <Section title="7. Verfügbarkeit des Dienstes">
                    <Typography variant="body1">
                        Wir bemühen uns, den Dienst mit hoher Verfügbarkeit bereitzustellen. Es besteht jedoch
                        kein Anspruch auf ununterbrochene oder fehlerfreie Verfügbarkeit. Wartungsarbeiten,
                        Sicherheitsmaßnahmen, technische Störungen oder Ausfälle bei Drittanbietern können
                        zu Unterbrechungen oder Leistungsbeeinträchtigungen führen.
                    </Typography>
                </Section>

                <Section title="8. Haftungsbeschränkung">
                    <Typography variant="body1">
                        Wir haften unbeschränkt nur bei Vorsatz, grober Fahrlässigkeit sowie bei Verletzung
                        von Leben, Körper oder Gesundheit.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Bei leichter Fahrlässigkeit haften wir nur bei Verletzung wesentlicher Vertragspflichten
                        und beschränkt auf den vertragstypischen, vorhersehbaren Schaden.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Soweit gesetzlich zulässig, übernehmen wir keine Haftung dafür, dass Inhalte oder
                        KI-Ausgaben für einen bestimmten Zweck geeignet, wirtschaftlich sinnvoll oder rechtlich
                        verwertbar sind.
                    </Typography>
                </Section>

                <Section title="9. Weitere rechtliche Hinweise">
                    <Typography variant="body1">
                        Ergänzende Informationen finden Sie in unseren{" "}
                        <Link href={config.termsUrl} underline="hover">Nutzungsbedingungen</Link> und in unserer{" "}
                        <Link href={config.privacyUrl} underline="hover">Datenschutzerklärung</Link>.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Bei Fragen erreichen Sie uns unter {config.companyEmail}.
                    </Typography>
                </Section>
            </Stack>
        </Box>
    );
};