const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const checks = [
  ['manual data writes', read('cloudfunctions/dataAccess/index.js'), 'writeOperationLog'],
  ['AI CRUD writes', read('cloudfunctions/aiAssistant/crud.js'), "source: 'ai'"],
  ['Excel import writes', read('cloudfunctions/batchImport/index.js'), "source: 'excel'"],
  ['authentication writes', read('cloudfunctions/enterpriseAuth/index.js'), 'writeAuthOperationLog'],
  ['rectification writes', read('cloudfunctions/expiryReminder/index.js'), 'writeReminderOperationLog']
]

checks.forEach(([label, source, marker]) => {
  assert(source.includes(marker), `Missing audit coverage for ${label}`)
})

const baseline = JSON.parse(read('config/production-baseline.json'))
assert(baseline.denyClientReadWriteCollections.includes('operation_logs'))
assert(baseline.denyClientReadWriteCollections.includes('enterprise_notifications'))

console.log(`Audit coverage regression passed: ${checks.length + 2}/${checks.length + 2}`)
