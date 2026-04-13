const db = wx.cloud.database()

// 总管理员账号
const MAIN_ADMIN = { username: 'admin', password: 'admin123', role: 'admin' }

// 辖区管理员账号配置
const DISTRICT_ADMINS = [
  { username: 'dawen', password: 'dawen123', district: '大峃所' },
  { username: 'shanwen', password: 'shanwen123', district: '珊溪所' },
  { username: 'juyu', password: 'juyu123', district: '巨屿所' },
  { username: 'xuekou', password: 'xuekou123', district: '峃口所' },
  { username: 'huangtan', password: 'huangtan123', district: '黄坦所' },
  { username: 'xikeng', password: 'xikeng123', district: '西坑所' },
  { username: 'yuhu', password: 'yuhu123', district: '玉壶所' },
  { username: 'nantian', password: 'nantian123', district: '南田所' },
  { username: 'baizhangji', password: 'baizhangji123', district: '百丈漈所' }
]

Page({
  data: {
    username: '',
    password: '',
    loading: false
  },

  onLoad() {
    // 检查是否已登录
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
      wx.showToast({ title: '请输入用户名', icon: 'none' })
      return
    }

    if (!password.trim()) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '登录中...', mask: true })

    // 先检查是否是总管理员
    if (username.trim() === MAIN_ADMIN.username && password.trim() === MAIN_ADMIN.password) {
      const adminData = {
        username: MAIN_ADMIN.username,
        role: 'admin'
      }
      wx.setStorageSync('adminUser', adminData)
      wx.hideLoading()
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => this.goToAdmin(), 1500)
      return
    }

    // 检查是否是辖区管理员
    const districtAdmin = DISTRICT_ADMINS.find(
      a => a.username === username.trim() && a.password === password.trim()
    )
    
    if (districtAdmin) {
      // 辖区管理员登录成功
      const adminData = {
        username: districtAdmin.username,
        role: 'district',
        district: districtAdmin.district
      }
      wx.setStorageSync('adminUser', adminData)
      wx.hideLoading()
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => this.goToAdmin(), 1500)
      return
    }

    // 不是预设账号，查询数据库中的管理员
    db.collection('admins').where({
      username: username.trim()
    }).get()
      .then(res => {
        wx.hideLoading()
        if (res.data && res.data.length > 0) {
          const admin = res.data[0]
          // 验证密码
          if (admin.password === password.trim()) {
            const adminData = {
              username: admin.username,
              role: admin.role || 'admin'
            }
            wx.setStorageSync('adminUser', adminData)
            wx.showToast({ title: '登录成功', icon: 'success' })
            setTimeout(() => this.goToAdmin(), 1500)
          } else {
            wx.showToast({ title: '密码错误', icon: 'none' })
          }
        } else {
          wx.showToast({ title: '账号不存在', icon: 'none' })
        }
      })
      .catch(err => {
        wx.hideLoading()
        console.error('登录失败:', err)
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
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
