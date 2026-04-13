import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('src/utils/persistence/') ||
            id.includes('src/utils/diagnostics')
          ) {
            return 'app-storage'
          }

          if (id.includes('src/components/FoodForm')) {
            return 'food-form'
          }

          if (
            id.includes('src/components/AddFoodSheet') ||
            id.includes('src/components/SaveRecipeSheet') ||
            id.includes('src/components/ServingsInput') ||
            id.includes('src/components/add-food/') ||
            id.includes('src/hooks/useFoodCatalogSearch') ||
            id.includes('src/utils/openFoodFacts') ||
            id.includes('src/utils/labelOcr') ||
            id.includes('src/utils/ocrReview')
          ) {
            return 'food-acquisition'
          }

          if (id.includes('src/screens/WeightScreen') || id.includes('recharts')) {
            return 'weight-tools'
          }

          if (
            id.includes('src/screens/SettingsScreen') ||
            id.includes('src/hooks/useImportExport')
          ) {
            return 'settings-ui'
          }

          if (id.includes('@supabase/supabase-js')) {
            return 'sync-client'
          }

          return undefined
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'MacroTracker',
        short_name: 'MacroTracker',
        description: 'A mobile-first calorie and macro tracker that stores everything locally in your browser.',
        display: 'standalone',
        background_color: '#f4efe6',
        theme_color: '#0f766e',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        navigateFallback: 'index.html',
        runtimeCaching: [],
      },
    }),
  ],
})
