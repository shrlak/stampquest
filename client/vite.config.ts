import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Set VITE_BASE when deploying under a sub-path (GitHub Pages: /passport/).
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Never enable the service worker against the dev server — stale-cache debugging misery.
      devOptions: { enabled: false },
      includeAssets: ['icons/apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'StampQuest',
        short_name: 'StampQuest',
        description:
          'Collect digital stamps from places you visit and build a personal travel passport.',
        display: 'standalone',
        orientation: 'portrait',
        // relative so the app also works when served under a sub-path
        start_url: './',
        scope: './',
        background_color: '#f6f0e2',
        theme_color: '#f6f0e2',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        // The API must never be served from the SW cache.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
