import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version?: string
}

function resolveAppBuildId(mode: string): string {
  const buildId =
    process.env.VITE_APP_BUILD_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim()

  if (buildId) {
    return buildId
  }

  if (mode === 'production') {
    throw new Error(
      'Production builds require one of VITE_APP_BUILD_ID, VERCEL_GIT_COMMIT_SHA, or GIT_COMMIT_SHA.',
    )
  }

  const version = packageJson.version?.trim() || '0.0.0'
  return `${version}-dev-${Date.now()}`
}

export default defineConfig(({ mode }) => {
  const appBuildId = resolveAppBuildId(mode)

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    build: {
      chunkSizeWarningLimit: 1400,
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

            if (id.includes('src/domain/coachProofAnswer')) {
              return 'coach-proof-answer'
            }

            if (id.includes('src/domain/cutOsActivation')) {
              return 'cut-os-activation'
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
        strategies: 'injectManifest',
        srcDir: 'src/pwa',
        filename: 'sw.ts',
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
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
          globIgnores: ['**/heic2any-*.js'],
        },
      }),
    ],
  }
})
