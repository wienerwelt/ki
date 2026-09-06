import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RadarIcon from '@mui/icons-material/Radar';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import ScheduleIcon from '@mui/icons-material/Schedule';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';

const quickSteps = [
  ['1', 'Accounts anlegen', 'Kunden, Interessenten und - in Premium - Wettbewerber strukturiert erfassen.'],
  ['2', 'Signale prüfen', 'Im Tab „Aktuell“ Relevanz, Quelle und Begründung kontrollieren.'],
  ['3', 'Verantwortung klären', 'Account oder Aufgabe einer Person aus dem eigenen Sales-Team zuweisen.'],
  ['4', 'Nächsten Schritt planen', 'Kontakt, Wiedervorlage oder Notiz direkt am Signal hinterlegen.'],
  ['5', 'Ergebnis dokumentieren', 'Pipeline-Phase pflegen und Vorgänge erledigen oder als nicht relevant markieren.'],
];

const views = [
  { icon: <RadarIcon />, title: 'Aktuell', text: 'Offene Signale im gewählten Zeitraum. Geplante Kontakte erscheinen separat.' },
  { icon: <BusinessCenterIcon />, title: 'Accounts', text: 'Gesamter Account-Bestand, Verantwortliche, Kontakte, Wettbewerber und Datenqualität.' },
  { icon: <CampaignOutlinedIcon />, title: 'Kampagnen', text: 'Accounts und Signale nach Vertriebsthema bündeln und anschließend das Sales-Cockpit gezielt darauf filtern.' },
  { icon: <ScheduleIcon />, title: 'Geplant', text: 'Alle Kontakte und Wiedervorlagen mit Termin, Zuständigkeit und Kalenderexport.' },
  { icon: <CalendarMonthOutlinedIcon />, title: 'Kontaktkalender', text: 'Geplante, überfällige und erledigte Kontakte als Monatsübersicht prüfen. Manager können einen geschützten Kalenderfeed erzeugen.' },
  { icon: <FactCheckOutlinedIcon />, title: 'Daten & API', text: 'Mandantenweite Qualitätsprüfung, CSV-Export und - in Premium - sichere API-Anbindung.' },
];

const faqs = [
  ['Warum unterscheiden sich „Aktuell“ und „gesamter offener Bestand“?', '„Aktuell“ berücksichtigt den gewählten Zeitraum und keine zukünftigen Planungen. Der gesamte offene Bestand zählt alle noch offenen Signale über sämtliche Zeiträume.'],
  ['Was bedeutet der Relevanzwert?', 'Er priorisiert ein Signal anhand der inhaltlichen Nähe zum Account und zu den konfigurierten Themen. Er ersetzt nicht die fachliche Prüfung durch das Sales-Team.'],
  ['Wie erkenne ich den gerade ausgewählten Account?', 'Der Account erhält einen farbigen Rahmen und den Hinweis „Ausgewählt“. Oberhalb der Account-Liste kann die Auswahl wieder aufgehoben werden.'],
  ['Wie wird die Account-Datenqualität berechnet?', 'Je Account werden acht Kernangaben geprüft: Website, Logo, Adresse, zentraler Kontakt, Verantwortung, Ansprechpartner, Region und Branche.'],
  ['Wie nutze ich Kampagnen?', 'Eine Kampagne bündelt passende Accounts und einzelne Signale unter einem Vertriebsthema. Über den Kampagnenfilter werden Cockpit, Kalender, Accounts und Signale gemeinsam eingegrenzt.'],
  ['Wie binde ich den Kontaktkalender extern ein?', 'Sales-Manager erzeugen über das Einstellungsmenü einen geheimen, kopierbaren Kalenderfeed für Outlook, Apple Kalender oder andere Kalenderprogramme. Der Feed enthält keine internen Notizen und kann jederzeit erneuert oder deaktiviert werden.'],
  ['Was muss ich beim Kalenderlink beachten?', 'Wer den Link kennt, kann die freigegebenen Termindaten lesen. Deshalb nicht öffentlich teilen; bei Verdacht den Link sofort erneuern oder den Feed deaktivieren.'],
  ['Wer darf Accounts bearbeiten?', 'Admin, Assistenz und Sales-Manager können Accounts und Kontakte verwalten. Sales-Nutzer erhalten eine lesende Detailansicht. Alle Zugriffe bleiben mandantengebunden.'],
  ['Was ist in Sales Basic enthalten?', 'Bis zu 250 Accounts, Team-Zuweisung, Workflows, wöchentlicher Radar, bis zu drei Empfänger, CSV-Export und Datenqualitätsprüfung.'],
  ['Was ergänzt Sales Premium?', 'Import, bis zu 5.000 Accounts, Wettbewerber-Monitoring, häufigere Radar-Mails, Analytics, KI-Sales-Kontext, Management-PDF und eine mandantengebundene API.'],
  ['Wie werden API-Tokens sicher verwendet?', 'Nur notwendige Berechtigungen vergeben, Token unmittelbar sicher speichern, nicht per unverschlüsselter E-Mail teilen und nicht mehr benötigte Tokens widerrufen.'],
];

