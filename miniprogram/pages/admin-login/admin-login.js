const db = wx.cloud.database()

const MAIN_ADMIN = { username: 'admin', password: 'admin123', role: 'admin' }

const DISTRICT_ADMINS = [
  { username: 'dawen', password: 'dawen123', district: '\u5927\u5cc3\u6240' },
  { username: 'shanwen', password: 'shanwen123', district: '\u73ca\u6eaa\u6240' },
  { username: 'juyu', password: 'juyu123', district: '\u5de8\u5c7f\u6240' },
  { username: 'xuekou', password: 'xuekou123', district: '\u5cc3\u53e3\u6240' },
  { username: 'huangtan', password: 'huangtan123', district: '\u9ec4\u5766\u6240' },
  { username: 'xikeng', password: 'xikeng123', district: '\u897f\u5751\u6240' },
  { username: 'yuhu', password: 'yuhu123', district: '\u7389\u58f6\u6240' },
  { username: 'nantian', password: 'nantian123', district: '\u5357\u7530\u6240' },
  { username: 'baizhangji', password: 'baizhangji123', district: '\u767e\u4e08\u6f08\u6240' }
]

const TEXT = {
  brandName: '管理控制台',
  title: '管理端登录',
  desc: '',
  usernameLabel: '用户名',
  usernamePlaceholder: '请输入用户名',
  passwordLabel: '密码',
  passwordPlaceholder: '请输入密码',
  submit: '进入后台',
  submitting: '登录中...',
  changePasswordLink: '修改密码',
  backToEnterprise: '返回企业端',
  requireUsername: '请输入用户名',
  requirePassword: '请输入密码',
  requireResetOldPassword: '请输入原密码',
  requireResetNewPassword: '请输入新密码',
  requireResetConfirmPassword: '请再次输入新密码',
  shortPassword: '密码至少 6 位',
  confirmMismatch: '两次输入的密码不一致',
  loading: '登录中...',
  loginSuccess: '登录成功',
  wrongPassword: '密码错误',
  accountMissing: '账号不存在',
  loginFailed: '登录失败，请重试',
  wrongOldPassword: '原密码错误',
  changePasswordSuccess: '密码已更新',
  changePasswordFailed: '修改失败，请重试',
  resetTitle: '修改密码',
  districtChangeBlocked: '辖区管理员密码请联系总管理端修改'
}

