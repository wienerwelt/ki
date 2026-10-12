import React, { useState } from 'react';
import {
  Badge, Box, Button, Container, Drawer, IconButton, Paper, Stack, Typography,
} from '@mui/material';
import { alpha, getContrastRatio } from '@mui/material/styles';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import MenuIcon from '@mui/icons-material/Menu';
import PublicCompanySearch from './PublicCompanySearch';

export type PublicPortalNavItem = { label: string; badge?: number | null; onClick: () => void };
type Props = {
  logoUrl?: string | null;
  homeHref: string;
  partnerName: string;
  partnerClaim?: string;
  primaryColor: string;
  secondaryColor?: string;
  darkColor?: string;
  navItems: PublicPortalNavItem[];
  activeLabel?: string;
  onLogin: () => void;
  onOpenWelcome?: () => void;
  welcomeCollapsed?: boolean;
  partnerId?: string | null;
  onOpenNetwork?: () => void;
  onOpenCompany?: (id: string) => void;
};

const PublicPortalHeader: React.FC<Props> = ({
  logoUrl, homeHref, partnerName, partnerClaim, primaryColor, secondaryColor = '#0B2442', darkColor = '#061B33', navItems,
  activeLabel, onLogin, onOpenWelcome, welcomeCollapsed = false,
  partnerId, onOpenNetwork, onOpenCompany,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const headerForeground = getContrastRatio(primaryColor, '#fff') >= 3 ? '#fff' : darkColor;
  const run = (item: PublicPortalNavItem) => { setMobileOpen(false); item.onClick(); };
  const logo = <Box component="a" href={homeHref} aria-label={`${partnerName} – zur Startseite`} sx={{
    width: { xs: 58, md: 74 }, height: { xs: 58, md: 68 }, borderRadius: 2.5, p: 0.75,
    bgcolor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    border: `1px solid ${alpha('#fff', 0.58)}`, boxShadow: `0 12px 30px ${alpha(darkColor, 0.2)}`,
    textDecoration: 'none', transition: 'transform 160ms ease, box-shadow 160ms ease',
    '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 15px 34px ${alpha(darkColor, 0.28)}` },
    '&:focus-visible': { outline: `3px solid ${alpha('#fff', 0.8)}`, outlineOffset: 3 },
  }}>
    {logoUrl && !logoError
      ? <Box component="img" src={logoUrl} alt={`${partnerName} Logo`} onError={() => setLogoError(true)} sx={{ display: 'block', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', m: 'auto', objectFit: 'contain', objectPosition: '50% 50%' }} />
      : <Typography fontWeight={950} sx={{ color: primaryColor, fontSize: 22 }}>{partnerName.slice(0, 2).toUpperCase()}</Typography>}
  </Box>;

  return <>
    <Box component="header" sx={{
      position: 'sticky', top: 0, zIndex: 1100,
      bgcolor: primaryColor, isolation: 'isolate', overflow: 'hidden',
      color: headerForeground, boxShadow: `0 12px 34px ${alpha(primaryColor, 0.28)}`,
      '&::before': {
        content: '""', position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 8% -30%, ${alpha('#fff', 0.26)} 0%, transparent 38%), linear-gradient(105deg, transparent 45%, ${alpha(secondaryColor, 0.22)} 118%)`,
      },
      '&::after': {
        content: '""', position: 'absolute', zIndex: 0, pointerEvents: 'none',
        left: 0, right: 0, bottom: 0, height: 1,
        background: alpha('#fff', 0.26),
      },
    }}>
      <Container maxWidth="xl" sx={{ py: { xs: 1.35, md: 1.9 }, position: 'relative', zIndex: 1, pointerEvents: 'auto' }}>
        <Stack direction="row" alignItems="center" gap={{ xs: 1.25, lg: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0, flex: { xs: 1, lg: '0 1 360px' }, position: 'relative' }}>
            {logo}
            <Box sx={{ minWidth: 0, position: 'relative' }}>
              <Typography fontWeight={950} color={headerForeground} noWrap sx={{ fontSize: { xs: 18, md: 22 }, lineHeight: 1.08, letterSpacing: '-0.02em' }}>{partnerName}</Typography>
              <Typography sx={{ color: alpha(headerForeground, 0.92), fontWeight: 900, fontSize: { xs: 11, md: 12 }, textTransform: 'uppercase', letterSpacing: '0.1em', mt: 0.25 }} noWrap>Mitgliederportal</Typography>
              {partnerClaim && <Typography sx={{ display: { xs: 'none', xl: 'block' }, color: alpha(headerForeground, 0.74), fontWeight: 650, fontSize: 11.5, mt: 0.15 }} noWrap>{partnerClaim}</Typography>}
            </Box>
          </Stack>

          <Paper elevation={0} sx={{
            display: { xs: 'none', lg: 'flex' }, position: 'relative', zIndex: 2, pointerEvents: 'auto',
            alignItems: 'center', gap: 0.35, p: 0.55, mx: 'auto', borderRadius: 999,
            bgcolor: alpha(headerForeground, 0.11),
            border: `1px solid ${alpha(headerForeground, 0.22)}`, boxShadow: `0 10px 24px ${alpha(darkColor, 0.12)}`,
          }}>
            {navItems.map((item) => {
              const active = item.label === activeLabel;
              const button = <Button key={item.label} onClick={() => run(item)} aria-current={active ? 'page' : undefined} sx={{
                minWidth: 'auto', px: { lg: 1.35, xl: 1.75 }, py: 0.9, borderRadius: 999, textTransform: 'none',
                whiteSpace: 'nowrap', fontWeight: 900, fontSize: { lg: 13.5, xl: 14.5 },
                color: active ? darkColor : '#fff', bgcolor: active ? '#fff' : 'transparent',
                boxShadow: active ? `0 8px 20px ${alpha(darkColor, 0.2)}` : 'none',
                '&:hover': { bgcolor: active ? '#fff' : alpha('#fff', 0.15), color: active ? primaryColor : '#fff' },
              }}>{item.label}</Button>;
              return item.badge ? <Badge key={item.label} badgeContent={item.badge} max={999} sx={{ '& .MuiBadge-badge': { bgcolor: '#fff', color: darkColor, fontWeight: 900, right: 4, top: 1, boxShadow: `0 3px 10px ${alpha(darkColor, 0.2)}` } }}>{button}</Badge> : button;
            })}
          </Paper>

          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
            <PublicCompanySearch partnerId={partnerId} primaryColor={primaryColor} darkColor={darkColor} onOpenNetwork={onOpenNetwork} onOpenCompany={onOpenCompany} inverted invertedColor={headerForeground} />
            {welcomeCollapsed && onOpenWelcome && <IconButton title="Infobereich aufklappen" aria-label="Infobereich aufklappen" onClick={onOpenWelcome} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: headerForeground, bgcolor: alpha(headerForeground, 0.13), border: `1px solid ${alpha(headerForeground, 0.28)}`, '&:hover': { bgcolor: alpha(headerForeground, 0.22) } }}><ExpandMoreIcon /></IconButton>}
            <IconButton aria-label="Navigation öffnen" onClick={() => setMobileOpen(true)} sx={{ display: { xs: 'inline-flex', lg: 'none' }, color: headerForeground, bgcolor: alpha(headerForeground, 0.13), border: `1px solid ${alpha(headerForeground, 0.28)}`, '&:hover': { bgcolor: alpha(headerForeground, 0.22) } }}><MenuIcon /></IconButton>
            <Button onClick={onLogin} variant="contained" startIcon={<LockIcon />} sx={{
              bgcolor: headerForeground, color: primaryColor, borderRadius: 999, px: { xs: 1.7, sm: 2.4 }, minHeight: 44,
              textTransform: 'none', fontWeight: 950, whiteSpace: 'nowrap', boxShadow: `0 10px 24px ${alpha(darkColor, 0.18)}`,
              border: `1px solid ${alpha(headerForeground, 0.62)}`,
              '& .MuiButton-startIcon': { display: { xs: 'none', sm: 'inherit' } }, '&:hover': { bgcolor: headerForeground, filter: 'brightness(0.96)' },
            }}><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Anmelden</Box><Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Login</Box></Button>
          </Stack>
        </Stack>
      </Container>
    </Box>

    <Drawer anchor="right" open={mobileOpen} onClose={() => setMobileOpen(false)} PaperProps={{ sx: { width: 'min(88vw, 370px)', p: 2.5, borderTopLeftRadius: 26, borderBottomLeftRadius: 26 } }}>
      <Stack spacing={2.5} sx={{ height: '100%' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.5}><Stack direction="row" alignItems="center" gap={1.2} sx={{ minWidth: 0 }}>{logo}<Box sx={{ minWidth: 0 }}><Typography fontWeight={950} color={darkColor} noWrap>{partnerName}</Typography><Typography variant="caption" color="text.secondary">Mitgliederportal</Typography></Box></Stack><IconButton onClick={() => setMobileOpen(false)}><CloseIcon /></IconButton></Stack>
        <Paper elevation={0} sx={{ p: 2, borderRadius: 3, bgcolor: alpha(primaryColor, 0.07), border: `1px solid ${alpha(primaryColor, 0.12)}` }}><Typography fontWeight={850} color={darkColor}>{partnerClaim || 'Informationen, Netzwerk und Services an einem Ort.'}</Typography></Paper>
        <Stack spacing={0.8}><PublicCompanySearch partnerId={partnerId} primaryColor={primaryColor} darkColor={darkColor} onOpenNetwork={onOpenNetwork} onOpenCompany={onOpenCompany} mobileButton />{navItems.map((item) => <Button key={item.label} fullWidth onClick={() => run(item)} endIcon={<ChevronRightIcon />} sx={{ justifyContent: 'space-between', px: 2, py: 1.25, borderRadius: 2.5, textTransform: 'none', fontWeight: 900, color: item.label === activeLabel ? primaryColor : darkColor, bgcolor: item.label === activeLabel ? alpha(primaryColor, 0.1) : alpha(darkColor, 0.03) }}>{item.label}{item.badge ? ` (${item.badge})` : ''}</Button>)}</Stack>
        {welcomeCollapsed && onOpenWelcome && <Button startIcon={<ExpandMoreIcon />} onClick={() => { setMobileOpen(false); onOpenWelcome(); }}>Infobereich aufklappen</Button>}
        <Button sx={{ mt: 'auto' }} fullWidth variant="contained" startIcon={<LockIcon />} onClick={() => { setMobileOpen(false); onLogin(); }}>Mitglieder-Login</Button>
      </Stack>
    </Drawer>
  </>;
};

export default PublicPortalHeader;
