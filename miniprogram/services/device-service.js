const db = wx.cloud.database()
const _ = db.command
const { formatDateTime } = require('../utils/helpers/date')
const lifecycleService = require('./lifecycle-service')
const equipmentService = require('./equipment-service')

const TEXT = {
  defaultType: '\u538b\u529b\u8868',
  adminCreateSource: '\u7ba1\u7406\u7aef\u5f55\u5165',
  system: '\u7cfb\u7edf',
  createAction: '\u5165\u5e93',
  createRemark: '\u538b\u529b\u8868\u9996\u6b21\u5efa\u6863',
  createRemarkWithEquipment: '\u538b\u529b\u8868\u9996\u6b21\u5efa\u6863\uff08\u6240\u5c5e\u8bbe\u5907\uff1a{equipment}\uff09',
  deleteAction: '\u5220\u9664',
  deleteRemark: '\u538b\u529b\u8868\u5df2\u5220\u9664\uff0c\u5173\u8054\u8bb0\u5f55 {count} \u6761',
  deletionLogMissing: '\u5220\u9664\u7559\u75d5\u96c6\u5408\u4e0d\u5b58\u5728\uff0c\u5df2\u81ea\u52a8\u964d\u7ea7\u4e3a\u751f\u547d\u5468\u671f\u8bb0\u5f55',
  missingId: '\u7f3a\u5c11\u538b\u529b\u8868ID',
  notFound: '\u672a\u627e\u5230\u8be5\u538b\u529b\u8868',
  alreadyDeleted: '\u8be5\u538b\u529b\u8868\u5df2\u5220\u9664',
  deleteOperator: '\u4f01\u4e1a\u7528\u6237',
  defaultName: '\u538b\u529b\u8868'
}

class DeviceService {
  buildWhereCondition(options = {}) {
    const { enterpriseUser, fromAdmin, district } = options

    if (!enterpriseUser && !fromAdmin) return null

    const whereCondition = {
      isDeleted: _.neq(true)
    }

    if (fromAdmin) {
      if (district) whereCondition.district = district
    } else if (enterpriseUser?.companyName) {
      whereCondition.enterpriseName = enterpriseUser.companyName
    }

    return whereCondition
  }

  async loadDevices(options = {}) {
    const whereCondition = this.buildWhereCondition(options)
    if (!whereCondition) return []

    const res = await db.collection('devices')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()

    return res.data || []
  }

  async createDevice(deviceData, options = {}) {
    const { enterpriseUser, fromAdmin, district } = options
    const now = formatDateTime(new Date())

    const newDevice = {
      deviceNo: deviceData.deviceNo || `DEV-${Date.now()}`,
      deviceName: deviceData.deviceName,
      deviceType: deviceData.deviceType || TEXT.defaultType,
      enterpriseId: enterpriseUser?._id || enterpriseUser?.companyName || '',
      enterpriseName: fromAdmin ? (deviceData.enterpriseName || TEXT.adminCreateSource) : (enterpriseUser?.companyName || ''),
      district: district || deviceData.district || '',
      factoryNo: deviceData.factoryNo || '',
      equipmentId: deviceData.equipmentId || '',
      equipmentName: deviceData.equipmentName || '',
      status: deviceData.status || '\u5728\u7528',
      manufacturer: deviceData.manufacturer || '',
      modelSpec: deviceData.modelSpec || '',
      installLocation: deviceData.installLocation || '',
      recordCount: 0,
      isDeleted: false,
      deletedAt: '',
      deletedBy: '',
      deletedById: '',
      createTime: now,
      updateTime: now
    }

    const res = await db.collection('devices').add({ data: newDevice })

    lifecycleService.logEvent({
      deviceId: res._id,
      action: TEXT.createAction,
      operator: enterpriseUser?.companyName || TEXT.system,
      operatorId: enterpriseUser?._id || 'system',
      remark: newDevice.equipmentName
        ? TEXT.createRemarkWithEquipment.replace('{equipment}', newDevice.equipmentName)
        : TEXT.createRemark
    }).catch(() => {})

    if (newDevice.equipmentId) {
      equipmentService.updateGaugeCount(newDevice.equipmentId).catch(() => {})
    }

    return { _id: res._id, ...newDevice }
  }

