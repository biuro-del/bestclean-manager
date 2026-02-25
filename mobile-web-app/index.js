import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT || 8080)
const HOST = '0.0.0.0'
const DIST_DIR = path.join(__dirname, 'dist')
const INDEX_FILE = path.join(DIST_DIR, 'index.html')

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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function safeResolveStaticPath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname || '/')
  const normalized = path.posix.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '')
  const relative = normalized === '/' ? '/index.html' : normalized
  const absolute = path.join(DIST_DIR, relative)
  if (!absolute.startsWith(DIST_DIR)) {
    return INDEX_FILE
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

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (!fs.existsSync(DIST_DIR)) {
    sendJson(res, 500, {
      error: 'dist_not_found',
      message: 'Build output not found. Run npm run build before npm run start.',
    })
    return
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const wantedFile = safeResolveStaticPath(requestUrl.pathname)
  const wantsHtml = !path.extname(wantedFile)

  if (wantsHtml) {
    sendFile(res, INDEX_FILE)
    return
  }

  fs.stat(wantedFile, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, wantedFile)
      return
    }
    sendFile(res, INDEX_FILE)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`mobile-web-app listening on http://${HOST}:${PORT}`)
})
