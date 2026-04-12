/**
 * 记录保存服务模块
 * 负责检定记录的保存和管理
 */

const db = wx.cloud.database()
const { formatDate, formatDateTime } = require('../utils/helpers/date')

/**
 * 记录保存服务类
 */
class RecordService {
  /**
   * 保存检定记录
   * @param {Object} recordData 记录数据
   * @param {Object} options 选项
   * @returns {Promise<Object>} 保存结果
   */
  async saveRecord(recordData, options = {}) {
    const { imagePath, installPhotoPath, fromAdmin, enterpriseUser, selectedDeviceId } = options
    if (!selectedDeviceId) {
      throw new Error('必须选择压力表（且必须关联设备）')
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
    if (!device.equipmentId) {
      throw new Error('所选压力表未关联设备，请先在设备库绑定')
    }

    if (recordData.district) {
      try {
        const eqRes = await db.collection('equipments').doc(device.equipmentId).field({ district: true }).get()
        const eq = eqRes.data
        if (eq && !eq.district) {
          await db.collection('equipments').doc(device.equipmentId).update({
            data: { district: recordData.district }
          })
        }
      } catch (e) {}
    }

    const mainData = {
      ...recordData,
      expiryDate: formatDate(expiryDate),
      status: 'valid',
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

    try {
      if (installPhotoPath) {
        const installPhotoFileID = await this.uploadInstallPhoto(installPhotoPath, recordData.factoryNo)
        mainData.installPhotoFileID = installPhotoFileID
      }

      if (imagePath) {
        const fileID = await this.uploadCertificateImage(imagePath, recordData.factoryNo)
        mainData.fileID = fileID
      }

      const result = await this.saveToDB(mainData)
      
      return result
    } catch (err) {
      console.error('保存记录失败:', err)
      throw err
    }
  }

  /**
   * 上传安装照片
   * @param {string} filePath 文件路径
   * @param {string} factoryNo 出厂编号
   * @returns {Promise<string>} 文件ID
   */
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

  /**
   * 上传证书图片
   * @param {string} filePath 文件路径
   * @param {string} factoryNo 出厂编号
   * @returns {Promise<string>} 文件ID
   */
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

  /**
   * 保存到数据库
   * @param {Object} data 数据
   * @returns {Promise<Object>} 保存结果
   */
  async saveToDB(data) {
    try {
      const res = await db.collection('pressure_records').add({ data })
      console.log('✓ 存档成功:', res._id)
      
      return {
        _id: res._id,
        success: true
      }
    } catch (err) {
      console.error('✗ 保存失败:', err)
      throw err
    }
  }

  /**
   * 获取记录列表
   * @param {Object} options 查询选项
   * @returns {Promise<Array>} 记录列表
   */
  async getRecords(options = {}) {
    const { enterpriseName, district, status, limit = 100 } = options
    
    let whereCondition = {}
    
    if (enterpriseName) {
      whereCondition.enterpriseName = enterpriseName
    }
    
    if (district) {
      whereCondition.district = district
    }
    
    if (status) {
      whereCondition.status = status
    }

    try {
      const res = await db.collection('pressure_records')
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .limit(limit)
        .get()
      
      return res.data
    } catch (err) {
      console.error('获取记录失败:', err)
      throw err
    }
  }

  /**
   * 获取记录详情
   * @param {string} recordId 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getRecordById(recordId) {
    try {
      const res = await db.collection('pressure_records').doc(recordId).get()
      return res.data
    } catch (err) {
      console.error('获取记录详情失败:', err)
      throw err
    }
  }

  /**
   * 更新记录
   * @param {string} recordId 记录ID
   * @param {Object} data 更新数据
   * @returns {Promise<void>}
   */
  async updateRecord(recordId, data) {
    try {
      await db.collection('pressure_records').doc(recordId).update({
        data: {
          ...data,
          updateTime: formatDateTime(new Date())
        }
      })
    } catch (err) {
      console.error('更新记录失败:', err)
      throw err
    }
  }

  /**
   * 删除记录
   * @param {string} recordId 记录ID
   * @returns {Promise<void>}
   */
  async deleteRecord(recordId) {
    try {
      await db.collection('pressure_records').doc(recordId).remove()
    } catch (err) {
      console.error('删除记录失败:', err)
      throw err
    }
  }

  /**
   * 搜索记录
   * @param {string} keyword 关键词
   * @param {Object} options 选项
   * @returns {Promise<Array>} 搜索结果
   */
  async searchRecords(keyword, options = {}) {
    const { enterpriseName, limit = 50 } = options
    
    if (!keyword || !keyword.trim()) {
      return this.getRecords(options)
    }
    
    const _ = db.command
    
    let whereCondition = {
      factoryNo: db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    }
    
    if (enterpriseName) {
      whereCondition.enterpriseName = enterpriseName
    }

    try {
      const res = await db.collection('pressure_records')
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .limit(limit)
        .get()
      
      return res.data
    } catch (err) {
      console.error('搜索记录失败:', err)
      throw err
    }
  }
}

module.exports = new RecordService()
