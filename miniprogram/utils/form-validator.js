/**
 * 压力表检定记录表单验证工具
 */

const { formatDate } = require('./helpers/date')

/**
 * 验证规则定义
 */
const VALIDATION_RULES = {
  factoryNo: {
    required: true,
    message: '请填写出厂编号'
  },
  verificationDate: {
    required: true,
    message: '请选择检定日期'
  },
  district: {
    required: true,
    message: '请选择所在辖区'
  },
  certNo: {
    required: false,
    message: '证书编号格式不正确'
  },
  instrumentName: {
    required: false,
    message: '计量器具名称格式不正确'
  },
  conclusion: {
    required: false,
    message: '请选择检定结论'
  }
}

/**
 * 验证检定记录表单
 * @param {Object} formData 表单数据
 * @returns {Object} 验证结果 { valid: boolean, errors: Array }
 */
function validateRecordForm(formData) {
  const errors = []

  if (!formData.factoryNo || !formData.factoryNo.trim()) {
    errors.push(VALIDATION_RULES.factoryNo.message)
  }

  if (!formData.verificationDate) {
    errors.push(VALIDATION_RULES.verificationDate.message)
  }

  if (!formData.district) {
    errors.push(VALIDATION_RULES.district.message)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 验证图片上传
 * @param {string} imagePath 图片路径
 * @param {string} installPhotoPath 安装照片路径
 * @param {string} mode 模式 'ocr' 或 'manual'
 * @returns {Object} 验证结果
 */
function validateImageUpload(imagePath, installPhotoPath, mode, gaugeStatus) {
  const errors = []

  if (mode === 'manual' && !imagePath) {
    errors.push('请上传检定表图片')
  }

  if (gaugeStatus === '在用' && !installPhotoPath) {
    errors.push('压力表状态为“在用”时必须上传安装照片')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 验证用户登录状态
 * @param {Object} enterpriseUser 企业用户信息
 * @returns {Object} 验证结果
 */
function validateUserLogin(enterpriseUser) {
  if (!enterpriseUser || !enterpriseUser.companyName) {
    return {
      valid: false,
      error: '请先登录'
    }
  }
  return { valid: true }
}

/**
 * 验证设备信息
 * @param {Object} newDevice 新设备信息
 * @returns {Object} 验证结果
 */
function validateDevice(newDevice) {
  const errors = []

  if (!newDevice.deviceName || !newDevice.deviceName.trim()) {
    errors.push('请输入设备名称')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 验证日期有效性
 * @param {string} dateStr 日期字符串
 * @returns {boolean} 是否有效
 */
function isValidDate(dateStr) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

/**
 * 验证日期范围（检定日期不能晚于今天）
 * @param {string} verificationDate 检定日期
 * @returns {Object} 验证结果
 */
function validateDateRange(verificationDate) {
  const today = formatDate(new Date())
  
  if (verificationDate > today) {
    return {
      valid: false,
      error: '检定日期不能晚于今天'
    }
  }
  
  return { valid: true }
}

module.exports = {
  validateRecordForm,
  validateImageUpload,
  validateUserLogin,
  validateDevice,
  isValidDate,
  validateDateRange,
  VALIDATION_RULES
}
