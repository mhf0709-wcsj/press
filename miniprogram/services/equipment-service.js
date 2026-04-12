const db = wx.cloud.database()
const { formatDateTime } = require('../utils/helpers/date')

class EquipmentService {
  async loadEquipments(options = {}) {
    const { enterpriseUser, fromAdmin, district } = options
    if (!enterpriseUser && !fromAdmin) return []

    let whereCondition = {}
    if (fromAdmin) {
      if (district) whereCondition.district = district
    } else if (enterpriseUser) {
      whereCondition.enterpriseName = enterpriseUser.companyName
    }

    const res = await db.collection('equipments')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
    return res.data
  }

  async searchEquipments(keyword, options = {}) {
    const { enterpriseUser, fromAdmin } = options
    if (!keyword || !keyword.trim()) return this.loadEquipments(options)

    const whereCondition = {
      equipmentName: db.RegExp({ regexp: keyword, options: 'i' })
    }
    if (!fromAdmin && enterpriseUser) whereCondition.enterpriseName = enterpriseUser.companyName

    const res = await db.collection('equipments')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()
    return res.data
  }

  async createEquipment(data, options = {}) {
    const { enterpriseUser, fromAdmin, district } = options

    const equipment = {
      equipmentNo: data.equipmentNo || `EQ-${Date.now()}`,
      equipmentName: data.equipmentName,
      enterpriseName: fromAdmin ? (data.enterpriseName || '') : (enterpriseUser?.companyName || ''),
      district: district || data.district || '',
      location: data.location || '',
      qrCode: `EQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      gaugeCount: 0,
      createTime: formatDateTime(new Date()),
      updateTime: formatDateTime(new Date())
    }

    const res = await db.collection('equipments').add({ data: equipment })
    return { _id: res._id, ...equipment }
  }

  async getEquipmentById(id) {
    const res = await db.collection('equipments').doc(id).get()
    return res.data
  }

  async updateEquipment(id, data) {
    const safeData = sanitizeUpdateData(data)
    await db.collection('equipments').doc(id).update({
      data: { ...safeData, updateTime: formatDateTime(new Date()) }
    })
  }

  async updateGaugeCount(equipmentId) {
    try {
      const countRes = await db.collection('devices').where({ equipmentId }).count()
      await db.collection('equipments').doc(equipmentId).update({
        data: {
          gaugeCount: countRes.total,
          updateTime: formatDateTime(new Date())
        }
      })
    } catch (e) {}
  }
}

function sanitizeUpdateData(data = {}) {
  const result = {}
  Object.keys(data || {}).forEach((key) => {
    if (!key || key.startsWith('_')) return
    if (key === 'createTime') return
    const value = data[key]
    if (value === undefined) return
    result[key] = value
  })
  return result
}

module.exports = new EquipmentService()
