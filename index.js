const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')

const PORT = Number(process.env.PORT || 8080)
const HOST = '0.0.0.0'
const DIST_DIR = path.join(__dirname, 'web-app', 'dist')
const APP_TARGET = String(process.env.APP_TARGET || '').trim().toLowerCase()
const API_PROXY_TARGET = String(process.env.API_PROXY_TARGET || 'https://europe-central2-iclean2-2e798.cloudfunctions.net').trim().replace(/\/+$/, '')
const API_PROXY_FORWARDED_HOST = String(process.env.API_PROXY_FORWARDED_HOST || 'mobile-web--iclean-room.europe-west4.hosted.app').trim()
const API_PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 15000)

const MIME_BY_EXT = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function normalizeTarget(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw.startsWith('mobile')) return 'mobile'
  if (raw.startsWith('portal')) return 'portal'
  return ''
}

function resolveSpaEntryFile(target) {
  const normalized = normalizeTarget(target)
  const candidates =
    normalized === 'mobile'
      ? ['mobile.html', 'index.html', path.join('apps', 'mobile-web', 'mobile.html')]
      : ['index.html', 'mobile.html', path.join('apps', 'portal-web', 'index.html')]

  for (const candidate of candidates) {
    const fullPath = path.join(DIST_DIR, candidate)
    if (fileExists(fullPath)) {
      return fullPath
    }
  }

  return path.join(DIST_DIR, 'index.html')
}

function detectRequestTarget(requestUrl, hostHeader) {
  const envTarget = normalizeTarget(APP_TARGET)
  if (envTarget) return envTarget

  const pathname = String(requestUrl?.pathname || '').toLowerCase()
  if (pathname.startsWith('/mobile')) return 'mobile'
  if (pathname.startsWith('/portal')) return 'portal'

  const host = String(hostHeader || '').toLowerCase()
  if (host.includes('mobile')) return 'mobile'
  if (host.includes('portal')) return 'portal'

  return 'portal'
}

function safeResolveStaticPath(urlPathname, spaEntryRelative) {
  const decoded = decodeURIComponent(urlPathname || '/')
  const normalized = path.posix.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '')
  const relative = normalized === '/' ? `/${spaEntryRelative}` : normalized
  const absolute = path.join(DIST_DIR, relative)
  if (!absolute.startsWith(DIST_DIR)) {
    return path.join(DIST_DIR, spaEntryRelative)
  }
  return absolute
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  })
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function isApiMethodWithBody(method) {
  const upper = String(method || '').toUpperCase()
  return upper !== 'GET' && upper !== 'HEAD'
}

async function proxyApiRequest(req, res, requestUrl) {
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search || ''}`, `${API_PROXY_TARGET}/`)
  const method = String(req.method || 'GET').toUpperCase()
  const requestBody = isApiMethodWithBody(method) ? await readRequestBody(req) : Buffer.alloc(0)

  const headers = {
    'x-forwarded-host': API_PROXY_FORWARDED_HOST,
    'x-forwarded-proto': 'https',
  }
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
  if (req.headers.authorization) headers.authorization = req.headers.authorization
  if (req.headers.accept) headers.accept = req.headers.accept
  if (req.headers['x-firebase-appcheck']) headers['x-firebase-appcheck'] = req.headers['x-firebase-appcheck']

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_PROXY_TIMEOUT_MS)

  let upstream
  try {
    upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      body: requestBody.length ? requestBody : undefined,
      redirect: 'manual',
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    sendJson(res, 502, {
      ok: false,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: error?.name === 'AbortError' ? 'Upstream timeout.' : 'Upstream request failed.',
      },
    })
    return
  }
  clearTimeout(timeout)

  const raw = Buffer.from(await upstream.arrayBuffer())
  const responseHeaders = {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }

  res.writeHead(upstream.status, responseHeaders)
  res.end(raw)
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (!fs.existsSync(DIST_DIR)) {
    sendJson(res, 500, {
      error: 'web-app/dist not found',
      message: 'Run npm run build before starting the server.',
    })
    return
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (requestUrl.pathname.startsWith('/api/')) {
    proxyApiRequest(req, res, requestUrl).catch((error) => {
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'API_PROXY_ERROR',
          message: error?.message || 'Unexpected API proxy error.',
        },
      })
    })
    return
  }
  const requestTarget = detectRequestTarget(requestUrl, req.headers.host)
  const spaEntryFile = resolveSpaEntryFile(requestTarget)
  const spaEntryRelative = path.relative(DIST_DIR, spaEntryFile).split(path.sep).join('/')
  const wantedFile = safeResolveStaticPath(requestUrl.pathname, spaEntryRelative)
  const wantsHtml = !path.extname(wantedFile)

  if (wantsHtml) {
    sendFile(res, spaEntryFile)
    return
  }

  fs.stat(wantedFile, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, wantedFile)
      return
    }
    sendFile(res, spaEntryFile)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`)
})
