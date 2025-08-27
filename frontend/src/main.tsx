// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import { GoogleOAuthProvider } from '@react-oauth/google';
import posthog from 'posthog-js';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import deTranslation from './locales/de/translation.json';
import enTranslation from './locales/en/translation.json';

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    capture_pageview: true, // Erfasst automatisch Seitenaufrufe
    autocapture: true, // Ermöglicht das Erstellen von Aktionen direkt aus dem PostHog-UI
});
            

i18n
  .use(LanguageDetector) // Erkennt die Browsersprache
  .use(initReactI18next) // Übergibt i18n an react-i18next
  .init({
    resources: {
      de: { translation: deTranslation },
      en: { translation: enTranslation }
    },
    fallbackLng: 'de', // Fallback-Sprache, falls eine Erkennung fehlschlägt
    interpolation: {
      escapeValue: false // React schützt bereits vor XSS
    }
  });


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId="64253350842-rsbufoutiov8pcoo19nedhdjgrn5d76e.apps.googleusercontent.com">
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
);