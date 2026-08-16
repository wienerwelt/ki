import { useEffect } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

const PwaUpdatePrompt = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      console.error('Service Worker konnte nicht registriert werden:', error);
    },
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let registration: ServiceWorkerRegistration | null = null;
    let intervalId: number | undefined;

    const checkForUpdate = () => {
      registration?.update().catch((error) => {
        console.warn('Update-Prüfung fehlgeschlagen:', error);
      });
    };

    navigator.serviceWorker.ready.then((readyRegistration) => {
      registration = readyRegistration;
      checkForUpdate();
      intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    }).catch(() => undefined);

    window.addEventListener('focus', checkForUpdate);

    return () => {
      window.removeEventListener('focus', checkForUpdate);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  return (
    <Snackbar
      open={needRefresh}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 20 }}
    >
      <Alert
        severity="info"
        variant="filled"
        action={(
          <Button
            color="inherit"
            size="small"
            onClick={() => updateServiceWorker(true)}
            sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}
          >
            Neu laden
          </Button>
        )}
        sx={{ width: '100%', alignItems: 'center', fontWeight: 700 }}
      >
        Eine neue Version ist verfügbar.
      </Alert>
    </Snackbar>
  );
};

export default PwaUpdatePrompt;
