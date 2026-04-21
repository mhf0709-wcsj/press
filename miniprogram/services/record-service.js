/**
 * 璁板綍淇濆瓨鏈嶅姟妯″潡
 * 璐熻矗妫€瀹氳褰曠殑淇濆瓨鍜岀鐞? */

const db = wx.cloud.database()
const { formatDate, formatDateTime } = require('../utils/helpers/date')

/**
 * 璁板綍淇濆瓨鏈嶅姟绫? */
class RecordService {
  /**
   * 淇濆瓨妫€瀹氳褰?   * @param {Object} recordData 璁板綍鏁版嵁
   * @param {Object} options 閫夐」
   * @returns {Promise<Object>} 淇濆瓨缁撴灉
   */
  async saveRecord(recordData, options = {}) {
    const { imagePath, installPhotoPath, fromAdmin, enterpriseUser, selectedDeviceId } = options
    if (!selectedDeviceId) {
      throw new Error('蹇呴』閫夋嫨鍘嬪姏琛紙涓斿繀椤诲叧鑱旇澶囷級')
    }

    const verifyDate = new Date(recordData.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1)

    const deviceRes = await db.collection('devices').doc(selectedDeviceId).get()
    const device = deviceRes.data
    if (!device) {
      throw new Error('\u6240\u9009\u538b\u529b\u8868\u4e0d\u5b58\u5728')
    }
    if (!device.equipmentId) {
      throw new Error('鎵€閫夊帇鍔涜〃鏈叧鑱旇澶囷紝璇峰厛鍦ㄨ澶囧簱缁戝畾')
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
      console.error('淇濆瓨璁板綍澶辫触:', err)
      throw err
    }
  }

  /**
   * 涓婁紶瀹夎鐓х墖
   * @param {string} filePath 鏂囦欢璺緞
   * @param {string} factoryNo 鍑哄巶缂栧彿
   * @returns {Promise<string>} 鏂囦欢ID
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
   * 涓婁紶璇佷功鍥剧墖
   * @param {string} filePath 鏂囦欢璺緞
   * @param {string} factoryNo 鍑哄巶缂栧彿
   * @returns {Promise<string>} 鏂囦欢ID
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
   * 淇濆瓨鍒版暟鎹簱
   * @param {Object} data 鏁版嵁
   * @returns {Promise<Object>} 淇濆瓨缁撴灉
   */
  async saveToDB(data) {
    try {
      const res = await db.collection('pressure_records').add({ data })
      
      return {
        _id: res._id,
        success: true
      }
    } catch (err) {
      console.error('鉁?淇濆瓨澶辫触:', err)
      throw err
    }
  }

  /**
   * 鑾峰彇璁板綍鍒楄〃
   * @param {Object} options 鏌ヨ閫夐」
   * @returns {Promise<Array>} 璁板綍鍒楄〃
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
      console.error('鑾峰彇璁板綍澶辫触:', err)
      throw err
    }
  }

  /**
   * 鑾峰彇璁板綍璇︽儏
   * @param {string} recordId 璁板綍ID
   * @returns {Promise<Object>} 璁板綍璇︽儏
   */
  async getRecordById(recordId) {
    try {
      const res = await db.collection('pressure_records').doc(recordId).get()
      return res.data
    } catch (err) {
      console.error('鑾峰彇璁板綍璇︽儏澶辫触:', err)
      throw err
    }
  }

  /**
   * 鏇存柊璁板綍
   * @param {string} recordId 璁板綍ID
   * @param {Object} data 鏇存柊鏁版嵁
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
      console.error('鏇存柊璁板綍澶辫触:', err)
      throw err
    }
  }

  /**
   * 鍒犻櫎璁板綍
   * @param {string} recordId 璁板綍ID
   * @returns {Promise<void>}
   */
  async deleteRecord(recordId) {
    try {
      await db.collection('pressure_records').doc(recordId).remove()
    } catch (err) {
      console.error('鍒犻櫎璁板綍澶辫触:', err)
      throw err
    }
  }

  /**
   * 鎼滅储璁板綍
   * @param {string} keyword 鍏抽敭璇?   * @param {Object} options 閫夐」
   * @returns {Promise<Array>} 鎼滅储缁撴灉
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
      console.error('鎼滅储璁板綍澶辫触:', err)
      throw err
    }
  }
}

module.exports = new RecordService()


