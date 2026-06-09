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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('/react/') ||
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler')
          ) {
            return 'react-vendor';
          }

          if (id.includes('@mui') || id.includes('@emotion')) {
            return 'mui';
          }

          if (id.includes('leaflet')) {
            return 'leaflet';
          }

          return 'vendor';
        },
      },
    },
  },
});