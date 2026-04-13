const { CLOUD_CONFIG, ROUTES } = require('./constants/index.js')
const { storage } = require('./utils/index.js')
const { cache } = require('./utils/cache.js')
const { ErrorHandler } = require('./utils/error-handler.js')

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    systemInfo: null,
    isConnected: true
  },

  onLaunch() {
    console.log('[App] launch')
    this.initCloud()
    this.getSystemInfo()
    this.watchNetworkStatus()
    this.preloadCriticalData()
    this.checkAuth()
  },

  onShow() {
    console.log('[App] show')
  },

  onHide() {
    console.log('[App] hide')
  },

  onError(msg) {
    console.error('[App] error:', msg)
    ErrorHandler.handle(msg, { showToast: false })
  },

  initCloud() {
    if (!wx.cloud) {
      console.error('[Cloud] unavailable')
      wx.showModal({
        title: 'Version Error',
        content: 'Current WeChat version is too low. Please upgrade and try again.',
        showCancel: false
      })
      return
    }

    wx.cloud.init({
      env: CLOUD_CONFIG.ENV,
      traceUser: CLOUD_CONFIG.TRACE_USER
    })

    console.log('[Cloud] init success')
  },

  getSystemInfo() {
    try {
      const res = wx.getSystemInfoSync()
      this.globalData.systemInfo = res
      console.log('[App] system:', res.model, res.system)
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
          title: 'Network disconnected',
          icon: 'none',
          duration: 2000
        })
      } else {
        console.log('[Network] restored:', res.networkType)
      }
    })

    wx.getNetworkType({
      success: (res) => {
        this.globalData.isConnected = res.networkType !== 'none'
      }
    })
  },

  async preloadCriticalData() {
    console.log('[App] preload config')

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
        districts: ['district-a', 'district-b', 'district-c', 'district-d', 'district-e', 'district-f'],
        maxImageSize: 10 * 1024 * 1024
      })
    })
  },

  checkAuth() {
    const enterpriseUser = storage.getEnterpriseUser()
    const adminUser = storage.getAdminUser()

    if (enterpriseUser) {
      console.log('[Auth] enterprise login:', enterpriseUser.companyName)
      this.globalData.userInfo = enterpriseUser
      this.globalData.isLogin = true
      wx.switchTab({ url: ROUTES.AI_ASSISTANT })
      return
    }

    if (adminUser) {
      console.log('[Auth] admin login')
      this.globalData.userInfo = adminUser
      this.globalData.isLogin = true
      wx.redirectTo({ url: ROUTES.DASHBOARD })
      return
    }

    console.log('[Auth] no login')
    this.globalData.userInfo = null
    this.globalData.isLogin = false
    wx.reLaunch({ url: ROUTES.LOGIN })
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
