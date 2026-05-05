const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')
const sourceDir = path.join(repoRoot, 'web-app', 'dist')
const targetDir = path.join(repoRoot, 'web-app', 'dist-final-mobile')
const mobileEntryFile = path.join(sourceDir, 'apps', 'mobile-web', 'mobile.html')
const targetIndexFile = path.join(targetDir, 'index.html')

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Missing build output: ${sourceDir}`)
}

if (!fs.existsSync(mobileEntryFile)) {
  throw new Error(`Missing mobile entry file: ${mobileEntryFile}`)
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.cpSync(sourceDir, targetDir, { recursive: true })
fs.copyFileSync(mobileEntryFile, targetIndexFile)

console.log(`[prepare-final-mobile-hosting] prepared ${targetDir}`)