  async updateRecordCount(deviceId) {
    try {
      const countRes = await db.collection('pressure_records')
        .where({ deviceId })
        .count()

      await db.collection('devices').doc(deviceId).update({
        data: {
          recordCount: countRes.total,
          updateTime: formatDateTime(new Date())
        }
      })
    } catch (error) {
      console.error('update record count failed:', error)
    }
  }

  async getDeviceById(deviceId) {
    const res = await db.collection('devices').doc(deviceId).get()
    return res.data
  }

  async updateDevice(deviceId, data) {
    const safeData = sanitizeUpdateData(data)
    await db.collection('devices').doc(deviceId).update({
      data: {
        ...safeData,
        updateTime: formatDateTime(new Date())
      }
    })
  }

  async deleteDevice(deviceId) {
    throw new Error('请使用 softDeleteDevice 删除压力表')
  }

  async searchDevices(keyword, options = {}) {
    const baseCondition = this.buildWhereCondition(options)
    if (!baseCondition) return []

    if (!keyword || !keyword.trim()) {
      return this.loadDevices(options)
    }

    const res = await db.collection('devices')
      .where({
        ...baseCondition,
        deviceName: db.RegExp({
          regexp: keyword,
          options: 'i'
        })
      })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()

    return res.data || []
  }

  async softDeleteDevice(deviceId, options = {}) {
    const { enterpriseUser } = options
    if (!deviceId) throw new Error(TEXT.missingId)

    const current = await this.getDeviceById(deviceId)
    if (!current) throw new Error(TEXT.notFound)
    if (current.isDeleted) throw new Error(TEXT.alreadyDeleted)

    const operatorName = enterpriseUser?.companyName || TEXT.deleteOperator
    const operatorId = enterpriseUser?._id || ''
    const deleteTime = formatDateTime(new Date())

    const relatedRecordRes = await db.collection('pressure_records')
      .where({ deviceId })
      .count()
    const relatedRecordCount = Number(relatedRecordRes.total || 0)

    await db.collection('devices').doc(deviceId).update({
      data: {
        isDeleted: true,
        deletedAt: deleteTime,
        deletedBy: operatorName,
        deletedById: operatorId,
        updateTime: deleteTime
      }
    })

    if (relatedRecordCount > 0) {
      await db.collection('pressure_records')
        .where({
          deviceId,
          isDeleted: _.neq(true)
        })
        .update({
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
            deletedBy: operatorName,
            deletedById: operatorId,
            updateTime: deleteTime
          }
        })
    }

    let logStored = true
    try {
      await db.collection('deletion_logs').add({
        data: {
          entityType: 'device',
          entityId: deviceId,
          entityName: current.deviceName || current.factoryNo || TEXT.defaultName,
          enterpriseName: current.enterpriseName || operatorName,
          district: current.district || '',
          equipmentId: current.equipmentId || '',
          equipmentName: current.equipmentName || '',
          factoryNo: current.factoryNo || '',
          deviceNo: current.deviceNo || '',
          relatedRecordCount,
          deletedAt: deleteTime,
          deletedBy: operatorName,
          deletedById: operatorId,
          snapshot: current,
          createTime: deleteTime
        }
      })
    } catch (error) {
      logStored = false
    }

    lifecycleService.logEvent({
      deviceId,
      action: TEXT.deleteAction,
      operator: operatorName,
      operatorId,
      remark: logStored
        ? TEXT.deleteRemark.replace('{count}', String(relatedRecordCount))
        : `${TEXT.deleteRemark.replace('{count}', String(relatedRecordCount))}，${TEXT.deletionLogMissing}`
    }).catch(() => {})

    if (current.equipmentId) {
      equipmentService.updateGaugeCount(current.equipmentId).catch(() => {})
    }

    return {
      success: true,
      relatedRecordCount,
      deletedAt: deleteTime,
      logStored
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

module.exports = new DeviceService()

