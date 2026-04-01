// frontend/src/components/PrivacyContent.tsx
import React from 'react';
import { Typography, Box, Stack, Link } from '@mui/material';

// --- ZENTRALE KONFIGURATION ---
// Vor Go-Live bitte vollständig befüllen und rechtlich prüfen.
const config = {
    serviceName: "mobiliti KI-Dashboard",
    companyName: "mobiliti", // TODO: echte juristische Person / Rechtsform ergänzen
    companyAddress: "Davidgasse 39, 1100 Wien",
    companyEmail: "hello@mobiliti.at",
    representative: "Steffen Peschel",
    dpoContact: "Steffen Peschel",
    hostingLocation: "Deutschland",
    privacyEmail: "hello@mobiliti.at",
    subprocessorsUrl: "/subprocessors", // optional: öffentliche Subprocessor-Liste
    cookieSettingsUrl: "/cookie-settings", // optional: Seite / Dialog zur Einwilligungsverwaltung
    dataProtectionAuthority:
        "Österreichische Datenschutzbehörde, Barichgasse 40-42, 1030 Wien, Österreich, dsb@dsb.gv.at"
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Box>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <Box sx={{ '& ul': { pl: 3, my: 1 }, '& li': { mb: 0.75 } }}>
            {children}
        </Box>
    </Box>
);

