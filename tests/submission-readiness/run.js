const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const appSource = read('miniprogram/app.js')
const appConfig = JSON.parse(read('miniprogram/app.json'))
const projectConfig = JSON.parse(read('project.config.json'))
const preRelease = read('scripts/pre-release-check.ps1')
const registerView = read('miniprogram/pages/register/register.wxml')

assert(!appSource.includes('getSystemInfo()'))
assert(!appSource.includes('preloadCriticalData()'))
assert(!appSource.includes('fetchConfig()'))
assert(!appSource.includes('/pages/index/index'))
assert.strictEqual(appConfig.lazyCodeLoading, 'requiredComponents')
assert.strictEqual(projectConfig.setting.minified, true)
assert.strictEqual(projectConfig.setting.minifyWXML, true)
assert.strictEqual(projectConfig.setting.minifyWXSS, true)
assert.strictEqual(projectConfig.setting.scopeDataCheck, true)
assert.strictEqual(projectConfig.setting.autoAudits, true)
assert(projectConfig.packOptions.ignore.length >= 10)
assert(preRelease.includes('scripts/submission-audit.ps1'))
assert(registerView.includes('版本 1.2.0'))

const pageRoot = path.join(root, 'miniprogram/pages')
const registered = new Set(appConfig.pages.map((page) => page.split('/')[1]))
const unregistered = fs.readdirSync(pageRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !registered.has(entry.name))
  .filter((entry) => fs.existsSync(path.join(pageRoot, entry.name, `${entry.name}.js`)))
assert.deepStrictEqual(unregistered.map((entry) => entry.name), [])

const delayedNavigation = []
for (const directory of fs.readdirSync(pageRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue
  const file = path.join(pageRoot, directory.name, `${directory.name}.js`)
  if (!fs.existsSync(file)) continue
  const source = fs.readFileSync(file, 'utf8')
  if (/setTimeout\([\s\S]{0,120}wx\.(navigate|redirect|switch|reLaunch)/.test(source)) {
    delayedNavigation.push(directory.name)
  }
}
assert.deepStrictEqual(delayedNavigation, [])

console.log('Submission readiness regression passed: 15/15')
