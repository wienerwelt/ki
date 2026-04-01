// frontend/src/components/TermsContent.tsx
import React from 'react';
import { Typography, Box, Stack, Link } from '@mui/material';

// --- ZENTRALE KONFIGURATION ---
// Vor Go-Live bitte vollständig befüllen und rechtlich prüfen.
const config = {
    serviceName: "mobiliti KI-Dashboard",
    companyName: "mobiliti", // TODO: echte Vertragspartei / Rechtsform ergänzen
    companyAddress: "Davidgasse 39, 1100 Wien",
    companyEmail: "hello@mobiliti.at",
    companyUrl: "https://dashboard.mobiliti.at",
    imprintUrl: "https://mobiliti.at/impressum.html",
    privacyUrl: "/privacy",
    disclaimerUrl: "/disclaimer",
    representative: "Steffen Peschel",
    jurisdiction: "Wien",
    governingLaw: "Republik Österreich"
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Box>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <Box sx={{ '& ul': { pl: 3, my: 1 }, '& li': { mb: 0.75 } }}>
            {children}
        </Box>
    </Box>
);

export const TermsContent: React.FC = () => {
    return (
        <Box>
            <Typography variant="h4" component="h1" gutterBottom>
                Nutzungsbedingungen für das {config.serviceName}
            </Typography>

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 3 }}>
                Stand: 18. März 2026
            </Typography>

            <Stack spacing={3}>
                <Section title="1. Anbieter und Geltungsbereich">
                    <Typography variant="body1">
                        Diese Nutzungsbedingungen regeln die Nutzung des Dienstes "{config.serviceName}"
                        (nachfolgend „Dienst“) der {config.companyName}, {config.companyAddress},
                        E-Mail: {config.companyEmail}, vertreten durch {config.representative}
                        (nachfolgend „wir“ oder „uns“).
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Mit der Registrierung und Nutzung des Dienstes schließen Sie einen Nutzungsvertrag
                        mit uns auf Grundlage dieser Bedingungen. Ergänzend gelten unsere{" "}
                        <Link href={config.privacyUrl} underline="hover">Datenschutzerklärung</Link>, unser{" "}
                        <Link href={config.disclaimerUrl} underline="hover">Disclaimer</Link> sowie unser{" "}
                        <Link href={config.imprintUrl} target="_blank" rel="noopener noreferrer" underline="hover">
                            Impressum
                        </Link>.
                    </Typography>
                </Section>

                <Section title="2. Vertragsgegenstand">
                    <Typography variant="body1">
                        Wir stellen eine mandantenfähige Software-as-a-Service-Plattform zur Verfügung,
                        mit der Daten, Inhalte und Dokumente verarbeitet, ausgewertet, visualisiert sowie
                        mit Hilfe externer KI-Dienste generiert oder bearbeitet werden können.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Der konkrete Leistungsumfang ergibt sich aus der jeweils aktuellen Produktbeschreibung,
                        den gebuchten Funktionen und gegebenenfalls individuellen Vereinbarungen mit dem jeweiligen Mandanten.
                        Wir dürfen Funktionen anpassen, erweitern oder einschränken, soweit die wesentliche
                        Vertragsfunktion nicht unzumutbar beeinträchtigt wird.
                    </Typography>
                </Section>

                <Section title="3. Registrierung, Mandantenkonten und Rollen">
                    <Typography variant="body1">
                        Die Nutzung erfordert ein Nutzerkonto. Sie sind verpflichtet, bei der Registrierung
                        richtige, vollständige und aktuelle Angaben zu machen und Ihre Zugangsdaten sicher
                        aufzubewahren.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Konten können einer Organisation bzw. einem Mandanten zugeordnet sein. Administratoren
                        eines Mandanten können Nutzer einladen, Rollen vergeben, Zugänge sperren und im Rahmen
                        ihrer Berechtigungen auf mandantenbezogene Inhalte und Metadaten zugreifen.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Registrieren oder nutzen Sie den Dienst für eine Organisation, sichern Sie zu, hierzu
                        befugt zu sein.
                    </Typography>
                </Section>

                <Section title="4. Zulässige Nutzung und Pflichten der Nutzer">
                    <Typography variant="body1" component="div">
                        Sie dürfen den Dienst nur rechtmäßig und im Rahmen der vereinbarten Zwecke nutzen.
                        Untersagt ist insbesondere:
                        <ul>
                            <li>das Hochladen oder Verarbeiten rechtswidriger, beleidigender, diskriminierender oder irreführender Inhalte,</li>
                            <li>die Verletzung von Urheber-, Marken-, Datenschutz-, Geheimhaltungs- oder sonstigen Rechten Dritter,</li>
                            <li>das Umgehen von Sicherheitsmaßnahmen oder unbefugte Zugriffe auf Konten, Daten oder Systeme,</li>
                            <li>die Nutzung des Dienstes für Spam, Schadcode, Social Engineering oder sonstige missbräuchliche Zwecke,</li>
                            <li>die Eingabe besonderer Kategorien personenbezogener Daten oder sonstiger hochsensibler Informationen, sofern dies nicht ausdrücklich schriftlich vereinbart wurde.</li>
                        </ul>
                    </Typography>
                </Section>

                <Section title="5. KI-Funktionen, externe Modellanbieter und menschliche Prüfung">
                    <Typography variant="body1">
                        Der Dienst kann Inhalte mit Hilfe externer KI-Dienste (z.B. OpenAI, Google Gemini
                        und vergleichbare Anbieter) generieren, umformulieren, strukturieren, zusammenfassen
                        oder anderweitig bearbeiten.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        KI-generierte oder KI-bearbeitete Inhalte können fehlerhaft, unvollständig, verzerrt
                        oder für Ihren konkreten Zweck ungeeignet sein. Sie sind vor einer fachlichen,
                        rechtlichen, operativen oder wirtschaftlichen Verwendung eigenverantwortlich zu prüfen.
                        Der Dienst ersetzt keine individuelle Rechts-, Steuer-, Finanz-, Medizin- oder sonstige Fachberatung.
                    </Typography>
                </Section>

                <Section title="6. Inhalte, Rechte und Freistellung">
                    <Typography variant="body1">
                        Sie behalten die Rechte an den von Ihnen hochgeladenen oder eingegebenen Inhalten,
                        soweit nicht zwingendes Recht oder Rechte Dritter entgegenstehen.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Soweit dies für die Vertragserfüllung erforderlich ist, räumen Sie uns ein einfaches,
                        nicht ausschließliches, räumlich auf die Vertragsdurchführung beschränktes Recht ein,
                        Ihre Inhalte zu speichern, zu verarbeiten, zu übertragen und mit technischen Dienstleistern
                        sowie KI-Anbietern zu bearbeiten.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Sie stellen uns von Ansprüchen Dritter frei, die auf einer rechtswidrigen Nutzung des
                        Dienstes oder rechtswidrigen, von Ihnen stammenden Inhalten beruhen, soweit Sie die
                        Rechtsverletzung zu vertreten haben.
                    </Typography>
                </Section>

                <Section title="7. Datenschutz, Auftragsverarbeitung und Drittanbieter">
                    <Typography variant="body1">
                        Informationen zur Verarbeitung personenbezogener Daten finden Sie in unserer{" "}
                        <Link href={config.privacyUrl} underline="hover">Datenschutzerklärung</Link>.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Soweit wir personenbezogene Daten im Auftrag eines Mandanten verarbeiten, erfolgt dies
                        auf Grundlage einer gesonderten Vereinbarung zur Auftragsverarbeitung. Der jeweilige
                        Mandant bleibt in diesen Fällen für die Rechtmäßigkeit der durch ihn veranlassten
                        Verarbeitung verantwortlich.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Für optionale Verarbeitungen auf Basis einer Einwilligung (insbesondere Google Analytics
                        oder Google Ads / personalisierte Werbung) werden gesonderte, jederzeit widerrufliche
                        Einwilligungen eingeholt. Solche Einwilligungen sind nicht Bestandteil dieser
                        Nutzungsbedingungen.
                    </Typography>
                </Section>

                <Section title="8. Verfügbarkeit, Sperrung und Beendigung">
                    <Typography variant="body1">
                        Wir bemühen uns um eine hohe Verfügbarkeit des Dienstes. Wartungen, Sicherheitsupdates,
                        technische Störungen oder Ausfälle bei Drittanbietern können jedoch zu vorübergehenden
                        Einschränkungen führen.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Wir dürfen Konten vorübergehend sperren oder den Zugriff einschränken, wenn
                        Sicherheitsrisiken, Missbrauchsverdacht, Rechtsverstöße, Zahlungsverzug oder erhebliche
                        Vertragsverletzungen vorliegen.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Nutzer können ihr Konto im Rahmen der verfügbaren Funktionen oder durch Mitteilung an
                        {` ${config.companyEmail}`} kündigen. Gesetzliche Aufbewahrungspflichten bleiben unberührt.
                    </Typography>
                </Section>

                <Section title="9. Haftung">
                    <Typography variant="body1">
                        Wir haften unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie bei Verletzung von
                        Leben, Körper oder Gesundheit.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Bei leichter Fahrlässigkeit haften wir nur bei Verletzung wesentlicher Vertragspflichten
                        (Kardinalpflichten) und beschränkt auf den typischerweise vorhersehbaren Schaden.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Für KI-generierte oder aus externen Quellen stammende Inhalte übernehmen wir – vorbehaltlich
                        zwingender gesetzlicher Haftung – keine Gewähr für Richtigkeit, Vollständigkeit, Eignung
                        für einen bestimmten Zweck oder rechtliche Verwertbarkeit.
                    </Typography>
                </Section>

                <Section title="10. Änderungen der Bedingungen und Schlussbestimmungen">
                    <Typography variant="body1">
                        Wir können diese Nutzungsbedingungen mit Wirkung für die Zukunft anpassen, wenn hierfür
                        ein sachlicher Grund besteht, insbesondere bei Gesetzesänderungen, geänderten
                        Produktfunktionen, Sicherheitsanforderungen oder Änderungen bei Dienstleistern.
                        Über wesentliche Änderungen informieren wir rechtzeitig in geeigneter Form.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Es gilt das Recht der {config.governingLaw} unter Ausschluss des UN-Kaufrechts.
                        Gegenüber Verbrauchern gelten zwingende Verbraucherschutzvorschriften ihres Aufenthaltsstaats fort.
                        Für Unternehmer ist Gerichtsstand {config.jurisdiction}, soweit gesetzlich zulässig.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Sollten einzelne Bestimmungen unwirksam sein oder werden, bleibt die Wirksamkeit der
                        übrigen Bestimmungen unberührt.
                    </Typography>
                </Section>
            </Stack>
        </Box>
    );
};