Page({
  data: {
    text: TEXT,
    username: '',
    password: '',
    loading: false,
    showPasswordEditor: false,
    resetOldPassword: '',
    resetNewPassword: '',
    resetConfirmPassword: ''
  },

  onLoad() {
    const adminInfo = wx.getStorageSync('adminUser')
    if (adminInfo) {
      this.goToAdmin()
    }
  },

  onInputUsername(e) {
    this.setData({ username: e.detail.value || '' })
  },

  onInputPassword(e) {
    this.setData({ password: e.detail.value || '' })
  },

  onInputResetOldPassword(e) {
    this.setData({ resetOldPassword: e.detail.value || '' })
  },

  onInputResetNewPassword(e) {
    this.setData({ resetNewPassword: e.detail.value || '' })
  },

  onInputResetConfirmPassword(e) {
    this.setData({ resetConfirmPassword: e.detail.value || '' })
  },

  async handleLogin() {
    const normalizedUsername = String(this.data.username || '').trim()
    const normalizedPassword = String(this.data.password || '').trim()

    if (!normalizedUsername) {
      wx.showToast({ title: TEXT.requireUsername, icon: 'none' })
      return
    }

    if (!normalizedPassword) {
      wx.showToast({ title: TEXT.requirePassword, icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.loading, mask: true })

    try {
      const res = await db.collection('admins').where({
        username: normalizedUsername
      }).get()

      if (res.data && res.data.length > 0) {
        const admin = res.data[0]
        if (admin.password === normalizedPassword) {
          wx.hideLoading()
          wx.setStorageSync('adminUser', {
            username: admin.username,
            role: admin.role || 'admin',
            district: admin.district || ''
          })
          wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
          setTimeout(() => this.goToAdmin(), 1500)
          return
        }

        wx.hideLoading()
        wx.showToast({ title: TEXT.wrongPassword, icon: 'none' })
        return
      }

      if (normalizedUsername === MAIN_ADMIN.username && normalizedPassword === MAIN_ADMIN.password) {
        wx.hideLoading()
        wx.setStorageSync('adminUser', {
          username: MAIN_ADMIN.username,
          role: MAIN_ADMIN.role
        })
        wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
        setTimeout(() => this.goToAdmin(), 1500)
        return
      }

      const districtAdmin = DISTRICT_ADMINS.find(
        (item) => item.username === normalizedUsername && item.password === normalizedPassword
      )

      if (districtAdmin) {
        wx.hideLoading()
        wx.setStorageSync('adminUser', {
          username: districtAdmin.username,
          role: 'district',
          district: districtAdmin.district
        })
        wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
        setTimeout(() => this.goToAdmin(), 1500)
        return
      }

      wx.hideLoading()
      wx.showToast({ title: TEXT.accountMissing, icon: 'none' })
    } catch (err) {
      wx.hideLoading()
      console.error('admin login failed', err)
      wx.showToast({ title: TEXT.loginFailed, icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  togglePasswordEditor() {
    this.setData((data) => ({
      showPasswordEditor: !data.showPasswordEditor,
      resetOldPassword: !data.showPasswordEditor ? data.resetOldPassword : '',
      resetNewPassword: !data.showPasswordEditor ? data.resetNewPassword : '',
      resetConfirmPassword: !data.showPasswordEditor ? data.resetConfirmPassword : ''
    }))
  },

  async handleChangePassword() {
    const username = String(this.data.username || '').trim()
    const oldPassword = String(this.data.resetOldPassword || '').trim()
    const newPassword = String(this.data.resetNewPassword || '').trim()
    const confirmPassword = String(this.data.resetConfirmPassword || '').trim()

    if (!username) {
      wx.showToast({ title: TEXT.requireUsername, icon: 'none' })
      return
    }

    const districtAdmin = DISTRICT_ADMINS.find((item) => item.username === username)
    if (districtAdmin) {
      wx.showModal({
        title: TEXT.resetTitle,
        content: TEXT.districtChangeBlocked,
        showCancel: false
      })
      return
    }

    if (!oldPassword) {
      wx.showToast({ title: TEXT.requireResetOldPassword, icon: 'none' })
      return
    }

    if (!newPassword) {
      wx.showToast({ title: TEXT.requireResetNewPassword, icon: 'none' })
      return
    }

    if (!confirmPassword) {
      wx.showToast({ title: TEXT.requireResetConfirmPassword, icon: 'none' })
      return
    }

    if (newPassword.length < 6) {
      wx.showToast({ title: TEXT.shortPassword, icon: 'none' })
      return
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({ title: TEXT.confirmMismatch, icon: 'none' })
      return
    }

    wx.showLoading({ title: '修改中...', mask: true })

    try {
      const res = await db.collection('admins').where({ username }).get()

      if (res.data && res.data.length > 0) {
        const admin = res.data[0]
        if (admin.password !== oldPassword) {
          wx.hideLoading()
          wx.showToast({ title: TEXT.wrongOldPassword, icon: 'none' })
          return
        }

        await db.collection('admins').doc(admin._id).update({
          data: {
            password: newPassword,
            updateTime: new Date()
          }
        })
      } else if (username === MAIN_ADMIN.username) {
        if (oldPassword !== MAIN_ADMIN.password) {
          wx.hideLoading()
          wx.showToast({ title: TEXT.wrongOldPassword, icon: 'none' })
          return
        }

        await db.collection('admins').add({
          data: {
            username,
            password: newPassword,
            role: 'admin',
            createTime: new Date(),
            updateTime: new Date()
          }
        })
      } else {
        wx.hideLoading()
        wx.showToast({ title: TEXT.accountMissing, icon: 'none' })
        return
      }

      wx.hideLoading()
      wx.showToast({ title: TEXT.changePasswordSuccess, icon: 'success' })
      this.setData({
        showPasswordEditor: false,
        resetOldPassword: '',
        resetNewPassword: '',
        resetConfirmPassword: ''
      })
    } catch (err) {
      wx.hideLoading()
      console.error('admin password change failed', err)
      wx.showToast({ title: TEXT.changePasswordFailed, icon: 'none' })
    }
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
