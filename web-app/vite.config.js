import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_REMOTE_API_TARGET = 'https://cleanzi-01.web.app'

function normalizeApiProxyTarget(value) {
  const target = String(value || DEFAULT_REMOTE_API_TARGET).trim().replace(/\/+$/, '')
  try {
    if (new URL(target).hostname.endsWith('.cloudfunctions.net')) {
      return DEFAULT_REMOTE_API_TARGET
    }
  } catch {
    // Fall back to text matching below.
  }
  return target.toLowerCase().includes('cloudfunctions.net') ? DEFAULT_REMOTE_API_TARGET : target
}

function normalizeTarget(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw && !raw.startsWith('portal')) {
    console.warn(`[vite] target "${raw}" is no longer supported; building portal only.`)
  }
  return 'portal'
}

function resolveInputHtmlMap() {
  const portalInput = resolve(__dirname, 'index.html')

  return { portal: portalInput }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  normalizeTarget(process.env.APP_TARGET || mode)
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID || 'iclean-room').trim() || 'iclean-room'
  const apiProxyTarget = normalizeApiProxyTarget(
    env.VITE_DEV_API_PROXY_TARGET || process.env.VITE_DEV_API_PROXY_TARGET || DEFAULT_REMOTE_API_TARGET,
  )
  const localAdminApiProxyTarget = normalizeApiProxyTarget(
    env.VITE_DEV_WORKER_API_PROXY_TARGET || process.env.VITE_DEV_WORKER_API_PROXY_TARGET || apiProxyTarget,
  )
  const localAdminApiProxy = {
    target: localAdminApiProxyTarget,
    changeOrigin: true,
    headers: {
      'x-forwarded-host': 'cleanzi-01.web.app',
      'x-forwarded-proto': 'https',
    },
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/__functions': {
          target: `https://europe-west3-${projectId}.cloudfunctions.net`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/__functions/, ''),
        },
        '/api/admin/worker-profile': localAdminApiProxy,
        '/api/admin/worker-password': localAdminApiProxy,
        '/api/auth/provision-worker': localAdminApiProxy,
        '/api/auth/rollback-worker': localAdminApiProxy,
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          headers: {
            'x-forwarded-host': 'cleanzi-01.web.app',
            'x-forwarded-proto': 'https',
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolveInputHtmlMap(),
      },
    },
  }
})
