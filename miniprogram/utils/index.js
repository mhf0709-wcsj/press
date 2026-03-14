/**
 * 工具函数入口
 * 统一导出所有工具函数
 */

const date = require('./helpers/date')
const validator = require('./helpers/validator')
const storage = require('./helpers/storage')

module.exports = {
  date,
  validator,
  storage
}
