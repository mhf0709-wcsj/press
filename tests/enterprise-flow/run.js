const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const appConfig = JSON.parse(read('miniprogram/app.json'))
const workbench = read('miniprogram/pages/workbench/workbench.js')
const workbenchView = read('miniprogram/pages/workbench/workbench.wxml')
const equipmentDetail = read('miniprogram/pages/equipment-detail/equipment-detail.js')
const camera = read('miniprogram/pages/camera/camera.js')
const dataAccess = read('cloudfunctions/dataAccess/index.js')

assert.strictEqual(appConfig.tabBar.list.length, 3)
assert.deepStrictEqual(
  appConfig.tabBar.list.map((item) => item.pagePath),
  ['pages/ai-assistant/ai-assistant', 'pages/workbench/workbench', 'pages/user/user']
)

assert(workbench.includes("wx.switchTab({ url: '/pages/ai-assistant/ai-assistant' })"))
assert(workbenchView.includes('bindtap="goToCreateEquipment"'))
assert(workbenchView.includes('bindtap="goToGaugeEntry"'))
assert(workbenchView.includes('wx:if="{{bindingReminder && bindingReminder.count > 0}}"'))
assert(workbenchView.includes('wx:if="{{inactiveDevices.length > 0}}"'))

assert(dataAccess.includes('getEquipmentBundle: handleGetEquipmentBundle'))
assert(dataAccess.includes("fetchAll('devices', buildFilters(RESOURCES.devices, actor"))
assert(dataAccess.includes("fetchAll('pressure_records', buildFilters(RESOURCES.pressure_records, actor"))
assert(equipmentDetail.includes("dataAccess.request('getEquipmentBundle', { id: equipmentId })"))
assert(!equipmentDetail.includes("require('../../services/device-service')"))
assert(!equipmentDetail.includes("require('../../services/record-service')"))

const savedDetailUrl = 'equipment-detail/equipment-detail?id=${equipmentId}&highlightGaugeId=${gauge._id}'
assert(camera.includes('wx.redirectTo({'))
assert(camera.includes(savedDetailUrl))

console.log('Enterprise main flow regression passed: 14/14')
