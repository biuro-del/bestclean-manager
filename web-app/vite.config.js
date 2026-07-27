import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_LOCAL_API_TARGET = 'http://127.0.0.1:8080'
const CLEANZI_AUTH_SESSION_PROXY_ORIGIN = 'https://portal.cleanzi.pl'
const AUTH_SESSION_CONTEXT_PROXY_PATTERN = '^/api/auth/session-context(?:\\?.*)?$'

function normalizeApiProxyTarget(value) {
  return String(value || DEFAULT_LOCAL_API_TARGET).trim().replace(/\/+$/, '')
}

export function normalizeAuthSessionProxyTarget(value) {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }

  let target
  try {
    target = new URL(raw)
  } catch {
    throw new Error('VITE_DEV_AUTH_API_PROXY_TARGET_INVALID')
  }

  const hasRootPathOnly = target.pathname === '/' && !target.search && !target.hash
  const hasNoCredentials = !target.username && !target.password
  if (
    target.origin !== CLEANZI_AUTH_SESSION_PROXY_ORIGIN ||
    !hasRootPathOnly ||
    !hasNoCredentials
  ) {
    throw new Error('VITE_DEV_AUTH_API_PROXY_TARGET_NOT_ALLOWED')
  }

  return target.origin
}

export function resolveAuthSessionProxySecure(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || ['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  throw new Error('VITE_DEV_AUTH_PROXY_TLS_SETTING_INVALID')
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
  const authSessionProxyEnabled = process.env.DEV_AUTH_SESSION_PROXY_ENABLED === '1'
  const authSessionProxyTarget = authSessionProxyEnabled
    ? normalizeAuthSessionProxyTarget(process.env.VITE_DEV_AUTH_API_PROXY_TARGET || '')
    : ''
  if (authSessionProxyEnabled && !authSessionProxyTarget) {
    throw new Error('VITE_DEV_AUTH_API_PROXY_TARGET_MISSING')
  }
  const authSessionProxySecure = resolveAuthSessionProxySecure(
    process.env.DEV_AUTH_SESSION_PROXY_TLS_REJECT_UNAUTHORIZED,
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
  const authSessionProxy = authSessionProxyTarget
    ? {
        target: authSessionProxyTarget,
        changeOrigin: true,
        secure: authSessionProxySecure,
        followRedirects: false,
        bypass: (req, res) => {
          const method = String(req.method || 'GET').toUpperCase()
          if (['GET', 'POST', 'OPTIONS'].includes(method)) {
            return undefined
          }

          res.writeHead(405, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            Allow: 'GET, POST, OPTIONS',
          })
          res.end(JSON.stringify({
            ok: false,
            error: {
              code: 'METHOD_NOT_ALLOWED',
              message: 'Dozwolone metody to GET, POST i OPTIONS.',
            },
          }))
          return req.url
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            for (const header of [
              'cookie',
              'forwarded',
              'proxy-authorization',
              'x-forwarded-for',
              'x-forwarded-host',
              'x-forwarded-port',
              'x-forwarded-proto',
              'x-forwarded-server',
              'x-real-ip',
            ]) {
              proxyReq.removeHeader(header)
            }
          })
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['set-cookie']
            proxyRes.headers['cache-control'] = 'no-store'
          })
        },
      }
    : null

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
        ...(authSessionProxy ? {
          [AUTH_SESSION_CONTEXT_PROXY_PATTERN]: authSessionProxy,
        } : {}),
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
