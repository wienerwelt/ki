// frontend/vite.frontend.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api/],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-runtime-v2',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
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
        enabled: false,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/directory_logos': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    // Wichtig: kein aggressives manualChunks mehr.
    // React, D3 und CommonJS-Unterpakete bleiben dadurch in Rollups natürlicher Dependency-Reihenfolge.
    // Das beseitigt die Runtime-Fehler wie "createContext" / "Children" aus gemischten Vendor-Chunks.
    chunkSizeWarningLimit: 1500,
  },
});
