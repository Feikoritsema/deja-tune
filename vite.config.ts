import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // relative base so the build works under a GitHub Pages subpath (/deja-tune/);
  // vite-plugin-pwa resolves its own URLs against this.
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Déjà Tune',
        short_name: 'Déjà Tune',
        description: 'Multiplayer song guesser for one iPad — whose ears are the best?',
        theme_color: '#170F1C',
        background_color: '#170F1C',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/pool/*.json'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/pool\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'deja-tune-pools',
              expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/cdn-images\.dzcdn\.net\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'deja-tune-covers',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 500
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
});