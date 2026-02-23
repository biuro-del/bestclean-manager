import { resolve } from 'node:path'
import { defineConfig } from 'vite'
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
  const target = normalizeTarget(process.env.APP_TARGET || mode)

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolveInputHtmlMap(target),
      },
    },
  }
})
