const db = wx.cloud.database()
const { SUBSCRIBE_TEMPLATE_IDS } = require('../../constants/index')

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

  // 清理缓存
  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '确定要清理本地缓存数据吗？（不影响云端数据）',
      success: (res) => {
        if (res.confirm) {
          // 保留用户信息，清除其他缓存
          const user = wx.getStorageSync('enterpriseUser')
          wx.clearStorageSync()
          if (user) {
            wx.setStorageSync('enterpriseUser', user)
          }
          
          wx.showToast({
            title: '清理成功',
            icon: 'success'
          })
        }
      }
    })
  },

  goToEquipmentLibrary() {
    wx.switchTab({
      url: '/pages/archive/archive'
    })
  },

  goToLogin() {
    wx.reLaunch({
      url: '/pages/login/login'
    })
  },

  // 订阅预警消息
  subscribeAlert() {
    const appConfig = wx.getStorageSync('appConfig') || {}
    const tmplId = appConfig.deviceExpiryTemplateId || SUBSCRIBE_TEMPLATE_IDS.DEVICE_EXPIRY
    if (!tmplId) {
      wx.showModal({
        title: '未配置模板',
        content: '请在配置中设置“设备到期提醒”订阅模板ID后再订阅。',
        showCancel: false
      })
      return
    }
    
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success(res) {
        if (res[tmplId] === 'accept') {
          wx.showToast({ title: '订阅成功', icon: 'success' });
          console.log('用户同意订阅消息');
        } else {
          wx.showToast({ title: '已取消订阅', icon: 'none' });
          console.log('用户拒绝订阅消息');
        }
      },
      fail(err) {
        console.error('订阅消息调用失败', err);
        // 如果使用了无效的模板ID，微信API会报错，这里做一下友好提示
        if (err.errCode === 20004) {
          wx.showModal({
            title: '提示',
            content: '开发者需要先在微信公众平台申请真实的订阅消息模板ID，并替换代码中的占位符才能生效。',
            showCancel: false
          });
        } else {
          wx.showToast({ title: '订阅失败', icon: 'none' });
        }
      }
    });
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
