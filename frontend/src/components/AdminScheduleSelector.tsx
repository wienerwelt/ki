// src/components/AdminScheduleSelector.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Alert, Grid, TextField, MenuItem, Typography, Chip, Stack } from '@mui/material';

interface Props {
    value: string | null;
    onChange: (cronString: string | null) => void;
}

const weekDays = [
    { value: '1', label: 'Montag' },
    { value: '2', label: 'Dienstag' },
    { value: '3', label: 'Mittwoch' },
    { value: '4', label: 'Donnerstag' },
    { value: '5', label: 'Freitag' },
    { value: '6', label: 'Samstag' },
    { value: '0', label: 'Sonntag' },
];

const pad = (value: number) => String(value).padStart(2, '0');

const formatDateTime = (date: Date | null) => {
    if (!date) return null;
    return date.toLocaleString('de-AT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getApproxNextRun = (type: 'none' | 'daily' | 'weekly' | 'monthly', day: string, time: string) => {
    if (type === 'none') return null;

    const [hourRaw, minuteRaw] = time.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    if (type === 'daily') {
        if (next <= now) next.setDate(next.getDate() + 1);
        return next;
    }

    if (type === 'weekly') {
        const targetDow = Number(day);
        if (!Number.isFinite(targetDow)) return null;
        const currentDow = next.getDay();
        let diff = targetDow - currentDow;
        if (diff < 0 || (diff === 0 && next <= now)) diff += 7;
        next.setDate(next.getDate() + diff);
        return next;
    }

    if (type === 'monthly') {
        const targetDay = Math.max(1, Math.min(31, Number(day) || 1));
        next.setDate(1);
        next.setMonth(now.getMonth());
        const lastDayThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(targetDay, lastDayThisMonth));
        next.setHours(hour, minute, 0, 0);
        if (next <= now) {
            next.setMonth(next.getMonth() + 1, 1);
            const lastDayNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
            next.setDate(Math.min(targetDay, lastDayNextMonth));
            next.setHours(hour, minute, 0, 0);
        }
        return next;
    }

    return null;
};

const AdminScheduleSelector: React.FC<Props> = ({ value, onChange }) => {
    const [type, setType] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
    const [day, setDay] = useState<string>('1');
    const [time, setTime] = useState<string>('09:00');
    const [warning, setWarning] = useState<string | null>(null);

    useEffect(() => {
        if (!value) {
            setType('none');
            setWarning(null);
            return;
        }

        const parts = value.trim().split(/\s+/);
        if (parts.length !== 5) {
            setWarning('Der gespeicherte Cron-Ausdruck konnte nicht vollständig gelesen werden.');
            return;
        }

        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
        setTime(`${String(Number(hour) || 0).padStart(2, '0')}:${String(Number(minute) || 0).padStart(2, '0')}`);

        if (month !== '*') {
            setWarning('Dieser Selector unterstützt aktuell nur tägliche, wöchentliche oder monatliche Cron-Ausdrücke.');
        } else if (dayOfMonth !== '*' && dayOfWeek === '*') {
            setType('monthly');
            setDay(dayOfMonth);
            setWarning(null);
        } else if (dayOfWeek !== '*' && dayOfMonth === '*') {
            setType('weekly');
            setDay(dayOfWeek === '7' ? '0' : dayOfWeek);
            setWarning(null);
        } else if (dayOfMonth === '*' && dayOfWeek === '*') {
            setType('daily');
            setWarning(null);
        } else {
            setType('daily');
            setWarning('Cron nutzt gleichzeitig Tag im Monat und Wochentag. Bitte prüfen.');
        }
    }, [value]);

    const triggerChange = (currentType: typeof type, currentDay: string, currentTime: string) => {
        if (currentType === 'none') {
            onChange(null);
            return;
        }

        let [hour, minute] = currentTime.split(':');
        minute = String(Number(minute) || 0);
        hour = String(Number(hour) || 9);

        let cronString = '';
        switch (currentType) {
            case 'monthly':
                cronString = `${minute} ${hour} ${currentDay} * *`;
                break;
            case 'weekly':
                cronString = `${minute} ${hour} * * ${currentDay}`;
                break;
            default:
                cronString = `${minute} ${hour} * * *`;
                break;
        }
        onChange(cronString);
    };

    const handleTypeChange = (newType: typeof type) => {
        setType(newType);
        triggerChange(newType, day, time);
    };

    const handleDayChange = (newDay: string) => {
        setDay(newDay);
        triggerChange(type, newDay, time);
    };

    const handleTimeChange = (newTime: string) => {
        setTime(newTime);
        triggerChange(type, day, newTime);
    };

    const nextRun = useMemo(() => getApproxNextRun(type, day, time), [type, day, time]);
    const nextRunLabel = formatDateTime(nextRun);

    return (
        <>
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Ausführungszeitplan
            </Typography>
            <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={4}>
                    <TextField
                        select
                        fullWidth
                        label="Frequenz"
                        value={type}
                        onChange={(e) => handleTypeChange(e.target.value as any)}
                    >
                        <MenuItem value="none">Deaktiviert</MenuItem>
                        <MenuItem value="daily">Täglich</MenuItem>
                        <MenuItem value="weekly">Wöchentlich</MenuItem>
                        <MenuItem value="monthly">Monatlich</MenuItem>
                    </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                    {type === 'weekly' && (
                        <TextField select fullWidth label="Wochentag" value={day} onChange={(e) => handleDayChange(e.target.value)}>
                            {weekDays.map(d => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
                        </TextField>
                    )}
                    {type === 'monthly' && (
                        <TextField
                            type="number"
                            fullWidth
                            label="Tag im Monat"
                            value={day}
                            onChange={(e) => handleDayChange(e.target.value)}
                            InputProps={{ inputProps: { min: 1, max: 31 } }}
                        />
                    )}
                </Grid>
                <Grid item xs={12} sm={4}>
                     {type !== 'none' && (
                        <TextField type="time" fullWidth label="Uhrzeit" value={time} onChange={(e) => handleTimeChange(e.target.value)} />
                     )}
                </Grid>
            </Grid>

            {type !== 'none' && (
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                    {value && <Chip size="small" label={`Cron: ${value}`} variant="outlined" />}
                    {nextRunLabel && <Chip size="small" color="info" label={`Nächste Ausführung ca.: ${nextRunLabel} Europe/Vienna`} />}
                </Stack>
            )}

            {warning && <Alert severity="warning" sx={{ mt: 1 }}>{warning}</Alert>}
        </>
    );
};

export default AdminScheduleSelector;
