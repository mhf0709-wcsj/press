const CLOUD_CONFIG = {
  ENV: 'cloud1-3gxphq02b0e0bee4',
  TRACE_USER: true
}

const STORAGE_KEYS = {
  ENTERPRISE_USER: 'enterpriseUser',
  ADMIN_USER: 'adminUser',
  LAST_REMINDER_DATE: 'lastReminderDate',
  APP_CONFIG: 'appConfig'
}

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

const DISTRICTS = [
  '\u5927\u5cc3\u6240',
  '\u73ca\u6eaa\u6240',
  '\u5de8\u5c7f\u6240',
  '\u5cc3\u53e3\u6240',
  '\u9ec4\u5766\u6240',
  '\u897f\u5751\u6240',
  '\u7389\u58f6\u6240',
  '\u5357\u7530\u6240',
  '\u767e\u4e08\u6f08\u6240'
]

const CONCLUSIONS = ['\u5408\u683c', '\u4e0d\u5408\u683c']

const DEFAULT_STD = 'JJG52-2013'

const QUALITY_THRESHOLD = {
  EXCELLENT: 0.7,
  GOOD: 0.5,
  MIN_SIZE: 20 * 1024
}

const EXPIRY_DAYS = 30

const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100
}

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