const AccountRadarHelpPage: React.FC = () => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 }, pb: { xs: 10, md: 5 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.2, md: 4 },
          borderRadius: 4,
          border: '1px solid',
          borderColor: alpha(primary, 0.2),
          background: `linear-gradient(135deg, ${alpha(primary, 0.14)}, ${theme.palette.background.paper} 58%)`,
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <HelpOutlineIcon color="primary" />
              <Typography component="h1" variant="h4" sx={{ fontWeight: 950 }}>Account-Radar Anleitung &amp; FAQ</Typography>
            </Stack>
            <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 720 }}>
              Der schnelle Weg vom relevanten Signal zum dokumentierten nächsten Schritt - für Desktop und Smartphone.
            </Typography>
          </Box>
          <Button component="a" href="/docs/account-radar-anleitung-faq.pdf" download variant="contained" startIcon={<DownloadIcon />} sx={{ minHeight: 44, whiteSpace: 'nowrap', fontWeight: 900 }}>
            PDF herunterladen
          </Button>
        </Stack>
      </Paper>

      <Typography variant="h5" sx={{ mt: 4, fontWeight: 950 }}>Schnellstart in fünf Schritten</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 1.4, mt: 1.5 }}>
        {quickSteps.map(([number, title, text]) => (
          <Paper key={number} variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
            <Box sx={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 950 }}>{number}</Box>
            <Typography sx={{ mt: 1.4, fontWeight: 900 }}>{title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6, lineHeight: 1.55 }}>{text}</Typography>
          </Paper>
        ))}
      </Box>

      <Typography variant="h5" sx={{ mt: 4, fontWeight: 950 }}>Die wichtigsten Bereiche</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mt: 1.5 }}>
        {views.map((item) => (
          <Paper key={item.title} variant="outlined" sx={{ p: 2.2, borderRadius: 3 }}>
            <Stack direction="row" spacing={1.2} alignItems="flex-start">
              <Box sx={{ width: 42, height: 42, borderRadius: 2.2, display: 'grid', placeItems: 'center', bgcolor: alpha(primary, 0.11), color: 'primary.main', flexShrink: 0 }}>{item.icon}</Box>
              <Box><Typography fontWeight={900}>{item.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, lineHeight: 1.55 }}>{item.text}</Typography></Box>
            </Stack>
          </Paper>
        ))}
      </Box>

      <Alert severity="info" sx={{ mt: 3 }}>
        Tipp: Ein gepflegter Account mit Verantwortlichem und Ansprechpartner verbessert Zuweisung, Kontaktplanung, Reportqualität und spätere CRM-Synchronisierung zugleich.
      </Alert>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 4, mb: 1.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 950 }}>Häufige Fragen</Typography>
        <Chip size="small" label={faqs.length} color="primary" />
      </Stack>
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {faqs.map(([question, answer], index) => (
          <React.Fragment key={question}>
            {index > 0 && <Divider />}
            <Accordion elevation={0} disableGutters sx={{ '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography sx={{ fontWeight: 850 }}>{question}</Typography></AccordionSummary>
              <AccordionDetails><Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{answer}</Typography></AccordionDetails>
            </Accordion>
          </React.Fragment>
        ))}
      </Paper>
    </Container>
  );
};

export default AccountRadarHelpPage;
