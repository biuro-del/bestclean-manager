const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')

const PORT = Number(process.env.PORT || 8080)
const HOST = '0.0.0.0'
const DIST_DIR = path.join(__dirname, 'web-app', 'dist')
const APP_TARGET = String(process.env.APP_TARGET || '').trim().toLowerCase()

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

function resolveSpaEntryFile() {
  const candidates =
    APP_TARGET === 'mobile'
      ? ['index.html', 'mobile.html', path.join('apps', 'mobile-web', 'mobile.html')]
      : ['index.html', path.join('apps', 'portal-web', 'index.html'), 'mobile.html', path.join('apps', 'mobile-web', 'mobile.html')]

  for (const candidate of candidates) {
    const fullPath = path.join(DIST_DIR, candidate)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }

  return path.join(DIST_DIR, 'index.html')
}

const SPA_ENTRY_FILE = resolveSpaEntryFile()
const SPA_ENTRY_RELATIVE = path.relative(DIST_DIR, SPA_ENTRY_FILE).split(path.sep).join('/')

function safeResolveStaticPath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname || '/')
  const normalized = path.posix.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '')
  const relative = normalized === '/' ? `/${SPA_ENTRY_RELATIVE}` : normalized
  const absolute = path.join(DIST_DIR, relative)
  if (!absolute.startsWith(DIST_DIR)) {
    return SPA_ENTRY_FILE
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
  const wantedFile = safeResolveStaticPath(requestUrl.pathname)
  const wantsHtml = !path.extname(wantedFile)

  if (wantsHtml) {
    sendFile(res, SPA_ENTRY_FILE)
    return
  }

  fs.stat(wantedFile, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, wantedFile)
      return
    }
    sendFile(res, SPA_ENTRY_FILE)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`)
})
