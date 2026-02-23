import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeTarget(value) {
  const raw = String(value || '').trim().toLowerCase()
  return raw.startsWith('mobile') ? 'mobile' : 'portal'
}

function resolveInputHtml(target) {
  if (target === 'mobile') {
    return resolve(__dirname, 'apps/mobile-web/mobile.html')
  }
  return resolve(__dirname, 'index.html')
}

export default defineConfig(({ mode }) => {
  const target = normalizeTarget(process.env.APP_TARGET || mode)

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolveInputHtml(target),
      },
    },
  }
})
