const { formatDate } = require('./helpers/date')

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
    message: '仪表名称格式不正确'
  },
  conclusion: {
    required: false,
    message: '请选择检定结论'
  }
}

function validateRecordForm(formData) {
  const errors = []

  if (!formData.factoryNo || !String(formData.factoryNo).trim()) {
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

function validateImageUpload(imagePath, installPhotoPath, mode, gaugeStatus) {
  const errors = []

  if (mode === 'manual' && !imagePath) {
    errors.push('请上传检定证书照片')
  }

  if (gaugeStatus === '在用' && !installPhotoPath) {
    errors.push('压力表状态为“在用”时必须上传安装照片')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

function validateUserLogin(enterpriseUser) {
  if (!enterpriseUser || !enterpriseUser.companyName) {
    return {
      valid: false,
      error: '请先登录'
    }
  }

  return { valid: true }
}

function validateDevice(newDevice) {
  const errors = []

  if (!newDevice.deviceName || !String(newDevice.deviceName).trim()) {
    errors.push('请输入设备名称')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

function isValidDate(dateStr) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

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