export const PrivacyContent: React.FC = () => {
    return (
        <Box>
            <Typography variant="h4" component="h1" gutterBottom>
                Datenschutzerklärung für das {config.serviceName}
            </Typography>

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 3 }}>
                Stand: 18. März 2026
            </Typography>

            <Stack spacing={3}>
                <Section title="1. Verantwortlicher">
                    <Typography variant="body1">
                        Verantwortlicher im Sinne der DSGVO ist:
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        {config.companyName}<br />
                        {config.companyAddress}<br />
                        E-Mail: {config.companyEmail}<br />
                        Vertreten durch: {config.representative}
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Datenschutzkontakt: {config.dpoContact || config.privacyEmail}
                    </Typography>
                </Section>

                <Section title="2. Umfang der Verarbeitung">
                    <Typography variant="body1">
                        Wir verarbeiten personenbezogene Daten nur, soweit dies für die Bereitstellung unseres
                        mandantenfähigen SaaS-Dienstes, die Sicherheit unserer Systeme, die Kommunikation mit
                        Nutzern sowie – bei gesonderter Einwilligung – für optionale Analyse- und Werbefunktionen
                        erforderlich ist.
                    </Typography>
                </Section>

                <Section title="3. Zwecke, Datenkategorien und Rechtsgrundlagen">
                    <Typography variant="body1" component="div">
                        Wir verarbeiten insbesondere folgende Daten:
                        <ul>
                            <li>
                                <strong>Registrierung und Nutzerkonto</strong>: Name, E-Mail-Adresse, Passwort-Hash,
                                Mandanten-/Organisationszuordnung, Rollen und Profileinstellungen.
                                Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.
                            </li>
                            <li>
                                <strong>Betrieb des Dienstes und Authentifizierung</strong>: technische Nutzungsdaten,
                                Protokolldaten, IP-Adresse, Zeitstempel, Browser-/Geräteinformationen, Sicherheits-
                                und Fehlerlogs. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
                                (Sicherheit, Missbrauchsprävention, Stabilität, Nachvollziehbarkeit).
                            </li>
                            <li>
                                <strong>Mandantenbezogene Inhalte</strong>: von Nutzern eingegebene Texte, Prompts,
                                Dateien, Dokumente, Kommentare, Metadaten, generierte oder bearbeitete Inhalte.
                                Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO sowie – soweit wir im Auftrag eines
                                Mandanten handeln – dessen Weisungen und vertragliche Vereinbarungen.
                            </li>
                            <li>
                                <strong>Support und Kommunikation</strong>: Anfragen, E-Mails, Support-Historie,
                                Fehlerbeschreibungen und sonstige Kommunikationsinhalte.
                                Rechtsgrundlage: Art. 6 Abs. 1 lit. b und lit. f DSGVO.
                            </li>
                            <li>
                                <strong>Einwilligungsbasierte Analyse</strong>: Reichweitenmessung, Nutzungsanalyse
                                und Optimierung mittels Google Analytics, sofern Sie hierin ausdrücklich eingewilligt haben.
                                Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO.
                            </li>
                            <li>
                                <strong>Einwilligungsbasierte Werbung</strong>: Auslieferung, Personalisierung,
                                Messung und Conversion-Nachweis von Werbung über Google Ads oder verbundene Dienste,
                                sofern Sie hierin ausdrücklich eingewilligt haben.
                                Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO.
                            </li>
                        </ul>
                    </Typography>
                </Section>

                <Section title="4. Besonderheiten der Mandantenfähigkeit / Rollenverteilung">
                    <Typography variant="body1">
                        Unser Dienst ist mandantenfähig. Wenn Ihr Nutzerkonto einer Organisation, einem Arbeitgeber
                        oder einem sonstigen Mandanten zugeordnet ist, kann dieser Mandant eigenständig über Zwecke
                        und Mittel bestimmter Datenverarbeitungen innerhalb seines Arbeitsbereichs entscheiden.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        In solchen Fällen kann der jeweilige Mandant datenschutzrechtlich Verantwortlicher und wir
                        Auftragsverarbeiter sein. Betroffenenrechte bezüglich mandantenspezifischer Inhalte sind
                        daher gegebenenfalls zunächst gegenüber dem jeweiligen Mandanten geltend zu machen.
                    </Typography>
                </Section>

                <Section title="5. Einsatz externer KI-Dienste">
                    <Typography variant="body1">
                        Zur Bereitstellung von KI-Funktionen können wir externe Modellanbieter und Infrastruktur-
                        dienstleister einsetzen, etwa OpenAI, Google Gemini und vergleichbare Anbieter.
                        Dabei können Prompts, hochgeladene Dateien, Kontextinformationen und daraus erzeugte
                        Inhalte verarbeitet werden, soweit dies zur gewünschten Funktion erforderlich ist.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Bitte geben Sie keine besonderen Kategorien personenbezogener Daten, Berufsgeheimnisse
                        oder sonstige hochsensible Informationen ein, sofern dies nicht ausdrücklich vorgesehen
                        und vertraglich abgesichert ist.
                    </Typography>
                </Section>

                <Section title="6. Cookies und ähnliche Technologien">
                    <Typography variant="body1">
                        Wir verwenden technisch notwendige Cookies bzw. Local-Storage-Einträge, um den Login,
                        Sicherheitsfunktionen, Spracheinstellungen, Mandantenzuordnung und die grundlegende
                        Bereitstellung des Dienstes zu ermöglichen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
                        bzw. – soweit für die Bereitstellung des Dienstes erforderlich – Art. 6 Abs. 1 lit. b DSGVO.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Analyse- und Werbe-Cookies sowie sonstige nicht notwendige Technologien setzen wir nur nach
                        Ihrer vorherigen Einwilligung. Ihre Auswahl können Sie jederzeit mit Wirkung für die Zukunft
                        über unsere{" "}
                        <Link href={config.cookieSettingsUrl} underline="hover">
                            Cookie-Einstellungen
                        </Link>{" "}
                        ändern oder widerrufen.
                    </Typography>
                </Section>

                <Section title="7. Google Analytics und Google Ads">
                    <Typography variant="body1">
                        Sofern Sie einwilligen, nutzen wir Google Analytics zur statistischen Auswertung der Nutzung
                        unseres Dienstes sowie Google Ads bzw. verbundene Google-Werbefunktionen zur Werbeausspielung,
                        Reichweitenmessung, Conversion-Messung und – soweit aktiviert – Personalisierung.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Ohne Ihre Einwilligung laden wir diese optionalen Google-Dienste nicht. Sie können Ihre
                        Einwilligung jederzeit für die Zukunft widerrufen, ohne dass die Rechtmäßigkeit der bis zum
                        Widerruf erfolgten Verarbeitung berührt wird.
                    </Typography>
                </Section>

                <Section title="8. Empfänger und Kategorien von Empfängern">
                    <Typography variant="body1" component="div">
                        Wir geben personenbezogene Daten nur weiter, soweit dies für die genannten Zwecke erforderlich ist.
                        Empfänger können insbesondere sein:
                        <ul>
                            <li>Hosting- und Infrastruktur-Dienstleister (Serverstandort derzeit: {config.hostingLocation}),</li>
                            <li>Authentifizierungs-, E-Mail-, Monitoring- und Support-Dienstleister,</li>
                            <li>externe KI-Anbieter zur Generierung oder Bearbeitung von Inhalten,</li>
                            <li>Google-Dienste für Analytics und Ads, sofern Sie eingewilligt haben,</li>
                            <li>der jeweilige Mandant bzw. dessen Administratoren im Rahmen der Berechtigungsstruktur,</li>
                            <li>Behörden oder Gerichte, soweit hierzu eine gesetzliche Verpflichtung besteht.</li>
                        </ul>
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Eine aktuelle Übersicht unserer wesentlichen Auftragsverarbeiter bzw. Unterauftragsverarbeiter
                        kann – soweit bereitgestellt – hier eingesehen werden:{" "}
                        <Link href={config.subprocessorsUrl} underline="hover">
                            Subprocessor-Liste
                        </Link>.
                    </Typography>
                </Section>

                <Section title="9. Drittlandübermittlungen">
                    <Typography variant="body1">
                        Trotz eines Hosting-Standorts in Deutschland kann es vorkommen, dass personenbezogene Daten
                        an Empfänger in Staaten außerhalb der EU bzw. des EWR übermittelt oder dort verarbeitet werden,
                        insbesondere wenn wir internationale KI- oder Werbedienstleister einsetzen.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        In solchen Fällen achten wir auf geeignete Garantien nach Art. 44 ff. DSGVO, etwa
                        Angemessenheitsbeschlüsse, das EU-U.S. Data Privacy Framework oder Standardvertragsklauseln,
                        soweit diese jeweils anwendbar sind.
                    </Typography>
                </Section>

                <Section title="10. Speicherdauer und Löschung">
                    <Typography variant="body1" component="div">
                        Wir speichern personenbezogene Daten nur so lange, wie dies für die jeweiligen Zwecke erforderlich ist.
                        Maßgebliche Kriterien sind insbesondere:
                        <ul>
                            <li>
                                <strong>Kontodaten</strong>: grundsätzlich für die Dauer des Nutzerverhältnisses
                                und danach bis zum Ablauf gesetzlicher Aufbewahrungs- oder Verjährungsfristen.
                            </li>
                            <li>
                                <strong>Mandanteninhalte, Prompts, Uploads und KI-Ausgaben</strong>: grundsätzlich
                                bis zur Löschung durch Nutzer/Mandant oder bis zur Beendigung des Mandats bzw.
                                Nutzerverhältnisses, vorbehaltlich abweichender Weisungen und gesetzlicher Pflichten.
                            </li>
                            <li>
                                <strong>Sicherheits- und Fehlerlogs</strong>: in der Regel nur für einen begrenzten
                                Zeitraum, soweit sie für Sicherheit, Störungsbehebung und Missbrauchsabwehr benötigt werden.
                            </li>
                            <li>
                                <strong>Einwilligungsnachweise</strong>: bis zum Widerruf sowie darüber hinaus,
                                soweit erforderlich, zum Nachweis ordnungsgemäß eingeholter Einwilligungen.
                            </li>
                            <li>
                                <strong>Support-Kommunikation</strong>: solange sie zur Bearbeitung des Vorgangs,
                                zur Vertragsdurchführung oder zur Abwehr bzw. Durchsetzung von Ansprüchen benötigt wird.
                            </li>
                        </ul>
                    </Typography>
                </Section>

                <Section title="11. Ihre Rechte">
                    <Typography variant="body1">
                        Sie haben nach Maßgabe der gesetzlichen Voraussetzungen das Recht auf Auskunft, Berichtigung,
                        Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch gegen bestimmte
                        Verarbeitungen.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Soweit eine Verarbeitung auf Ihrer Einwilligung beruht, können Sie diese jederzeit mit Wirkung
                        für die Zukunft widerrufen.
                    </Typography>
                </Section>

                <Section title="12. Beschwerderecht bei einer Aufsichtsbehörde">
                    <Typography variant="body1">
                        Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren,
                        insbesondere in dem Mitgliedstaat Ihres gewöhnlichen Aufenthalts, Ihres Arbeitsplatzes
                        oder des Orts des mutmaßlichen Verstoßes. Zuständig an unserem Sitz ist insbesondere:
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        {config.dataProtectionAuthority}
                    </Typography>
                </Section>

                <Section title="13. Datensicherheit">
                    <Typography variant="body1">
                        Wir treffen angemessene technische und organisatorische Maßnahmen, um personenbezogene Daten
                        vor Verlust, Manipulation, unbefugtem Zugriff, Offenlegung oder sonstiger unrechtmäßiger
                        Verarbeitung zu schützen.
                    </Typography>
                </Section>

                <Section title="14. Änderungen dieser Datenschutzerklärung und Kontakt">
                    <Typography variant="body1">
                        Wir können diese Datenschutzerklärung anpassen, wenn sich rechtliche, technische oder
                        organisatorische Rahmenbedingungen ändern. Es gilt die jeweils auf dieser Seite veröffentlichte Fassung.
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                        Datenschutzanfragen richten Sie bitte an: {config.privacyEmail}
                    </Typography>
                </Section>
            </Stack>
        </Box>
    );
};