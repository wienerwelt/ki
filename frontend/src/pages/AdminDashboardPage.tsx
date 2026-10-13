import React from 'react';
import { Link } from 'react-router-dom';
import { alpha, useTheme } from '@mui/material/styles';
import { Box, Button, Container, Grid, Paper, Stack, Typography } from '@mui/material';

import BusinessIcon from '@mui/icons-material/Business';
import WidgetsIcon from '@mui/icons-material/Widgets';
import SubscriptionsIcon from '@mui/icons-material/Subscriptions';
import GroupIcon from '@mui/icons-material/Group';
import DataObjectIcon from '@mui/icons-material/DataObject';
import PolicyIcon from '@mui/icons-material/Policy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArticleIcon from '@mui/icons-material/Article';
import CategoryIcon from '@mui/icons-material/Category';
import TagIcon from '@mui/icons-material/Tag';
import MonitorIcon from '@mui/icons-material/Monitor';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import CampaignIcon from '@mui/icons-material/Campaign';
import StarsIcon from '@mui/icons-material/Stars';
import ScheduleIcon from '@mui/icons-material/Schedule';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PollIcon from '@mui/icons-material/Poll';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import GavelIcon from '@mui/icons-material/Gavel';
import ForumIcon from '@mui/icons-material/Forum';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import ShareIcon from '@mui/icons-material/Share';
import StorefrontIcon from '@mui/icons-material/Storefront';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EmailIcon from '@mui/icons-material/Email';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import SmartToyIcon from '@mui/icons-material/SmartToy';

type AdminCard = {
  title: string;
  description: string;
  to: string;
  action: string;
  icon: React.ElementType;
};

type AdminSection = {
  title: string;
  description: string;
  accent: string;
  cards: AdminCard[];
};

