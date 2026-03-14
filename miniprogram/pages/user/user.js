const db = wx.cloud.database()

Page({
  data: {
    enterpriseUser: null,
    userInfo: {},
    hasUserInfo: false,
    cloudEnv: '',
    storageUsage: '计算中...',
    recordCount: 0,
    passCount: 0
  },

  onLoad() {
    this.loadEnterpriseInfo()
    this.loadSystemInfo()
    this.loadStatistics()
  },

  onShow() {
    // 每次显示页面时刷新企业信息
    this.loadEnterpriseInfo()
    this.loadStatistics()
  },

  loadEnterpriseInfo() {
    // 获取企业用户信息
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser: enterpriseUser })
  },

  loadSystemInfo() {
    // 获取云环境信息
    const envInfo = wx.getAccountInfoSync()
    this.setData({
      cloudEnv: envInfo.miniProgram.envVersion || 'unknown'
    })
    
    // 获取存储使用情况
    this.calculateStorageUsage()
  },

  loadStatistics() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    if (!enterpriseUser) return

    // 获取存档总数
    db.collection('pressure_records')
      .where({
        enterpriseName: enterpriseUser.companyName
      })
      .count()
      .then(res => {
        this.setData({ recordCount: res.total })
        // 估算存储大小
        const estimatedSize = (res.total * 2).toFixed(1)
        this.setData({
          storageUsage: `${estimatedSize}KB`
        })
      })
      .catch(err => {
        console.error('获取统计失败:', err)
      })

    // 获取合格数量
    db.collection('pressure_records')
      .where({
        enterpriseName: enterpriseUser.companyName,
        conclusion: '合格'
      })
      .count()
      .then(res => {
        this.setData({ passCount: res.total })
      })
      .catch(err => {
        console.error('获取合格数量失败:', err)
      })
  },

  calculateStorageUsage() {
    // 已由loadStatistics处理
  },

  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '确认清理本地缓存？这不会删除云端数据。',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorage({
            success: () => {
              wx.showToast({ title: '缓存已清理', icon: 'success' })
            }
          })
        }
      }
    })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前企业账号？',
      success: (res) => {
        if (res.confirm) {
          // 清除企业用户信息
          this.setData({
            enterpriseUser: null,
            userInfo: {},
            hasUserInfo: false
          })
          wx.clearStorageSync()
          wx.showToast({ title: '已退出', icon: 'success' })
          // 跳转到登录页面
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/login/login'
            })
          }, 1500)
        }
      }
    })
  }
})
