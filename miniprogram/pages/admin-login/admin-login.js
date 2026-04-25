const db = wx.cloud.database()

const MAIN_ADMIN = { username: 'admin', password: 'admin123', role: 'admin' }

const DISTRICT_ADMINS = [
  { username: 'dawen', password: 'dawen123', district: '\u5927\u5cf3\u6240' },
  { username: 'shanwen', password: 'shanwen123', district: '\u73ca\u6eaa\u6240' },
  { username: 'juyu', password: 'juyu123', district: '\u5de8\u5c7f\u6240' },
  { username: 'xuekou', password: 'xuekou123', district: '\u5cf3\u53e3\u6240' },
  { username: 'huangtan', password: 'huangtan123', district: '\u9ec4\u5766\u6240' },
  { username: 'xikeng', password: 'xikeng123', district: '\u897f\u5751\u6240' },
  { username: 'yuhu', password: 'yuhu123', district: '\u7389\u58f6\u6240' },
  { username: 'nantian', password: 'nantian123', district: '\u5357\u7530\u6240' },
  { username: 'baizhangji', password: 'baizhangji123', district: '\u767e\u4e08\u9645\u6240' }
]

const TEXT = {
  brandName: '\u7ba1\u7406\u63a7\u5236\u53f0',
  title: '\u7ba1\u7406\u7aef\u767b\u5f55',
  desc: '',
  usernameLabel: '\u7528\u6237\u540d',
  usernamePlaceholder: '\u8bf7\u8f93\u5165\u7528\u6237\u540d',
  passwordLabel: '\u5bc6\u7801',
  passwordPlaceholder: '\u8bf7\u8f93\u5165\u5bc6\u7801',
  submit: '\u8fdb\u5165\u540e\u53f0',
  submitting: '\u767b\u5f55\u4e2d...',
  backToEnterprise: '\u8fd4\u56de\u4f01\u4e1a\u7aef',
  requireUsername: '\u8bf7\u8f93\u5165\u7528\u6237\u540d',
  requirePassword: '\u8bf7\u8f93\u5165\u5bc6\u7801',
  loading: '\u767b\u5f55\u4e2d...',
  loginSuccess: '\u767b\u5f55\u6210\u529f',
  wrongPassword: '\u5bc6\u7801\u9519\u8bef',
  accountMissing: '\u8d26\u53f7\u4e0d\u5b58\u5728',
  loginFailed: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5'
}

Page({
  data: {
    text: TEXT,
    username: '',
    password: '',
    loading: false
  },

  onLoad() {
    const adminInfo = wx.getStorageSync('adminUser')
    if (adminInfo) {
      this.goToAdmin()
    }
  },

  onInputUsername(e) {
    this.setData({ username: e.detail.value })
  },

  onInputPassword(e) {
    this.setData({ password: e.detail.value })
  },

  handleLogin() {
    const { username, password } = this.data

    if (!username.trim()) {
      wx.showToast({ title: TEXT.requireUsername, icon: 'none' })
      return
    }

    if (!password.trim()) {
      wx.showToast({ title: TEXT.requirePassword, icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.loading, mask: true })

    if (username.trim() === MAIN_ADMIN.username && password.trim() === MAIN_ADMIN.password) {
      wx.setStorageSync('adminUser', {
        username: MAIN_ADMIN.username,
        role: MAIN_ADMIN.role
      })
      wx.hideLoading()
      wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
      setTimeout(() => this.goToAdmin(), 1500)
      return
    }

    const districtAdmin = DISTRICT_ADMINS.find(
      (item) => item.username === username.trim() && item.password === password.trim()
    )

    if (districtAdmin) {
      wx.setStorageSync('adminUser', {
        username: districtAdmin.username,
        role: 'district',
        district: districtAdmin.district
      })
      wx.hideLoading()
      wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
      setTimeout(() => this.goToAdmin(), 1500)
      return
    }

    db.collection('admins').where({
      username: username.trim()
    }).get()
      .then((res) => {
        wx.hideLoading()
        if (res.data && res.data.length > 0) {
          const admin = res.data[0]
          if (admin.password === password.trim()) {
            wx.setStorageSync('adminUser', {
              username: admin.username,
              role: admin.role || 'admin'
            })
            wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
            setTimeout(() => this.goToAdmin(), 1500)
            return
          }

          wx.showToast({ title: TEXT.wrongPassword, icon: 'none' })
          return
        }

        wx.showToast({ title: TEXT.accountMissing, icon: 'none' })
      })
      .catch((err) => {
        wx.hideLoading()
        console.error('管理端登录失败:', err)
        wx.showToast({ title: TEXT.loginFailed, icon: 'none' })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  goToAdmin() {
    wx.redirectTo({
      url: '/pages/dashboard/dashboard'
    })
  },

  goToEnterprise() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    if (enterpriseUser) {
      wx.switchTab({ url: '/pages/ai-assistant/ai-assistant' })
      return
    }
    wx.reLaunch({ url: '/pages/login/login' })
  }
})
