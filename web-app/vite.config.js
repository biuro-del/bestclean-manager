import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeTarget(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw.startsWith('both') || raw === 'all') return 'both'
  return raw.startsWith('mobile') ? 'mobile' : 'portal'
}

function resolveInputHtmlMap(target) {
  const portalInput = resolve(__dirname, 'index.html')
  const mobileInput = resolve(__dirname, 'apps/mobile-web/mobile.html')

  if (target === 'mobile') {
    return { mobile: mobileInput }
  }

  if (target === 'portal') {
    return { portal: portalInput }
  }

  return {
    portal: portalInput,
    mobile: mobileInput,
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = normalizeTarget(process.env.APP_TARGET || mode)
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID || 'iclean-room').trim() || 'iclean-room'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/__functions': {
          target: `https://europe-west3-${projectId}.cloudfunctions.net`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/__functions/, ''),
        },
        '/api': {
          target: env.VITE_DEV_API_PROXY_TARGET || process.env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolveInputHtmlMap(target),
      },
    },
  }
})
