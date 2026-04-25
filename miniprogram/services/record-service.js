const db = wx.cloud.database()
const _ = db.command
const { formatDate, formatDateTime } = require('../utils/helpers/date')

class RecordService {
  async saveRecord(recordData, options = {}) {
    const { imagePath, installPhotoPath, fromAdmin, enterpriseUser, selectedDeviceId } = options
    if (!selectedDeviceId) {
      throw new Error('请选择所属压力表')
    }

    const verifyDate = new Date(recordData.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1)

    const deviceRes = await db.collection('devices').doc(selectedDeviceId).get()
    const device = deviceRes.data
    if (!device) {
      throw new Error('所选压力表不存在')
    }
    if (device.isDeleted) {
      throw new Error('所选压力表已删除，请重新选择')
    }
    if (!device.equipmentId) {
      throw new Error('所选压力表未绑定设备，请先在设备中心完成绑定')
    }

    await this.syncEquipmentDistrict(device.equipmentId, recordData.district)

    const mainData = {
      ...recordData,
      expiryDate: formatDate(expiryDate),
      status: 'valid',
      isDeleted: false,
      deletedAt: '',
      deletedBy: '',
      createTime: formatDateTime(new Date()),
      updateTime: formatDateTime(new Date()),
      ocrSource: recordData.ocrSource || 'manual',
      hasImage: !!imagePath,
      hasInstallPhoto: !!installPhotoPath,
      enterpriseId: enterpriseUser._id || enterpriseUser.companyName,
      enterpriseName: enterpriseUser.companyName,
      enterprisePhone: enterpriseUser.phone || '',
      enterpriseLegalPerson: enterpriseUser.legalPerson || '',
      createdBy: fromAdmin ? 'admin' : 'enterprise',
      equipmentId: device.equipmentId || '',
      equipmentName: device.equipmentName || '',
      deviceId: selectedDeviceId,
      deviceName: device.deviceName || recordData.deviceName || '',
      deviceNo: device.deviceNo || recordData.deviceNo || '',
      deviceStatus: device.status || '在用'
    }

    if (installPhotoPath) {
      mainData.installPhotoFileID = await this.uploadInstallPhoto(installPhotoPath, recordData.factoryNo)
    }
    if (imagePath) {
      mainData.fileID = await this.uploadCertificateImage(imagePath, recordData.factoryNo)
    }

    return await this.saveToDB(mainData)
  }

  async syncEquipmentDistrict(equipmentId, district) {
    if (!equipmentId || !district) return
    try {
      const eqRes = await db.collection('equipments').doc(equipmentId).field({ district: true }).get()
      const eq = eqRes.data
      if (eq && !eq.district) {
        await db.collection('equipments').doc(equipmentId).update({
          data: { district }
        })
      }
    } catch (error) {}
  }

  async uploadInstallPhoto(filePath, factoryNo) {
    const cloudPath = `install-photos/${factoryNo}_${Date.now()}.jpg`
    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (res) => resolve(res.fileID),
        fail: reject
      })
    })
  }

  async uploadCertificateImage(filePath, factoryNo) {
    const cloudPath = `pressure-certificates/${factoryNo}_${Date.now()}.jpg`
    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (res) => resolve(res.fileID),
        fail: reject
      })
    })
  }

  async saveToDB(data) {
    const res = await db.collection('pressure_records').add({ data })
    return {
      _id: res._id,
      success: true
    }
  }

  async getRecords(options = {}) {
    const { enterpriseName, district, status, limit = 100 } = options
    const whereCondition = {
      isDeleted: _.neq(true)
    }

    if (enterpriseName) whereCondition.enterpriseName = enterpriseName
    if (district) whereCondition.district = district
    if (status) whereCondition.status = status

    const res = await db.collection('pressure_records')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()

    return res.data || []
  }

  async getRecordById(recordId) {
    const res = await db.collection('pressure_records').doc(recordId).get()
    return res.data
  }

  async updateRecord(recordId, data) {
    await db.collection('pressure_records').doc(recordId).update({
      data: {
        ...data,
        updateTime: formatDateTime(new Date())
      }
    })
  }

  async deleteRecord(recordId, options = {}) {
    const recordRes = await db.collection('pressure_records').doc(recordId).get()
    const record = recordRes.data
    if (!record) throw new Error('记录不存在')

    const deleteTime = formatDateTime(new Date())
    const deletedBy = options.deletedBy || record.enterpriseName || '企业用户'

    await db.collection('pressure_records').doc(recordId).update({
      data: {
        isDeleted: true,
        deletedAt: deleteTime,
        deletedBy,
        updateTime: deleteTime
      }
    })

    try {
      await db.collection('deletion_logs').add({
        data: {
          entityType: 'pressure_record',
          entityId: recordId,
          entityName: record.factoryNo || record.certNo || '检定记录',
          enterpriseName: record.enterpriseName || deletedBy,
          district: record.district || '',
          equipmentId: record.equipmentId || '',
          equipmentName: record.equipmentName || '',
          factoryNo: record.factoryNo || '',
          deviceNo: record.deviceNo || '',
          certNo: record.certNo || '',
          deletedAt: deleteTime,
          deletedBy,
          deletedById: options.deletedById || '',
          snapshot: record,
          createTime: deleteTime
        }
      })
    } catch (error) {}
  }

  async searchRecords(keyword, options = {}) {
    const { enterpriseName, limit = 50 } = options
    if (!keyword || !keyword.trim()) {
      return this.getRecords(options)
    }

    const whereCondition = {
      isDeleted: _.neq(true),
      factoryNo: db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    }
    if (enterpriseName) whereCondition.enterpriseName = enterpriseName

    const res = await db.collection('pressure_records')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()

    return res.data || []
  }
}

module.exports = new RecordService()
