/**
 * 表单验证工具
 */

const { REGEX } = require('../../constants/index')

/**
 * 验证手机号
 * @param {string} phone 手机号
 * @returns {boolean} 是否有效
 */
function isValidPhone(phone) {
  return REGEX.PHONE.test(phone)
}

/**
 * 验证统一社会信用代码
 * @param {string} code 信用代码
 * @returns {boolean} 是否有效
 */
function isValidCreditCode(code) {
  if (!code) return false
  return REGEX.CREDIT_CODE.test(code.toUpperCase())
}

/**
 * 验证日期格式
 * @param {string} date 日期字符串
 * @returns {boolean} 是否有效
 */
function isValidDate(date) {
  return REGEX.DATE.test(date)
}

/**
 * 验证企业名称
 * @param {string} name 企业名称
 * @returns {boolean} 是否有效
 */
function isValidCompanyName(name) {
  return name && name.trim().length >= 2
}

/**
 * 验证必填字段
 * @param {*} value 字段值
 * @returns {boolean} 是否有效
 */
function isRequired(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

/**
 * 验证出厂编号
 * @param {string} factoryNo 出厂编号
 * @returns {boolean} 是否有效
 */
function isValidFactoryNo(factoryNo) {
  return factoryNo && factoryNo.trim().length > 0
}

/**
 * 表单验证器
 * @param {Object} data 表单数据
 * @param {Object} rules 验证规则
 * @returns {Object} 验证结果 { valid: boolean, errors: Object }
 */
function validate(data, rules) {
  const errors = {}
  let valid = true

  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field]
    const fieldErrors = []

    // 必填验证
    if (rule.required && !isRequired(value)) {
      fieldErrors.push(rule.message || `${field}不能为空`)
    }

    // 类型验证
    if (value && rule.type) {
      switch (rule.type) {
        case 'phone':
          if (!isValidPhone(value)) fieldErrors.push('手机号格式不正确')
          break
        case 'creditCode':
          if (!isValidCreditCode(value)) fieldErrors.push('信用代码格式不正确')
          break
        case 'date':
          if (!isValidDate(value)) fieldErrors.push('日期格式不正确')
          break
        case 'companyName':
          if (!isValidCompanyName(value)) fieldErrors.push('企业名称格式不正确')
          break
      }
    }

    // 自定义验证
    if (value && rule.validator && typeof rule.validator === 'function') {
      const result = rule.validator(value, data)
      if (result !== true) {
        fieldErrors.push(result || '验证失败')
      }
    }

    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors
      valid = false
    }
  }

  return { valid, errors }
}

module.exports = {
  isValidPhone,
  isValidCreditCode,
  isValidDate,
  isValidCompanyName,
  isRequired,
  isValidFactoryNo,
  validate
}
