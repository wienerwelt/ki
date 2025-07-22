// src/components/AdminScheduleSelector.tsx
import React, { useState, useEffect } from 'react';
import { Grid, TextField, MenuItem, Typography } from '@mui/material';

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

const AdminScheduleSelector: React.FC<Props> = ({ value, onChange }) => {
    const [type, setType] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
    const [day, setDay] = useState<string>('1');
    const [time, setTime] = useState<string>('09:00');

    useEffect(() => {
        if (!value) {
            setType('none');
            return;
        }
        const parts = value.split(' ');
        if (parts.length !== 5) return;

        const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
        setTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);

        if (dayOfMonth !== '*' && dayOfWeek === '*') {
            setType('monthly');
            setDay(dayOfMonth);
        } else if (dayOfWeek !== '*' && dayOfMonth === '*') {
            setType('weekly');
            setDay(dayOfWeek);
        } else {
            setType('daily');
        }
    }, [value]);

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

    // -------- FIX: KEINE führenden Nullen mehr im Cronstring! --------
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
    // ----------------------------------------------------------------

    return (
        <>
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Ausführungszeitplan
            </Typography>
            <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={4}>
                    <TextField
                        select fullWidth label="Frequenz" value={type}
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
                        <TextField type="number" fullWidth label="Tag im Monat" value={day} onChange={(e) => handleDayChange(e.target.value)} InputProps={{ inputProps: { min: 1, max: 31 } }} />
                    )}
                </Grid>
                <Grid item xs={12} sm={4}>
                     {type !== 'none' && (
                        <TextField type="time" fullWidth label="Uhrzeit" value={time} onChange={(e) => handleTimeChange(e.target.value)} />
                     )}
                </Grid>
            </Grid>
        </>
    );
};

export default AdminScheduleSelector;