const AdminDashboardPage: React.FC = () => {
  const theme = useTheme();
  const sections: AdminSection[] = [
    {
      title: 'Mandanten & Zugänge',
      description: 'Organisationen, Benutzer, Demos und sichtbare Module zentral verwalten.',
      accent: theme.palette.info.main,
      cards: [
        { title: 'Business Partner', description: 'Mandanten, Branding und Module verwalten.', to: '/admin/business-partners', action: 'Mandanten öffnen', icon: BusinessIcon },
        { title: 'Benutzerverwaltung', description: 'Konten, Rollen und E-Mail-Empfang steuern.', to: '/admin/users', action: 'Benutzer öffnen', icon: GroupIcon },
        { title: 'Demo-Zugänge', description: 'Befristete Zugänge für Interessenten verwalten.', to: '/admin/demo-access', action: 'Demos öffnen', icon: VisibilityIcon },
        { title: 'Widget-Zugriff', description: 'Widgets je Mandant freischalten.', to: '/admin/bp-widget-access', action: 'Zugriffe öffnen', icon: SubscriptionsIcon },
        { title: 'Homepage-Assistent', description: 'Mandant, Verhalten und Chatbot-Avatar konfigurieren.', to: '/admin/public-assistant', action: 'Assistent öffnen', icon: SmartToyIcon },
      ],
    },
    {
      title: 'Redaktion & Public Page',
      description: 'Alle Inhalte pflegen, die Mitglieder und öffentliche Besucher sehen.',
      accent: theme.palette.primary.main,
      cards: [
        { title: 'Plattform-Updates', description: 'Neuerungen für ausgewählte Mandanten veröffentlichen.', to: '/admin/platform-updates', action: 'Updates öffnen', icon: NewReleasesOutlinedIcon },
        { title: 'Briefing Redaktion', description: 'Tägliche Briefings prüfen und freigeben.', to: '/admin/briefing-editorial', action: 'Redaktion öffnen', icon: HistoryEduIcon },
        { title: 'Social Media', description: 'Posts und Grafiken aus Statistiken erstellen.', to: '/admin/social-media', action: 'Generator öffnen', icon: ShareIcon },
        { title: 'Community', description: 'Beiträge und Kommentare moderieren.', to: '/admin/community', action: 'Moderation öffnen', icon: ForumIcon },
        { title: 'Branchennetzwerk', description: 'Dienstleister, Kategorien und Freigaben steuern.', to: '/admin/directory', action: 'Netzwerk öffnen', icon: StorefrontIcon },
        { title: 'Actions & Software', description: 'Angebote und Software-Lexikon pflegen.', to: '/admin/actions', action: 'Inhalte öffnen', icon: StarsIcon },
        { title: 'Umfragen', description: 'Umfragen erstellen und auswerten.', to: '/admin/surveys', action: 'Umfragen öffnen', icon: PollIcon },
        { title: 'Werbung', description: 'Werbebanner im Dashboard verwalten.', to: '/admin/advertisements', action: 'Werbung öffnen', icon: CampaignIcon },
      ],
    },
    {
      title: 'Daten, Quellen & KI',
      description: 'Datenzufluss, KI-Regeln, Qualität und fachliche Struktur kontrollieren.',
      accent: theme.palette.success.main,
      cards: [
        { title: 'Gescrapte Inhalte', description: 'Gesammelte Artikel und Daten prüfen.', to: '/admin/scraped-content', action: 'Inhalte öffnen', icon: DataObjectIcon },
        { title: 'Scraping-Regeln', description: 'Selektoren und externe Quellen verwalten.', to: '/admin/scraping-rules', action: 'Regeln öffnen', icon: PolicyIcon },
        { title: 'KI-Prompt-Regeln', description: 'Prompts für Analyse und Generierung steuern.', to: '/admin/ai-prompt-rules', action: 'Prompts öffnen', icon: AutoAwesomeIcon },
        { title: 'KI-Inhalte', description: 'Generierte Inhalte prüfen und verwalten.', to: '/admin/ai-content', action: 'KI-Inhalte öffnen', icon: ArticleIcon },
        { title: 'Kategorien', description: 'Zentrale Inhalts- und Softwarekategorien pflegen.', to: '/admin/categories', action: 'Kategorien öffnen', icon: CategoryIcon },
        { title: 'Tags', description: 'Zentrale Schlagwörter pflegen.', to: '/admin/tags', action: 'Tags öffnen', icon: TagIcon },
        { title: 'Vertrauenswürdige Quellen', description: 'Eingereichte Quellen prüfen.', to: '/admin/sources', action: 'Quellen öffnen', icon: FactCheckIcon },
        { title: 'Events', description: 'Gefundene Termine für Kalender verwalten.', to: '/admin/events', action: 'Events öffnen', icon: CalendarMonthIcon },
        { title: 'Förderungen', description: 'Förderfunde und KI-Kosten überwachen.', to: '/admin/funding', action: 'Förderungen öffnen', icon: ShoppingCartCheckoutIcon },
        { title: 'Monitor-Verwaltung', description: 'Fachmonitore und Dokumente verwalten.', to: '/admin/legal-monitor', action: 'Monitore öffnen', icon: GavelIcon },
      ],
    },
    {
      title: 'Betrieb & Auswertung',
      description: 'Automatisierung, Zustellung, Systemzustand und Nutzung im Blick behalten.',
      accent: theme.palette.secondary.main,
      cards: [
        { title: 'Automatische Aufgaben', description: 'Cronjobs für KI, Scraping und E-Mail steuern.', to: '/admin/cronjobs', action: 'Aufgaben öffnen', icon: ScheduleIcon },
        { title: 'Widget-Typen', description: 'Verfügbare Dashboard-Widgets definieren.', to: '/admin/widget-types', action: 'Widgets öffnen', icon: WidgetsIcon },
        { title: 'E-Mail & Reports', description: 'Versand, Reports und Empfänger prüfen.', to: '/admin/email-reports', action: 'E-Mail öffnen', icon: EmailIcon },
        { title: 'Statistiken', description: 'Nutzung, Tokens und Inhalte auswerten.', to: '/admin/statistics', action: 'Statistiken öffnen', icon: QueryStatsIcon },
        { title: 'System & Aktivität', description: 'Systemzustand, Jobs und Protokolle prüfen.', to: '/admin/monitor', action: 'Monitor öffnen', icon: MonitorIcon },
      ],
    },
  ];

  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 5 }}>
      <Typography variant="h4" component="h1" fontWeight={900}>Admin-Dashboard</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>
        Verwaltungsbereiche sind nach Aufgabe geordnet. Keine Funktion wurde entfernt.
      </Typography>

      <Stack spacing={3}>
        {sections.map((section) => (
          <Paper key={section.title} variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3, borderColor: alpha(section.accent, 0.24), bgcolor: alpha(section.accent, 0.035) }}>
            <Box sx={{ pl: 1.5, mb: 2, borderLeft: `4px solid ${section.accent}` }}>
              <Typography variant="h5" fontWeight={900}>{section.title}</Typography>
              <Typography variant="body2" color="text.secondary">{section.description}</Typography>
            </Box>
            <Grid container spacing={2}>
              {section.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <Grid item xs={12} sm={6} lg={4} key={card.to}>
                    <Paper elevation={0} sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2.5, bgcolor: 'background.paper', border: `1px solid ${alpha(section.accent, 0.16)}`, transition: 'transform 160ms ease, box-shadow 160ms ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 10px 24px ${alpha(section.accent, 0.1)}` } }}>
                      <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flex: 1 }}>
                        <Box sx={{ width: 44, height: 44, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: alpha(section.accent, 0.1), color: section.accent, flexShrink: 0 }}><Icon /></Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1" fontWeight={900}>{card.title}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>{card.description}</Typography>
                        </Box>
                      </Stack>
                      <Button component={Link} to={card.to} size="small" sx={{ mt: 1.5, alignSelf: 'flex-start', color: section.accent, fontWeight: 850 }}>{card.action}</Button>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </Paper>
        ))}
      </Stack>
    </Container>
  );
};

export default AdminDashboardPage;
