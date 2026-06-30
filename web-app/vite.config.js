import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_REMOTE_API_TARGET = 'https://cleanzi-01--iclean-room.europe-west4.hosted.app'

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

function resolveForwardedHost(target) {
  try {
    return new URL(target).host
  } catch {
    return 'cleanzi-01--iclean-room.europe-west4.hosted.app'
  }
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
      env.VITE_DEV_WORKER_API_PROXY_TARGET ||
      process.env.VITE_DEV_WORKER_API_PROXY_TARGET ||
      env.VITE_DEV_API_PROXY_TARGET ||
      process.env.VITE_DEV_API_PROXY_TARGET ||
      apiProxyTarget,
  )
  const localAdminApiProxy = {
    target: localAdminApiProxyTarget,
    changeOrigin: true,
    headers: {
      origin: DEFAULT_REMOTE_API_TARGET,
      referer: `${DEFAULT_REMOTE_API_TARGET}/`,
      'x-forwarded-host': resolveForwardedHost(localAdminApiProxyTarget),
      'x-forwarded-proto': 'https',
      'x-forwarded-port': '443',
      'x-forwarded-server': 'cleanzi-01.web.app',
    },
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('origin', DEFAULT_REMOTE_API_TARGET)
        proxyReq.setHeader('referer', `${DEFAULT_REMOTE_API_TARGET}/`)
        proxyReq.setHeader('x-forwarded-host', 'cleanzi-01.web.app')
        proxyReq.setHeader('x-forwarded-proto', 'https')
        proxyReq.setHeader('x-forwarded-port', '443')
        proxyReq.setHeader('x-forwarded-server', 'cleanzi-01.web.app')
      })
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
            'x-forwarded-host': resolveForwardedHost(apiProxyTarget),
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
