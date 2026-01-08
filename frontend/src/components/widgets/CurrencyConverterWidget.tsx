import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  FormControl,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Alert,
  Link as MuiLink,
  Divider
} from '@mui/material';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';

import WidgetPaper from './WidgetPaper';
import { BaseWidgetProps } from '../../types/dashboard.types';

type CurrencyMap = Record<string, string>;

interface FrankfurterLatestResponse {
  base: string;
  date: string; // YYYY-MM-DD
  rates: Record<string, number>;
}

interface CurrencyConverterWidgetProps extends BaseWidgetProps {
  /** aus widget_types.config */
  title?: string;
  defaultFrom?: string;
  defaultTo?: string;
  defaultAmount?: number;
}

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

const CurrencyConverterWidget: React.FC<CurrencyConverterWidgetProps> = ({
  widgetId,
  onDelete,
  isRemovable,
  widgetTypeKey,
  title = 'Währungsumrechner',
  defaultFrom = 'EUR',
  defaultTo = 'USD',
  defaultAmount = 100
}) => {
  const [currencies, setCurrencies] = useState<CurrencyMap>({});
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [amount, setAmount] = useState<number>(defaultAmount);

  const [rate, setRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);

  const [loadingCurrencies, setLoadingCurrencies] = useState(true);
  const [loadingRate, setLoadingRate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Load currencies once
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingCurrencies(true);
      setError(null);
      try {
        const resp = await fetch(`${FRANKFURTER_BASE}/currencies`);
        if (!resp.ok) throw new Error(`Currencies API Fehler: ${resp.status}`);
        const data = (await resp.json()) as CurrencyMap;
        if (!alive) return;
        setCurrencies(data);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Währungen konnten nicht geladen werden.');
      } finally {
        if (alive) setLoadingCurrencies(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2) Load rate when from/to changes
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!from || !to || from === to) {
        setRate(1);
        setRateDate(null);
        return;
      }
      setLoadingRate(true);
      setError(null);
      try {
        const url = `${FRANKFURTER_BASE}/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Latest API Fehler: ${resp.status}`);
        const data = (await resp.json()) as FrankfurterLatestResponse;
        if (!alive) return;

        const r = data?.rates?.[to];
        if (typeof r !== 'number') throw new Error(`Kein Wechselkurs für ${from}→${to} gefunden.`);
        setRate(r);
        setRateDate(data.date || null);
      } catch (e: any) {
        if (!alive) return;
        setRate(null);
        setRateDate(null);
        setError(e?.message || 'Wechselkurs konnte nicht geladen werden.');
      } finally {
        if (alive) setLoadingRate(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [from, to]);

  const converted = useMemo(() => {
    if (rate == null) return null;
    const v = (Number(amount) || 0) * rate;
    return Number.isFinite(v) ? v : null;
  }, [amount, rate]);

  const currencyOptions = useMemo(() => {
    const entries = Object.entries(currencies);
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  }, [currencies]);

  const handleSwap = () => {
    setFrom(to);
    setTo(from);
  };

  const titleNode = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
      <CurrencyExchangeIcon />
      <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
        {title}
      </Typography>
    </Box>
  );

  const isBusy = loadingCurrencies || loadingRate;

  return (
    <WidgetPaper
      title={titleNode}
      widgetTitle={typeof title === 'string' ? title : 'Währungsumrechner'}
      widgetId={widgetId}
      onDelete={onDelete as any}
      isRemovable={isRemovable}
      widgetTypeKey={widgetTypeKey || 'CurrencyConverter'}
      noPadding
      loading={false}
      error={null}
    >
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Von</Typography>
            <Select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={loadingCurrencies}
            >
              {currencyOptions.map(([code, name]) => (
                <MenuItem key={code} value={code}>
                  {code} — {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <IconButton
            onClick={handleSwap}
            disabled={loadingCurrencies}
            sx={{ mt: 2.5 }}
            title="Währungen tauschen"
          >
            <SwapHorizIcon />
          </IconButton>

          <FormControl size="small" sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Nach</Typography>
            <Select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={loadingCurrencies}
            >
              {currencyOptions.map(([code, name]) => (
                <MenuItem key={code} value={code}>
                  {code} — {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <TextField
          size="small"
          label="Betrag"
          value={Number.isFinite(amount) ? amount : ''}
          onChange={(e) => setAmount(Number(e.target.value))}
          type="number"
          inputProps={{ step: '0.01' }}
          InputProps={{
            endAdornment: <InputAdornment position="end">{from}</InputAdornment>
          }}
        />

        <Divider />

<Box
  sx={{
    display: 'flex',
    alignItems: 'flex-start',   // 👈 wichtig
    justifyContent: 'space-between',
    gap: 2
  }}
>
  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
    <Typography variant="body2" color="text.secondary">
      Wechselkurs
    </Typography>
    <Typography variant="h6">
      {rate == null ? '—' : `${rate.toFixed(6)} ${to} / ${from}`}
    </Typography>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ mt: 0.5 }}
    >
      Stand: {rateDate
        ? new Date(rateDate).toLocaleDateString('de-DE')
        : '—'}
    </Typography>
  </Box>

  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end'    // 👈 gleiche Höhe, rechtsbündig
    }}
  >
    <Typography variant="body2" color="text.secondary">
      Ergebnis
    </Typography>
    <Typography variant="h5">
      {converted == null ? '—' : `${converted.toFixed(2)} ${to}`}
    </Typography>
  </Box>
</Box>


        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isBusy && <CircularProgress size={18} />}
          <Typography variant="caption" color="text.secondary">
            Quelle:{' '}
            <MuiLink href="https://frankfurter.dev" target="_blank" rel="noopener">
              Frankfurter (ECB Referenzkurse)
            </MuiLink>
          </Typography>
        </Box>
      </Box>
    </WidgetPaper>
  );
};

export default CurrencyConverterWidget;
