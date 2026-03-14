const { CLOUD_CONFIG, ROUTES } = require('./constants/index.js')
const { storage } = require('./utils/index.js')

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    systemInfo: null
  },

  onLaunch() {
    console.log('[App] 小程序启动')
    
    // 初始化云开发
    this.initCloud()
    
    // 获取系统信息
    this.getSystemInfo()
    
    // 检查登录状态
    this.checkAuth()
  },

  onShow() {
    console.log('[App] 小程序显示')
  },

  onHide() {
    console.log('[App] 小程序隐藏')
  },

  onError(msg) {
    console.error('[App] 全局错误:', msg)
  },

  /**
   * 初始化云开发
   */
  initCloud() {
    if (!wx.cloud) {
      console.error('[Cloud] 请使用 2.2.3 或以上基础库')
      wx.showModal({
        title: '版本过低',
        content: '当前微信版本过低，请升级后使用',
        showCancel: false
      })
      return
    }

    wx.cloud.init({
      env: CLOUD_CONFIG.ENV,
      traceUser: CLOUD_CONFIG.TRACE_USER
    })
    
    console.log('[Cloud] 云开发初始化成功')
  },

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res
        console.log('[App] 系统信息:', res.model, res.system)
      }
    })
  },

  /**
   * 检查认证状态
   */
  checkAuth() {
    const enterpriseUser = storage.getEnterpriseUser()
    const adminUser = storage.getAdminUser()

    if (enterpriseUser) {
      console.log('[Auth] 企业用户已登录:', enterpriseUser.companyName)
      this.globalData.userInfo = enterpriseUser
      this.globalData.isLogin = true
      
      // 跳转到首页
      wx.switchTab({ url: ROUTES.CAMERA })
    } else if (adminUser) {
      console.log('[Auth] 管理员已登录')
      this.globalData.userInfo = adminUser
      this.globalData.isLogin = true
      
      // 跳转到管理后台
      wx.redirectTo({ url: ROUTES.DASHBOARD })
    } else {
      console.log('[Auth] 未登录')
      // 保持在登录页面
    }
  },

  /**
   * 设置全局用户信息
   * @param {Object} userInfo 用户信息
   */
  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    this.globalData.isLogin = true
  },

  /**
   * 清除登录状态
   */
  clearAuth() {
    storage.clearAuth()
    this.globalData.userInfo = null
    this.globalData.isLogin = false
  }
})