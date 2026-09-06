'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const demoUrl =
  'https://cleanzi-portal-klienta-test--grafik-demo-20260905-ffwbnzuu.web.app/'

const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('Grafik demo znajduje się bezpośrednio pod Pulpitem i pozostaje zewnętrznym linkiem', () => {
  const layout = read(
    'web-app',
    'apps',
    'portal-web',
    'src',
    'ui',
    'layoutTemplate.js',
  )
  const router = read(
    'web-app',
    'apps',
    'portal-web',
    'src',
    'ui',
    'router.js',
  )
  const portal = read(
    'web-app',
    'apps',
    'portal-web',
    'src',
    'ui',
    'portalApp.js',
  )

  const menuStart = layout.indexOf('<div class="menu">')
  const menuEnd = layout.indexOf(
    '<div class="menu-group-title">OPERACJE</div>',
    menuStart,
  )
  const menu = layout.slice(menuStart, menuEnd)

  const dashboard = menu.indexOf('data-route="dashboard"')
  const dashboardEnd =
    menu.indexOf('</button>', dashboard) + '</button>'.length
  const hrefIndex = menu.indexOf(`href="${demoUrl}"`)
  const linkStart = menu.lastIndexOf('<a', hrefIndex)
  const linkTagEnd = menu.indexOf('>', hrefIndex)
  const linkEnd = menu.indexOf('</a>', linkTagEnd) + '</a>'.length
  const eventsMarker = menu.indexOf('data-route="events"')
  const eventsStart = menu.lastIndexOf('<button', eventsMarker)

  assert.equal(layout.split(demoUrl).length - 1, 1)
  assert.ok(dashboard >= 0 && hrefIndex > dashboard && eventsMarker > hrefIndex)
  assert.equal(menu.slice(dashboardEnd, linkStart).trim(), '')
  assert.equal(menu.slice(linkEnd, eventsStart).trim(), '')

  const openingTag = menu.slice(linkStart, linkTagEnd + 1)
  const body = menu.slice(linkTagEnd + 1, linkEnd)

  assert.match(openingTag, /\bclass="menu-item"/)
  assert.match(openingTag, /\btarget="_blank"/)
  assert.match(openingTag, /\brel="[^"]*\bnoopener\b[^"]*"/)
  assert.match(openingTag, /\brel="[^"]*\bnoreferrer\b[^"]*"/)
  assert.doesNotMatch(openingTag, /\bdata-route=/)
  assert.match(body, /<span class="mi-label">Grafik \(demo\)<\/span>/)

  assert.doesNotMatch(router, /grafik-demo-20260905/)
  assert.doesNotMatch(portal, /grafik-demo-20260905/)
})
