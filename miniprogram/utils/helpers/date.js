/**
 * 日期工具函数
 */

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date|string} date 日期对象或字符串
 * @returns {string} 格式化后的日期
 */
function formatDate(date) {
  if (typeof date === 'string') date = new Date(date)
  if (!(date instanceof Date) || isNaN(date)) return ''
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm:ss
 * @param {Date|string} date 日期对象或字符串
 * @returns {string} 格式化后的日期时间
 */
function formatDateTime(date) {
  if (typeof date === 'string') date = new Date(date)
  if (!(date instanceof Date) || isNaN(date)) return ''
  
  const dateStr = formatDate(date)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${dateStr} ${hours}:${minutes}:${seconds}`
}

/**
 * 计算到期日期（默认6个月后）
 * @param {string} verifyDate 检定日期 YYYY-MM-DD
 * @param {number} months 月数，默认6
 * @returns {string} 到期日期 YYYY-MM-DD
 */
function calculateExpiryDate(verifyDate, months = 6) {
  const date = new Date(verifyDate)
  if (isNaN(date)) return ''
  
  date.setMonth(date.getMonth() + months)
  return formatDate(date)
}

/**
 * 检查日期是否过期
 * @param {string} expiryDate 到期日期 YYYY-MM-DD
 * @returns {boolean} 是否已过期
 */
function isExpired(expiryDate) {
  const today = formatDate(new Date())
  return expiryDate < today
}

/**
 * 检查日期是否即将到期
 * @param {string} expiryDate 到期日期 YYYY-MM-DD
 * @param {number} days 提前天数，默认30
 * @returns {boolean} 是否即将到期
 */
function isExpiringSoon(expiryDate, days = 30) {
  const today = new Date()
  const expiry = new Date(expiryDate)
  const diffTime = expiry - today
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays >= 0 && diffDays <= days
}

/**
 * 获取日期范围
 * @param {number} days 天数
 * @returns {Object} 开始日期和结束日期
 */
function getDateRange(days) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return {
    start: formatDate(start),
    end: formatDate(end)
  }
}

module.exports = {
  formatDate,
  formatDateTime,
  calculateExpiryDate,
  isExpired,
  isExpiringSoon,
  getDateRange
}
