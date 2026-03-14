const db = wx.cloud.database()

Page({
  data: {
    isAdmin: true,
    adminDistrict: null,
    adminInfo: {},
    loginTime: '',
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  },

  onLoad() {
    this.loadAdminInfo()
  },

  loadAdminInfo() {
    const adminInfo = wx.getStorageSync('adminUser')
    if (!adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      })
      return
    }
    
    const loginTime = this.formatDateTime(new Date())
    
    if (adminInfo.role === 'district' && adminInfo.district) {
      this.setData({
        isAdmin: false,
        adminDistrict: adminInfo.district,
        adminInfo: adminInfo,
        loginTime: loginTime
      })
    } else {
      this.setData({
        isAdmin: true,
        adminDistrict: null,
        adminInfo: adminInfo,
        loginTime: loginTime
      })
    }
  },

  // 密码输入
  onInputOldPassword(e) {
    this.setData({ oldPassword: e.detail.value })
  },

  onInputNewPassword(e) {
    this.setData({ newPassword: e.detail.value })
  },

  onInputConfirmPassword(e) {
    this.setData({ confirmPassword: e.detail.value })
  },

  // 修改密码
  changePassword() {
    const { oldPassword, newPassword, confirmPassword, adminInfo } = this.data
    
    if (!oldPassword) {
      wx.showToast({ title: '请输入原密码', icon: 'none' })
      return
    }
    if (!newPassword) {
      wx.showToast({ title: '请输入新密码', icon: 'none' })
      return
    }
    if (newPassword.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' })
      return
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '修改中...' })
    
    // 辖区管理员密码修改（本地验证）
    if (adminInfo.role === 'district') {
      wx.hideLoading()
      wx.showModal({
        title: '提示',
        content: '辖区管理员密码请联系总管理员修改',
        showCancel: false
      })
      return
    }
    
    // 总管理员密码修改（数据库验证）
    db.collection('admins').where({
      username: adminInfo.username
    }).get().then(res => {
      if (res.data.length === 0) {
        wx.hideLoading()
        wx.showToast({ title: '账号不存在', icon: 'none' })
        return
      }
      
      const admin = res.data[0]
      if (admin.password !== oldPassword) {
        wx.hideLoading()
        wx.showToast({ title: '原密码错误', icon: 'none' })
        return
      }
      
      // 更新密码
      db.collection('admins').doc(admin._id).update({
        data: { password: newPassword }
      }).then(() => {
        wx.hideLoading()
        wx.showToast({ title: '修改成功', icon: 'success' })
        this.setData({
          oldPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
      }).catch(err => {
        wx.hideLoading()
        console.error('修改密码失败:', err)
        wx.showToast({ title: '修改失败', icon: 'none' })
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('查询失败:', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出管理端？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('adminUser')
          wx.redirectTo({
            url: '/pages/admin-login/admin-login'
          })
        }
      }
    })
  },

  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`
  }
})
