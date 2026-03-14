const db = wx.cloud.database()

Page({
  data: {
    companyName: '',
    phone: '',
    loading: false
  },

  onLoad() {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('enterpriseUser')
    if (userInfo && userInfo.companyName) {
      this.goToHome()
    }
  },

  onInputCompanyName(e) {
    this.setData({ companyName: e.detail.value })
  },

  onInputPhone(e) {
    this.setData({ phone: e.detail.value })
  },

  handleLogin() {
    const { companyName, phone } = this.data

    if (!companyName.trim()) {
      wx.showToast({ title: '请输入企业名称', icon: 'none' })
      return
    }

    if (!phone.trim()) {
      wx.showToast({ title: '请输入法人手机号', icon: 'none' })
      return
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '登录中...', mask: true })

    // 查询企业用户
    db.collection('enterprises').where({
      companyName: companyName.trim(),
      phone: phone.trim()
    }).get()
      .then(res => {
        wx.hideLoading()
        if (res.data && res.data.length > 0) {
          // 登录成功
          const userInfo = res.data[0]
          wx.setStorageSync('enterpriseUser', userInfo)
          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => this.goToHome(), 1500)
        } else {
          // 用户不存在，提示注册
          wx.showModal({
            title: '未找到该用户',
            content: '该企业信息未注册，是否前往注册？',
            confirmText: '去注册',
            cancelText: '取消',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.navigateTo({ url: '/pages/register/register' })
              }
            }
          })
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

  goToRegister() {
    wx.navigateTo({ url: '/pages/register/register' })
  },

  goToAdminLogin() {
    wx.navigateTo({ url: '/pages/admin-login/admin-login' })
  },

  goToHome() {
    wx.switchTab({
      url: '/pages/camera/camera'
    })
  }
})
