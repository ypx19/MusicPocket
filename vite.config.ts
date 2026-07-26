import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Deploy workflow sets VITE_BASE=/<repo>/. Local/dev defaults to `/`.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'data/**/*.json', 'music/**/*', 'covers/**/*', 'lyrics/**/*'],
      manifest: {
        name: 'MusicPocket',
        short_name: 'MusicPocket',
        description: 'Personal self-hosted music library player',
        theme_color: '#0f1c24',
        background_color: '#0f1c24',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache app shell only; stream/library media at runtime.
        globPatterns: ['**/*.{js,css,html,ico,svg,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/(music|covers|lyrics|data)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'musicpocket-media',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
