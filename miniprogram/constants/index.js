/**
 * 全局常量配置
 * 生产环境配置
 */

// 云开发环境配置
const CLOUD_CONFIG = {
  ENV: 'cloud1-3gxphq02b0e0bee4',
  TRACE_USER: true
}

// 存储键名
const STORAGE_KEYS = {
  ENTERPRISE_USER: 'enterpriseUser',
  ADMIN_USER: 'adminUser',
  LAST_REMINDER_DATE: 'lastReminderDate',
  APP_CONFIG: 'appConfig'
}

// 页面路由
const ROUTES = {
  LOGIN: '/pages/login/login',
  REGISTER: '/pages/register/register',
  ADMIN_LOGIN: '/pages/admin-login/admin-login',
  AI_ASSISTANT: '/pages/ai-assistant/ai-assistant',
  DEVICE_CENTER: '/pages/workbench/workbench',
  WORKBENCH: '/pages/workbench/workbench',
  CAMERA: '/pages/ai-assistant/ai-assistant',
  ARCHIVE: '/pages/archive/archive',
  USER: '/pages/user/user',
  DASHBOARD: '/pages/dashboard/dashboard',
  ADMIN: '/pages/admin/admin',
  DETAIL: '/pages/detail/detail'
}

// 辖区列表
const DISTRICTS = [
  '大峃所', '珊溪所', '巨屿所', '峃口所', 
  '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所'
]

// 检定结论选项
const CONCLUSIONS = ['合格', '不合格']

// 默认检定标准
const DEFAULT_STD = 'JJG52-2013'

// 图片质量阈值
const QUALITY_THRESHOLD = {
  EXCELLENT: 0.7,
  GOOD: 0.5,
  MIN_SIZE: 20 * 1024 // 20KB
}

// 到期提醒天数
const EXPIRY_DAYS = 30

// 分页配置
const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100
}

// 正则表达式
const REGEX = {
  PHONE: /^1[3-9]\d{9}$/,
  CREDIT_CODE: /^[A-Z0-9]{18}$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/
}

const SUBSCRIBE_TEMPLATE_IDS = {
  DEVICE_EXPIRY: ''
}

module.exports = {
  CLOUD_CONFIG,
  STORAGE_KEYS,
  ROUTES,
  DISTRICTS,
  CONCLUSIONS,
  DEFAULT_STD,
  QUALITY_THRESHOLD,
  EXPIRY_DAYS,
  PAGINATION,
  REGEX,
  SUBSCRIBE_TEMPLATE_IDS
}
