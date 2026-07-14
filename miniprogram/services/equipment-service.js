const dataAccess = require('./data-access-service')
const { markLedgerChanged } = require('../utils/data-change')

class EquipmentService {
  async hydrateGaugeCounts(equipments = []) {
    return equipments
  }

  async loadEquipments(options = {}) {
    if (!options.enterpriseUser && !options.fromAdmin) return []
    const filters = { isDeleted: false }
    if (options.fromAdmin && options.district) filters.district = options.district
    return dataAccess.list('equipments', {
      filters,
      orderBy: { field: 'createTime', direction: 'desc' },
      limit: 100
    })
  }

  async searchEquipments(keyword, options = {}) {
    if (!keyword?.trim()) return this.loadEquipments(options)
    const filters = { isDeleted: false }
    if (options.fromAdmin && options.district) filters.district = options.district
    return dataAccess.list('equipments', {
      filters,
      keyword,
      keywordFields: ['equipmentName', 'equipmentNo', 'location'],
      orderBy: { field: 'createTime', direction: 'desc' },
      limit: 100
    })
  }

  async countEquipments(options = {}) {
    if (!options.enterpriseUser && !options.fromAdmin) return 0
    const filters = { isDeleted: false }
    if (options.fromAdmin && options.district) filters.district = options.district
    return dataAccess.count('equipments', filters)
  }

  async loadUnboundEquipments(options = {}) {
    const list = await this.loadEquipments(options)
    return list.filter((item) => Number(item.gaugeCount || 0) === 0).slice(0, 20)
  }

  async createEquipment(data) {
    const created = await dataAccess.create('equipments', {
      ...data,
      equipmentNo: data.equipmentNo || `EQ-${Date.now()}`,
      gaugeCount: 0
    })
    markLedgerChanged()
    return created
  }

  async getEquipmentById(id) {
    return dataAccess.get('equipments', id)
  }

  async updateEquipment(id, data) {
    await dataAccess.update('equipments', id, sanitizeUpdateData(data))
    markLedgerChanged()
  }

  async updateGaugeCount() {}

  async softDeleteEquipment(equipmentId) {
    const result = await dataAccess.softDelete('equipments', equipmentId)
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

module.exports = new EquipmentService()
