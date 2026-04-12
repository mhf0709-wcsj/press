/**
 * 表单验证工具
 * 提供统一的表单验证规则和验证方法
 */

const Validator = {
  // 验证规则集合
  rules: {
    // 必填
    required: (value, message = '此项为必填项') => {
      if (value === undefined || value === null || value === '') {
        return message
      }
      return true
    },

    // 最小长度
    minLength: (value, length, message) => {
      message = message || `长度不能少于${length}个字符`
      if (!value || value.length < length) {
        return message
      }
      return true
    },

    // 最大长度
    maxLength: (value, length, message) => {
      message = message || `长度不能超过${length}个字符`
      if (value && value.length > length) {
        return message
      }
      return true
    },

    // 证书编号格式
    certNo: (value, message = '证书编号格式不正确') => {
      if (!value) return true
      const pattern = /^[A-Za-z0-9-_]+$/
      if (!pattern.test(value)) {
        return message
      }
      return true
    },

    // 出厂编号格式
    factoryNo: (value, message = '出厂编号格式不正确') => {
      if (!value) return true
      const pattern = /^[A-Za-z0-9-_]+$/
      if (!pattern.test(value)) {
        return message
      }
      return true
    },

    // 日期格式
    date: (value, message = '日期格式不正确') => {
      if (!value) return true
      const date = new Date(value)
      if (isNaN(date.getTime())) {
        return message
      }
      return true
    },

    // 日期范围 - 不能是未来日期
    dateNotFuture: (value, message = '日期不能是未来日期') => {
      if (!value) return true
      const date = new Date(value)
      const now = new Date()
      if (date > now) {
        return message
      }
      return true
    },

    // 手机号
    phone: (value, message = '手机号格式不正确') => {
      if (!value) return true
      const pattern = /^1[3-9]\d{9}$/
      if (!pattern.test(value)) {
        return message
      }
      return true
    },

    // 邮箱
    email: (value, message = '邮箱格式不正确') => {
      if (!value) return true
      const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!pattern.test(value)) {
        return message
      }
      return true
    },

    // 数字
    numeric: (value, message = '必须为数字') => {
      if (!value) return true
      if (isNaN(Number(value))) {
        return message
      }
      return true
    },

    // 整数
    integer: (value, message = '必须为整数') => {
      if (!value) return true
      if (!/^-?\d+$/.test(value)) {
        return message
      }
      return true
    },

    // 正数
    positive: (value, message = '必须为正数') => {
      if (!value) return true
      if (Number(value) <= 0) {
        return message
      }
      return true
    },

    // 范围
    range: (value, min, max, message) => {
      message = message || `必须在${min}到${max}之间`
      if (!value) return true
      const num = Number(value)
      if (num < min || num > max) {
        return message
      }
      return true
    },

    // 自定义正则
    pattern: (value, regex, message = '格式不正确') => {
      if (!value) return true
      if (!regex.test(value)) {
        return message
      }
      return true
    }
  },

  /**
   * 验证单个字段
   * @param {*} value - 字段值
   * @param {Array} rules - 验证规则数组
   * @returns {Object} { valid: boolean, message: string }
   */
  validateField(value, rules) {
    for (const rule of rules) {
      let result
      
      if (typeof rule === 'string') {
        // 简写形式，如 'required'
        result = this.rules[rule](value)
      } else if (typeof rule === 'function') {
        // 自定义验证函数
        result = rule(value)
      } else if (typeof rule === 'object') {
        // 对象形式 { type: 'minLength', params: [5], message: '...' }
        const { type, params = [], message } = rule
        const validator = this.rules[type]
        if (validator) {
          result = validator(value, ...params, message)
        }
      }
      
      if (result !== true) {
        return {
          valid: false,
          message: result
        }
      }
    }
    
    return {
      valid: true,
      message: ''
    }
  },

  /**
   * 验证整个表单
   * @param {Object} formData - 表单数据对象
   * @param {Object} schema - 验证规则配置
   * @returns {Object} { valid: boolean, errors: Object, firstError: string }
   */
  validate(formData, schema) {
    const errors = {}
    let firstError = ''
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = formData[field]
      const result = this.validateField(value, rules)
      
      if (!result.valid) {
        errors[field] = result.message
        if (!firstError) {
          firstError = result.message
        }
      }
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors,
      firstError
    }
  },

  /**
   * 创建验证规则快捷方法
   */
  required(message) {
    return { type: 'required', message }
  },

  minLength(length, message) {
    return { type: 'minLength', params: [length], message }
  },

  maxLength(length, message) {
    return { type: 'maxLength', params: [length], message }
  },

  certNo(message) {
    return { type: 'certNo', message }
  },

  factoryNo(message) {
    return { type: 'factoryNo', message }
  },

  date(message) {
    return { type: 'date', message }
  },

  phone(message) {
    return { type: 'phone', message }
  },

  email(message) {
    return { type: 'email', message }
  }
}

// 压力表检定专用验证配置
const PressureGaugeSchema = {
  certNo: [
    Validator.required('请输入证书编号'),
    Validator.certNo('证书编号格式不正确')
  ],
  factoryNo: [
    Validator.required('请输入出厂编号'),
    Validator.factoryNo('出厂编号格式不正确')
  ],
  sendUnit: [
    Validator.maxLength(100, '送检单位名称过长')
  ],
  instrumentName: [
    Validator.maxLength(50, '器具名称过长')
  ],
  modelSpec: [
    Validator.maxLength(100, '型号规格过长')
  ],
  manufacturer: [
    Validator.maxLength(100, '制造单位名称过长')
  ],
  verificationStd: [
    Validator.maxLength(50, '检定依据过长')
  ],
  conclusion: [
    Validator.required('请选择检定结论')
  ],
  verificationDate: [
    Validator.required('请选择检定日期'),
    Validator.date('日期格式不正确'),
    Validator.dateNotFuture('检定日期不能是未来日期')
  ],
  district: [
    Validator.required('请选择所在辖区')
  ]
}

module.exports = {
  Validator,
  PressureGaugeSchema
}
