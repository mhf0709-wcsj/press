const { CLOUD_CONFIG, ROUTES } = require('./constants/index.js')
const { storage } = require('./utils/index.js')
const { DISTRICTS } = require('./constants/index.js')
const { cache } = require('./utils/cache.js')
const { ErrorHandler } = require('./utils/error-handler.js')
const authService = require('./services/auth-service.js')

const debugLog = () => {}

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    systemInfo: null,
    isConnected: true,
    entryReminderToken: 0,
    entryReminderHandledToken: 0,
    ledgerVersion: 0
  },

  onLaunch() {
    debugLog('[App] launch')
    this.initCloud()
    this.getSystemInfo()
    this.watchNetworkStatus()
    this.preloadCriticalData()
    this.checkAuth()
  },

  onShow() {
    debugLog('[App] show')
    this.globalData.entryReminderToken = (this.globalData.entryReminderToken || 0) + 1
    this.globalData.entryReminderHandledToken = 0
  },

  onHide() {
    debugLog('[App] hide')
  },

  onError(msg) {
    console.error('[App] error:', msg)
    ErrorHandler.handle(msg, { showToast: false })
  },

  initCloud() {
    if (!wx.cloud) {
      console.error('[Cloud] unavailable')
      wx.showModal({
        title: '版本提示',
        content: '当前微信版本过低，请升级微信后重试。',
        showCancel: false
      })
      return
    }

    wx.cloud.init({
      env: CLOUD_CONFIG.ENV,
      traceUser: CLOUD_CONFIG.TRACE_USER
    })

    debugLog('[Cloud] init success')
  },

  getSystemInfo() {
    try {
      const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {}
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {}
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {}
      const res = { ...deviceInfo, ...windowInfo, ...appBaseInfo }
      this.globalData.systemInfo = res
      debugLog('[App] system:', res.model, res.system)
      cache.set('systemInfo', res, 24 * 60 * 60 * 1000)
    } catch (error) {
      console.error('[App] getSystemInfo failed:', error)
    }
  },

  watchNetworkStatus() {
    wx.onNetworkStatusChange((res) => {
      this.globalData.isConnected = res.isConnected

      if (!res.isConnected) {
        wx.showToast({
          title: '网络连接已断开',
          icon: 'none',
          duration: 2000
        })
      } else {
        debugLog('[Network] restored:', res.networkType)
      }
    })

    wx.getNetworkType({
      success: (res) => {
        this.globalData.isConnected = res.networkType !== 'none'
      }
    })
  },

  async preloadCriticalData() {
    debugLog('[App] preload config')

    try {
      const config = await this.fetchConfig()
      cache.set('appConfig', config, 10 * 60 * 1000)
    } catch (error) {
      console.warn('[App] preload config failed:', error)
    }
  },

  async fetchConfig() {
    return new Promise((resolve) => {
      resolve({
        version: '1.0.0',
        districts: [...DISTRICTS],
        maxImageSize: 10 * 1024 * 1024
      })
    })
  },

  async checkAuth() {
    const enterpriseUser = storage.getEnterpriseUser()
    const adminUser = storage.getAdminUser()

    if (enterpriseUser) {
      try {
        const result = await authService.wechatLogin()
        if (result.registered && result.enterprise) {
          storage.setEnterpriseUser(result.enterprise)
          this.globalData.userInfo = result.enterprise
          this.globalData.isLogin = true
          this.enterEnterpriseApp()
          return
        }
      } catch (error) {}
      storage.remove('enterpriseUser')
    }

    if (adminUser) {
      const valid = await authService.validateAdminSession()
      if (valid) {
        const currentAdmin = storage.getAdminUser()
        this.globalData.userInfo = currentAdmin
        this.globalData.isLogin = true
        wx.redirectTo({ url: ROUTES.DASHBOARD })
        return
      }
    }

    debugLog('[Auth] no login')
    this.globalData.userInfo = null
    this.globalData.isLogin = false
    wx.reLaunch({ url: ROUTES.LOGIN })
  },

  enterEnterpriseApp() {
    const pages = getCurrentPages()
    const currentRoute = pages.length ? `/${pages[pages.length - 1].route}` : ''
    const entryRoutes = [
      ROUTES.LOGIN,
      ROUTES.REGISTER,
      ROUTES.ADMIN_LOGIN,
      '/pages/index/index'
    ]
    if (!currentRoute || entryRoutes.includes(currentRoute)) {
      wx.switchTab({ url: ROUTES.AI_ASSISTANT })
    }
  },

  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    this.globalData.isLogin = true
  },

  clearAuth() {
    storage.clearAuth()
    this.globalData.userInfo = null
    this.globalData.isLogin = false
    cache.remove('userPermissions')
    cache.remove('userStats')
  },

  handleError(error, options = {}) {
    return ErrorHandler.handle(error, options)
  }
})

