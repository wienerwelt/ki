
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        maximumFileSizeToCacheInBytes: 10000000,
      },
      manifest: {
        name: 'Fleet KI-Dashboard',
        short_name: 'FleetKI',
        description: 'Ihr Kompass für betriebliche Mobilität.',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-500x500.png',
            sizes: '500x500',
            type: 'image/png',
          },
          {
            src: 'pwa-500x500.png',
            sizes: '500x500',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      devOptions: {
        enabled: true, // Für die Entwicklung
      },
    }),
  ],
  // ======================================================
  // KORREKTER PROXY-BLOCK
  // ======================================================
  server: {
    proxy: {
      '/api': {
      //  target: 'http://localhost:5000', // prod
        target: 'http://localhost:5001', // dev
        changeOrigin: true,
      },
    },
  },
  // ======================================================
});