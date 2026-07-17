const { CLOUD_CONFIG, ROUTES } = require('./constants/index.js')
const { storage } = require('./utils/index.js')
const { cache } = require('./utils/cache.js')
const { ErrorHandler } = require('./utils/error-handler.js')
const authService = require('./services/auth-service.js')

const debugLog = () => {}

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    isConnected: true,
    entryReminderToken: 0,
    entryReminderHandledToken: 0,
    ledgerVersion: 0
  },

  onLaunch() {
    debugLog('[App] launch')
    this.initCloud()
    this.watchNetworkStatus()
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
      ROUTES.ADMIN_LOGIN
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

