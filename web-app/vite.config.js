import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_LOCAL_API_TARGET = 'http://127.0.0.1:8080'

function normalizeApiProxyTarget(value) {
  return String(value || DEFAULT_LOCAL_API_TARGET).trim().replace(/\/+$/, '')
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
    return '127.0.0.1:8080'
  }
}

function resolveForwardedProtocol(target) {
  try {
    return new URL(target).protocol.replace(':', '') || 'http'
  } catch {
    return 'http'
  }
}

function resolveInputHtmlMap() {
  const portalInput = resolve(__dirname, 'index.html')

  return { portal: portalInput }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  normalizeTarget(process.env.APP_TARGET || mode)
  const apiProxyTarget = normalizeApiProxyTarget(
    env.VITE_DEV_API_PROXY_TARGET || process.env.VITE_DEV_API_PROXY_TARGET || DEFAULT_LOCAL_API_TARGET,
  )
  const functionsProxyTarget = String(
    env.VITE_DEV_FUNCTIONS_PROXY_TARGET || process.env.VITE_DEV_FUNCTIONS_PROXY_TARGET || '',
  ).trim().replace(/\/+$/, '')
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
      origin: localAdminApiProxyTarget,
      referer: `${localAdminApiProxyTarget}/`,
      'x-forwarded-host': resolveForwardedHost(localAdminApiProxyTarget),
      'x-forwarded-proto': resolveForwardedProtocol(localAdminApiProxyTarget),
    },
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('origin', localAdminApiProxyTarget)
        proxyReq.setHeader('referer', `${localAdminApiProxyTarget}/`)
        proxyReq.setHeader('x-forwarded-host', resolveForwardedHost(localAdminApiProxyTarget))
        proxyReq.setHeader('x-forwarded-proto', resolveForwardedProtocol(localAdminApiProxyTarget))
      })
    },
  }

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['firebase'],
    },
    server: {
      proxy: {
        ...(functionsProxyTarget ? {
          '/__functions': {
            target: functionsProxyTarget,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/__functions/, ''),
          },
        } : {}),
        '/api/admin/worker-profile': localAdminApiProxy,
        '/api/admin/worker-password': localAdminApiProxy,
        '/api/auth/provision-worker': localAdminApiProxy,
        '/api/auth/rollback-worker': localAdminApiProxy,
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          headers: {
            'x-forwarded-host': resolveForwardedHost(apiProxyTarget),
            'x-forwarded-proto': resolveForwardedProtocol(apiProxyTarget),
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
