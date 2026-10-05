import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Путь',
        short_name: 'Путь',
        description: 'Нарративная игра о выборе, последствиях и внутреннем росте.',
        theme_color: '#f2eadf',
        background_color: '#f2eadf',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'ru',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json}']
      }
    })
  ],
  test: {
    // Every scenario plays complete 30-day runs; the profile adds bookkeeping to each decision.
    testTimeout: 20000,
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
