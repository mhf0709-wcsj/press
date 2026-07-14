const dataAccess = require('./data-access-service')
const equipmentService = require('./equipment-service')
const { formatDate } = require('../utils/helpers/date')
const { markLedgerChanged } = require('../utils/data-change')

class RecordService {
  async saveRecord(recordData, options = {}) {
    const { imagePath, installPhotoPath, fromAdmin, enterpriseUser, selectedDeviceId } = options
    if (!selectedDeviceId) throw new Error('请选择所属压力表')

    const verifyDate = new Date(recordData.verificationDate)
    if (Number.isNaN(verifyDate.getTime())) throw new Error('检定日期格式不正确')
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1)

    const device = await dataAccess.get('devices', selectedDeviceId)
    if (!device || device.isDeleted) throw new Error('所选压力表不存在或已删除')
    if (!device.equipmentId) throw new Error('所选压力表未绑定设备，请先在设备中心完成绑定')

    await this.syncEquipmentDistrict(device.equipmentId, recordData.district)
    const mainData = {
      ...recordData,
      expiryDate: formatDate(expiryDate),
      status: 'valid',
      ocrSource: recordData.ocrSource || 'manual',
      hasImage: !!imagePath,
      hasInstallPhoto: !!installPhotoPath,
      enterpriseName: enterpriseUser?.companyName || recordData.enterpriseName || '',
      createdBy: fromAdmin ? 'admin' : 'enterprise',
      equipmentId: device.equipmentId,
      equipmentName: device.equipmentName || '',
      deviceId: selectedDeviceId,
      deviceName: device.deviceName || recordData.deviceName || '',
      deviceNo: device.deviceNo || recordData.deviceNo || '',
      deviceStatus: device.status || '在用'
    }

    if (installPhotoPath) mainData.installPhotoFileID = await this.uploadInstallPhoto(installPhotoPath, recordData.factoryNo)
    if (imagePath) mainData.fileID = await this.uploadCertificateImage(imagePath, recordData.factoryNo)
    return this.saveToDB(mainData)
  }

  async syncEquipmentDistrict(equipmentId, district) {
    if (!equipmentId || !district) return
    try {
      const equipment = await equipmentService.getEquipmentById(equipmentId)
      if (equipment && !equipment.district) await equipmentService.updateEquipment(equipmentId, { district })
    } catch (error) {}
  }

  async uploadInstallPhoto(filePath, factoryNo) {
    return uploadFile(`install-photos/${safeName(factoryNo)}_${Date.now()}.jpg`, filePath)
  }

  async uploadCertificateImage(filePath, factoryNo) {
    return uploadFile(`pressure-certificates/${safeName(factoryNo)}_${Date.now()}.jpg`, filePath)
  }

  async saveToDB(data) {
    const saved = await dataAccess.create('pressure_records', data)
    markLedgerChanged()
    return { ...saved, success: true }
  }

  async getRecords(options = {}) {
    const filters = { isDeleted: false }
    if (options.district) filters.district = options.district
    if (options.status) filters.status = options.status
    return dataAccess.list('pressure_records', {
      filters,
      orderBy: { field: 'createTime', direction: 'desc' },
      limit: Math.min(100, Number(options.limit || 100))
    })
  }

  async getRecordById(recordId) {
    return dataAccess.get('pressure_records', recordId)
  }

  async updateRecord(recordId, data) {
    await dataAccess.update('pressure_records', recordId, sanitizeUpdateData(data))
    markLedgerChanged()
  }

  async deleteRecord(recordId) {
    await dataAccess.softDelete('pressure_records', recordId)
    markLedgerChanged()
  }

  async syncDeviceRecordCount() {}

  async updateDeviceLatestSnapshot() {}

  async searchRecords(keyword, options = {}) {
    if (!keyword?.trim()) return this.getRecords(options)
    const filters = { isDeleted: false }
    if (options.district) filters.district = options.district
    return dataAccess.list('pressure_records', {
      filters,
      keyword,
      keywordFields: ['factoryNo', 'certNo', 'instrumentName', 'deviceName', 'deviceNo', 'equipmentName'],
      orderBy: { field: 'createTime', direction: 'desc' },
      limit: Math.min(100, Number(options.limit || 50))
    })
  }
}

function uploadFile(cloudPath, filePath) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({ cloudPath, filePath, success: (res) => resolve(res.fileID), fail: reject })
  })
}

function safeName(value) {
  return String(value || 'record').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
}

function sanitizeUpdateData(data = {}) {
  const result = {}
  Object.keys(data).forEach((key) => {
    if (!key.startsWith('_') && key !== 'createTime' && data[key] !== undefined) result[key] = data[key]
  })
  return result
}

module.exports = new RecordService()
