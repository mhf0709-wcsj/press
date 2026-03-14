/**
 * API 服务层
 * 统一封装云函数调用和数据库操作
 */

const db = wx.cloud.database()
const _ = db.command

/**
 * 通用错误处理
 * @param {Error} err 错误对象
 * @param {string} operation 操作名称
 */
function handleError(err, operation) {
  console.error(`[${operation}] 失败:`, err)
  return {
    success: false,
    error: err.message || '操作失败',
    code: err.errCode || -1
  }
}

/**
 * 调用云函数
 * @param {string} name 云函数名称
 * @param {Object} data 参数
 * @returns {Promise<Object>} 结果
 */
function callFunction(name, data = {}) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        resolve(res.result || { success: true, data: res.result })
      },
      fail: (err) => {
        resolve(handleError(err, `云函数[${name}]`))
      }
    })
  })
}

// ==================== 企业相关 API ====================

const enterpriseAPI = {
  /**
   * 企业登录
   * @param {string} companyName 企业名称
   * @param {string} phone 手机号
   */
  login(companyName, phone) {
    return db.collection('enterprises')
      .where({ companyName, phone })
      .get()
      .then(res => ({
        success: res.data.length > 0,
        data: res.data[0] || null,
        message: res.data.length > 0 ? '' : '企业信息不存在'
      }))
      .catch(err => handleError(err, '企业登录'))
  },

  /**
   * 企业注册
   * @param {Object} data 注册信息
   */
  register(data) {
    return db.collection('enterprises').add({
      data: {
        ...data,
        createTime: new Date(),
        updateTime: new Date()
      }
    })
    .then(() => ({ success: true }))
    .catch(err => handleError(err, '企业注册'))
  },

  /**
   * 检查企业是否存在
   * @param {string} companyName 企业名称
   */
  exists(companyName) {
    return db.collection('enterprises')
      .where({ companyName })
      .count()
      .then(res => ({ success: true, exists: res.total > 0 }))
      .catch(err => handleError(err, '检查企业存在'))
  }
}

// ==================== 压力表记录 API ====================

const recordAPI = {
  /**
   * 创建记录
   * @param {Object} data 记录数据
   */
  create(data) {
    return db.collection('pressure_records').add({
      data: {
        ...data,
        createTime: new Date(),
        updateTime: new Date()
      }
    })
    .then(res => ({ success: true, id: res._id }))
    .catch(err => handleError(err, '创建记录'))
  },

  /**
   * 查询记录列表
   * @param {Object} options 查询选项
   */
  list(options = {}) {
    const { 
      enterpriseName, 
      district, 
      keyword, 
      page = 1, 
      pageSize = 20,
      orderBy = 'createTime',
      order = 'desc'
    } = options

    let query = db.collection('pressure_records')

    // 构建查询条件
    if (enterpriseName) {
      query = query.where({ enterpriseName })
    }
    if (district && district !== '全部') {
      query = query.where({ district })
    }
    if (keyword) {
      query = query.where(_.or([
        { factoryNo: db.RegExp({ regexp: keyword, options: 'i' }) },
        { certNo: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]))
    }

    return query
      .orderBy(orderBy, order)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
      .then(res => ({ success: true, data: res.data }))
      .catch(err => handleError(err, '查询记录'))
  },

  /**
   * 获取记录详情
   * @param {string} id 记录ID
   */
  getById(id) {
    return db.collection('pressure_records').doc(id).get()
      .then(res => ({ success: true, data: res.data }))
      .catch(err => handleError(err, '获取记录详情'))
  },

  /**
   * 更新记录
   * @param {string} id 记录ID
   * @param {Object} data 更新数据
   */
  update(id, data) {
    return db.collection('pressure_records').doc(id).update({
      data: {
        ...data,
        updateTime: new Date()
      }
    })
    .then(() => ({ success: true }))
    .catch(err => handleError(err, '更新记录'))
  },

  /**
   * 删除记录
   * @param {string} id 记录ID
   */
  delete(id) {
    return db.collection('pressure_records').doc(id).remove()
      .then(() => ({ success: true }))
      .catch(err => handleError(err, '删除记录'))
  }
}

// ==================== 到期提醒 API ====================

const expiryAPI = {
  /**
   * 获取到期提醒汇总
   * @param {number} days 提前天数
   */
  getSummary(days = 30) {
    return callFunction('expiryReminder', {
      action: 'getExpiringSummary',
      days
    })
  },

  /**
   * 获取企业到期记录
   * @param {string} enterpriseName 企业名称
   * @param {number} days 提前天数
   */
  getByEnterprise(enterpriseName, days = 30) {
    return callFunction('expiryReminder', {
      action: 'getEnterpriseExpiring',
      enterpriseName,
      days
    })
  }
}

// ==================== 文件上传 API ====================

const fileAPI = {
  /**
   * 上传图片
   * @param {string} filePath 本地文件路径
   * @param {string} cloudPath 云存储路径
   */
  upload(filePath, cloudPath) {
    return wx.cloud.uploadFile({
      cloudPath,
      filePath
    })
    .then(res => ({ success: true, fileID: res.fileID }))
    .catch(err => handleError(err, '上传文件'))
  },

  /**
   * 删除文件
   * @param {string} fileID 文件ID
   */
  delete(fileID) {
    return wx.cloud.deleteFile({ fileList: [fileID] })
      .then(() => ({ success: true }))
      .catch(err => handleError(err, '删除文件'))
  }
}

// ==================== OCR API ====================

const ocrAPI = {
  /**
   * 识别图片
   * @param {string} fileID 云文件ID
   */
  recognize(fileID) {
    return callFunction('baiduOcr', { fileID })
  }
}

module.exports = {
  enterprise: enterpriseAPI,
  record: recordAPI,
  expiry: expiryAPI,
  file: fileAPI,
  ocr: ocrAPI,
  callFunction
}
