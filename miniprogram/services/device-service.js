const dataAccess = require('./data-access-service')
const { markLedgerChanged } = require('../utils/data-change')

class DeviceService {
  async loadDevices(options = {}) {
    if (!options.enterpriseUser && !options.fromAdmin) return []
    const filters = { isDeleted: false }
    if (options.fromAdmin && options.district) filters.district = options.district
    return dataAccess.list('devices', {
      filters,
      orderBy: { field: 'createTime', direction: 'desc' },
      limit: 100
    })
  }

  async createDevice(deviceData) {
    const data = {
      ...deviceData,
      deviceNo: deviceData.deviceNo || `DEV-${Date.now()}`,
      deviceType: deviceData.deviceType || '压力表',
      status: deviceData.status || '在用',
      recordCount: 0,
      latestRecordId: '',
      latestVerificationDate: '',
      latestExpiryDate: '',
      latestConclusion: ''
    }
    const created = await dataAccess.create('devices', data)
    markLedgerChanged()
    return created
  }

  async updateRecordCount() {}

  async getDeviceById(deviceId) {
    return dataAccess.get('devices', deviceId)
  }

  async updateDevice(deviceId, data) {
    await dataAccess.update('devices', deviceId, sanitizeUpdateData(data))
    markLedgerChanged()
  }

  async deleteDevice() {
    throw new Error('请使用 softDeleteDevice 删除压力表')
  }

  async searchDevices(keyword, options = {}) {
    if (!keyword?.trim()) return this.loadDevices(options)
    const filters = { isDeleted: false }
    if (options.fromAdmin && options.district) filters.district = options.district
    return dataAccess.list('devices', {
      filters,
      keyword,
      keywordFields: ['deviceName', 'deviceNo', 'factoryNo', 'equipmentName', 'modelSpec'],
      orderBy: { field: 'createTime', direction: 'desc' },
      limit: 100
    })
  }

  async softDeleteDevice(deviceId) {
    const result = await dataAccess.softDelete('devices', deviceId)
    markLedgerChanged()
    return { success: true, ...result }
  }
}

function sanitizeUpdateData(data = {}) {
  const result = {}
  Object.keys(data).forEach((key) => {
    if (!key.startsWith('_') && key !== 'createTime' && data[key] !== undefined) result[key] = data[key]
  })
  return result
}

module.exports = new DeviceService()
