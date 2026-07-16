const assert = require('assert')

process.env.NODE_ENV = 'test'
const { __test } = require('../../cloudfunctions/batchImport/index')

assert.strictEqual(__test.normalizeDate('2026年3月6日'), '2026-03-06')
assert.strictEqual(__test.normalizeDate('2026/09/05'), '2026-09-05')
assert.strictEqual(__test.calculateExpiryDate('2026-03-06'), '2026-09-05')
assert.strictEqual(__test.calculateExpiryDate('2026-08-31'), '2027-02-27')
assert.strictEqual(__test.normalizeConclusion('该压力表合格'), '合格')
assert.strictEqual(__test.normalizeConclusion('检定不合格'), '不合格')

const columns = __test.buildColumns([
  '所属设备',
  '压力表编号',
  '出厂编号',
  '检定日期',
  '检定结论'
])
const equipment = {
  _id: 'equipment-1',
  equipmentNo: 'EQ-001',
  equipmentName: '空压机',
  district: '大峃所'
}
const row = __test.normalizeRow(
  ['空压机', 'PG-001', 'F-001', '2026-03-06', '合格'],
  columns,
  2,
  { companyName: '测试企业', district: '大峃所' },
  __test.buildDeviceIndexes([]),
  __test.buildEquipmentIndexes([equipment]),
  new Set()
)

assert.strictEqual(row.status, 'ready')
assert.strictEqual(row.importMode, 'record')
assert.strictEqual(row.equipmentId, 'equipment-1')
assert.strictEqual(row.verificationDate, '2026-03-06')

const gaugeOnly = __test.normalizeRow(
  ['空压机', 'PG-002', 'F-002', '', ''],
  columns,
  3,
  { companyName: '测试企业', district: '大峃所' },
  __test.buildDeviceIndexes([]),
  __test.buildEquipmentIndexes([equipment]),
  new Set()
)

assert.strictEqual(gaugeOnly.status, 'ready')
assert.strictEqual(gaugeOnly.importMode, 'gauge')

console.log('batch import tests passed')
