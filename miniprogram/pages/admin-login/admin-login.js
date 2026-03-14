const db = wx.cloud.database()

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

    // 先检查是否是辖区管理员
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

    // 查询总管理员账号
    db.collection('admins').where({
      username: username.trim()
    }).get()
      .then(res => {
        wx.hideLoading()
        if (res.data && res.data.length > 0) {
          const admin = res.data[0]
          // 验证密码
          if (admin.password === password.trim()) {
            // 登录成功，设置为总管理员
            const adminData = {
              username: admin.username,
              role: 'admin'
            }
            wx.setStorageSync('adminUser', adminData)
            wx.showToast({ title: '登录成功', icon: 'success' })
            setTimeout(() => this.goToAdmin(), 1500)
          } else {
            wx.showToast({ title: '密码错误', icon: 'none' })
          }
        } else {
          // 用户名不存在，尝试初始化管理员账号
          wx.showModal({
            title: '提示',
            content: '管理员账号不存在，是否初始化创建？\n\n默认账号：admin\n默认密码：admin123',
            confirmText: '初始化',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.initAdmin()
              }
            }
          })
        }
      })
      .catch(err => {
        wx.hideLoading()
        console.error('登录失败:', err)
        // 集合不存在，提示初始化
        wx.showModal({
          title: '提示',
          content: '管理员数据不存在，是否初始化创建？\n\n默认账号：admin\n默认密码：admin123',
          confirmText: '初始化',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.initAdmin()
            }
          }
        })
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
    wx.navigateBack()
  },

  initAdmin() {
    wx.showLoading({ title: '初始化中...', mask: true })
    wx.cloud.callFunction({
      name: 'initAdmin'
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '初始化成功', icon: 'success' })
        // 自动登录
        const adminData = {
          username: 'admin',
          password: 'admin123',
          role: 'admin'
        }
        wx.setStorageSync('adminUser', adminData)
        setTimeout(() => this.goToAdmin(), 1500)
      } else {
        wx.showModal({
          title: '初始化失败',
          content: res.result.message || '请先在云开发控制台创建 admins 集合',
          showCancel: false
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('初始化失败:', err)
      wx.showModal({
        title: '初始化失败',
        content: '请先上传并部署 initAdmin 云函数',
        showCancel: false
      })
    })
  }
})
