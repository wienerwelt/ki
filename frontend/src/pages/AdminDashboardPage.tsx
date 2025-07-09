// frontend/src/pages/AdminDashboardPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Box, Typography, Container, Button, Grid, Paper } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';

// Icons
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
import QueryStatsIcon from '@mui/icons-material/QueryStats'; // NEU


const AdminDashboardPage: React.FC = () => {
    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Admin-Dashboard
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                    Verwalten Sie Business Partner, Inhalte, Regeln und Systemeinstellungen.
                </Typography>

                <Grid container spacing={3}>
                    {/* --- Stammdaten & Benutzer --- */}
                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <BusinessIcon sx={{ fontSize: 60, mb: 2 }} color="primary" />
                            <Typography variant="h6" component="h2" gutterBottom>Business Partner</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>Alle registrierten Business Partner verwalten.</Typography>
                            <Button component={Link} to="/admin/business-partners" variant="contained" color="primary">Verwalten</Button>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <GroupIcon sx={{ fontSize: 60, mb: 2 }} color="info" />
                            <Typography variant="h6" component="h2" gutterBottom>Benutzerverwaltung</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>Benutzer erstellen, bearbeiten und zuordnen.</Typography>
                            <Button component={Link} to="/admin/users" variant="contained" color="info">Verwalten</Button>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <WidgetsIcon sx={{ fontSize: 60, mb: 2 }} color="secondary" />
                            <Typography variant="h6" component="h2" gutterBottom>Widget-Typen</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>Verfügbare Widgets definieren und verwalten.</Typography>
                            <Button component={Link} to="/admin/widget-types" variant="contained" color="secondary">Verwalten</Button>
                        </Paper>
                    </Grid>

                    {/* --- Content & Regeln --- */}
                     <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <PolicyIcon sx={{ fontSize: 60, mb: 2 }} color="primary" />
                            <Typography variant="h6" component="h2" gutterBottom>Scraping-Regeln</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>Regeln für externe Quellen verwalten.</Typography>
                            <Button component={Link} to="/admin/scraping-rules" variant="contained" color="primary">Verwalten</Button>
                        </Paper>
                    </Grid>
                     <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <AutoAwesomeIcon sx={{ fontSize: 60, mb: 2 }} color="info" />
                            <Typography variant="h6" component="h2" gutterBottom>KI-Prompt-Regeln</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>KI-Prompts für Analysen und Generierungen.</Typography>
                            <Button component={Link} to="/admin/ai-prompt-rules" variant="contained" color="info">Verwalten</Button>
                        </Paper>
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <DataObjectIcon sx={{ fontSize: 60, mb: 2 }} color="warning" />
                            <Typography variant="h6" component="h2" gutterBottom>
                                Gescrapte Inhalte
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                                Alle gesammelten Inhalte (inkl. Verkehr) anzeigen.
                            </Typography>
                            <Button component={Link} to="/admin/scraped-content" variant="contained" color="warning">
                                Verwalten
                            </Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <ArticleIcon sx={{ fontSize: 60, mb: 2 }} color="success" />
                            <Typography variant="h6" component="h2" gutterBottom>
                                KI-Inhalte
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                                Alle von der KI erstellten Inhalte verwalten.
                            </Typography>
                            <Button component={Link} to="/admin/ai-content" variant="contained" color="success">
                                Verwalten
                            </Button>
                        </Paper>
                    </Grid>
                    
                    {/* --- System-Verwaltung --- */}
                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <CategoryIcon sx={{ fontSize: 60, mb: 2 }} color="secondary" />
                            <Typography variant="h6" component="h2" gutterBottom>
                                Kategorien
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                                Zentrale Verwaltung der Inhalts-Kategorien.
                            </Typography>
                            <Button component={Link} to="/admin/categories" variant="contained" color="secondary">
                                Verwalten
                            </Button>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <TagIcon sx={{ fontSize: 60, mb: 2 }} color="success" />
                            <Typography variant="h6" component="h2" gutterBottom>
                                Tags
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                                Zentrale Verwaltung der Schlagwörter (Tags).
                            </Typography>
                            <Button component={Link} to="/admin/tags" variant="contained" color="success">
                                Verwalten
                            </Button>
                        </Paper>
                    </Grid>
                     <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <SubscriptionsIcon sx={{ fontSize: 60, mb: 2 }} color="error" />
                            <Typography variant="h6" component="h2" gutterBottom>
                                Abonnements
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                                Widget-Zugriff für Business Partner steuern.
                            </Typography>
                            <Button component={Link} to="/admin/bp-widget-access" variant="contained" color="error">
                                Verwalten
                            </Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <MonitorIcon sx={{ fontSize: 60, mb: 2 }} color="action" />
                            <Typography variant="h6" component="h2" gutterBottom>
                                Aktivitätsmonitor
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                                System- und Benutzeraktivitäten überwachen.
                            </Typography>
                            <Button component={Link} to="/admin/monitor" variant="contained" color="secondary">
                                Anzeigen
                            </Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                            <QueryStatsIcon sx={{ fontSize: 60, mb: 2 }} color="primary" />
                            <Typography variant="h6" component="h2" gutterBottom>
                                Statistiken
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
                                Nutzungs- und Systemstatistiken anzeigen.
                            </Typography>
                            <Button component={Link} to="/admin/statistics" variant="contained" color="primary">
                                Anzeigen
                            </Button>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </DashboardLayout>
    );
};

export default AdminDashboardPage;
