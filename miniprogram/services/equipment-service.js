const db = wx.cloud.database()
const _ = db.command
const { formatDateTime } = require('../utils/helpers/date')

const TEXT = {
  missingId: '缺少设备ID',
  notFound: '未找到该设备',
  alreadyDeleted: '该设备已删除',
  deleteOperator: '企业用户',
  defaultName: '设备'
}

class EquipmentService {
  async hydrateGaugeCounts(equipments = []) {
    if (!Array.isArray(equipments) || equipments.length === 0) return []

    const nextList = await Promise.all(
      equipments.map(async (item) => {
        if (!item?._id) return item

        try {
          const countRes = await db.collection('devices').where({
            equipmentId: item._id,
            isDeleted: _.neq(true)
          }).count()

          const nextCount = Number(countRes.total || 0)
          if (Number(item.gaugeCount || 0) !== nextCount) {
            await db.collection('equipments').doc(item._id).update({
              data: {
                gaugeCount: nextCount,
                updateTime: formatDateTime(new Date())
              }
            })
          }

          return {
            ...item,
            gaugeCount: nextCount
          }
        } catch (error) {
          return item
        }
      })
    )

    return nextList
  }

  buildWhereCondition(options = {}) {
    const { enterpriseUser, fromAdmin, district } = options
    if (!enterpriseUser && !fromAdmin) return null

    const whereCondition = {
      isDeleted: _.neq(true)
    }
    if (fromAdmin) {
      if (district) whereCondition.district = district
    } else if (enterpriseUser) {
      whereCondition.enterpriseName = enterpriseUser.companyName
    }

    return whereCondition
  }

  async loadEquipments(options = {}) {
    const whereCondition = this.buildWhereCondition(options)
    if (!whereCondition) return []

    const res = await db.collection('equipments')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
    return this.hydrateGaugeCounts(res.data || [])
  }

  async searchEquipments(keyword, options = {}) {
    const { enterpriseUser, fromAdmin } = options
    if (!keyword || !keyword.trim()) return this.loadEquipments(options)

    const whereCondition = {
      isDeleted: _.neq(true),
      equipmentName: db.RegExp({ regexp: keyword, options: 'i' })
    }
    if (!fromAdmin && enterpriseUser) whereCondition.enterpriseName = enterpriseUser.companyName

    const res = await db.collection('equipments')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()
    return this.hydrateGaugeCounts(res.data || [])
  }

  async countEquipments(options = {}) {
    const whereCondition = this.buildWhereCondition(options)
    if (!whereCondition) return 0

    const res = await db.collection('equipments').where(whereCondition).count()
    return Number(res.total || 0)
  }

  async loadUnboundEquipments(options = {}) {
    const whereCondition = this.buildWhereCondition(options)
    if (!whereCondition) return []

    const all = await db.collection('equipments')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()

    const normalized = await this.hydrateGaugeCounts(all.data || [])
    return normalized.filter((item) => Number(item.gaugeCount || 0) === 0).slice(0, 20)
  }

  async createEquipment(data, options = {}) {
    const { enterpriseUser, fromAdmin, district } = options

    const equipment = {
      equipmentNo: data.equipmentNo || `EQ-${Date.now()}`,
      equipmentName: data.equipmentName,
      enterpriseName: fromAdmin ? (data.enterpriseName || '') : (enterpriseUser?.companyName || ''),
      district: district || data.district || '',
      location: data.location || '',
      gaugeCount: 0,
      isDeleted: false,
      deletedAt: '',
      deletedBy: '',
      deletedById: '',
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
      const countRes = await db.collection('devices').where({
        equipmentId,
        isDeleted: _.neq(true)
      }).count()

      await db.collection('equipments').doc(equipmentId).update({
        data: {
          gaugeCount: countRes.total,
          updateTime: formatDateTime(new Date())
        }
      })
    } catch (error) {}
  }

  async softDeleteEquipment(equipmentId, options = {}) {
    const { enterpriseUser } = options
    if (!equipmentId) throw new Error(TEXT.missingId)

    const current = await this.getEquipmentById(equipmentId)
    if (!current) throw new Error(TEXT.notFound)
    if (current.isDeleted) throw new Error(TEXT.alreadyDeleted)

    const operatorName = enterpriseUser?.companyName || TEXT.deleteOperator
    const operatorId = enterpriseUser?._id || ''
    const deleteTime = formatDateTime(new Date())

    const gaugeCountRes = await db.collection('devices').where({
      equipmentId,
      isDeleted: _.neq(true)
    }).count()
    const relatedGaugeCount = Number(gaugeCountRes.total || 0)

    await db.collection('equipments').doc(equipmentId).update({
      data: {
        isDeleted: true,
        deletedAt: deleteTime,
        deletedBy: operatorName,
        deletedById: operatorId,
        updateTime: deleteTime
      }
    })

    try {
      await db.collection('deletion_logs').add({
        data: {
          entityType: 'equipment',
          entityId: equipmentId,
          entityName: current.equipmentName || current.equipmentNo || TEXT.defaultName,
          enterpriseName: current.enterpriseName || operatorName,
          district: current.district || '',
          equipmentId,
          equipmentName: current.equipmentName || '',
          equipmentNo: current.equipmentNo || '',
          relatedGaugeCount,
          deletedAt: deleteTime,
          deletedBy: operatorName,
          deletedById: operatorId,
          snapshot: current,
          createTime: deleteTime
        }
      })
    } catch (error) {}

    return {
      success: true,
      relatedGaugeCount,
      deletedAt: deleteTime
    }
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
