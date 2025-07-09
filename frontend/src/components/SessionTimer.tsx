import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Chip, IconButton, Tooltip } from '@mui/material';
import TimerIcon from '@mui/icons-material/Timer';
import AutorenewIcon from '@mui/icons-material/Autorenew';

const SessionTimer: React.FC = () => {
    const { tokenExp, logout, renewSession } = useAuth(); // NEU: renewSession aus dem Context holen
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [isRenewing, setIsRenewing] = useState(false);

    useEffect(() => {
        if (!tokenExp) {
            setTimeLeft(null);
            return;
        }

        const calculateTimeLeft = () => {
            const nowInSeconds = Math.floor(Date.now() / 1000);
            return Math.max(0, tokenExp - nowInSeconds);
        };

        setTimeLeft(calculateTimeLeft());
        const interval = setInterval(() => {
            const remaining = calculateTimeLeft();
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                alert("Ihre Sitzung ist abgelaufen. Sie werden nun ausgeloggt.");
                logout();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [tokenExp, logout]);

    const handleRenew = async () => {
        setIsRenewing(true);
        await renewSession();
        setIsRenewing(false);
    };

    // Zeigt den Timer nur an, wenn weniger als 60 Minuten verbleiben
    if (timeLeft === null || timeLeft > 3600) {
        return null;
    }

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <>
            <Chip
                icon={<TimerIcon />}
                label={`Sitzung läuft ab in: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
                color={timeLeft < 300 ? "error" : "warning"}
                variant="outlined"
                sx={{ mr: 1, color: 'white', borderColor: 'rgba(255, 255, 255, 0.7)' }}
            />
            <Tooltip title="Sitzung verlängern">
                <IconButton onClick={handleRenew} disabled={isRenewing} sx={{ color: 'white' }}>
                    <AutorenewIcon />
                </IconButton>
            </Tooltip>
        </>
    );
};

export default SessionTimer;
