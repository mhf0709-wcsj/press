const db = wx.cloud.database()

const TEXT = {
  heroTopline: '账号',
  heroTitle: '\u8d26\u53f7\u4fe1\u606f\u8bbe\u7f6e',
  heroDesc: '',
  infoTitle: '\u8d26\u53f7\u4fe1\u606f',
  passwordTitle: '\u4fee\u6539\u5bc6\u7801',
  passwordDesc: '',
  submitPassword: '\u786e\u8ba4\u4fee\u6539',
  logout: '\u9000\u51fa\u767b\u5f55',
  adminRole: '\u603b\u7ba1\u7406\u5458',
  districtRole: '\u8f96\u533a\u7ba1\u7406\u5458',
  labels: {
    username: '\u7528\u6237\u540d',
    role: '\u8d26\u53f7\u7c7b\u578b',
    district: '\u7ba1\u7406\u8f96\u533a',
    loginTime: '\u5f53\u524d\u767b\u5f55\u65f6\u95f4'
  },
  placeholders: {
    oldPassword: '\u8bf7\u8f93\u5165\u539f\u5bc6\u7801',
    newPassword: '\u8bf7\u8f93\u5165\u65b0\u5bc6\u7801',
    confirmPassword: '\u8bf7\u518d\u6b21\u8f93\u5165\u65b0\u5bc6\u7801'
  },
  messages: {
    missingOldPassword: '\u8bf7\u8f93\u5165\u539f\u5bc6\u7801',
    missingNewPassword: '\u8bf7\u8f93\u5165\u65b0\u5bc6\u7801',
    shortPassword: '\u5bc6\u7801\u81f3\u5c116\u4f4d',
    confirmMismatch: '\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4',
    districtChangeBlocked: '\u8f96\u533a\u7ba1\u7406\u5458\u5bc6\u7801\u8bf7\u8054\u7cfb\u603b\u7ba1\u7406\u7aef\u4fee\u6539',
    accountMissing: '\u8d26\u53f7\u4e0d\u5b58\u5728',
    wrongOldPassword: '\u539f\u5bc6\u7801\u9519\u8bef',
    changeSuccess: '\u4fee\u6539\u6210\u529f',
    changeFailed: '\u4fee\u6539\u5931\u8d25',
    queryFailed: '\u64cd\u4f5c\u5931\u8d25',
    logoutTitle: '\u9000\u51fa\u767b\u5f55',
    logoutContent: '\u786e\u8ba4\u9000\u51fa\u7ba1\u7406\u7aef\u5417\uff1f'
  }
}

Page({
  data: {
    text: TEXT,
    isAdmin: true,
    adminDistrict: '',
    adminInfo: {},
    displayRole: '',
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

    const isDistrictAdmin = adminInfo.role === 'district' && adminInfo.district
    this.setData({
      isAdmin: !isDistrictAdmin,
      adminDistrict: isDistrictAdmin ? adminInfo.district : '',
      adminInfo,
      displayRole: isDistrictAdmin ? TEXT.districtRole : TEXT.adminRole,
      loginTime: this.formatDateTime(new Date())
    })
  },

  onInputOldPassword(e) {
    this.setData({ oldPassword: e.detail.value || '' })
  },

  onInputNewPassword(e) {
    this.setData({ newPassword: e.detail.value || '' })
  },

  onInputConfirmPassword(e) {
    this.setData({ confirmPassword: e.detail.value || '' })
  },

  changePassword() {
    const { oldPassword, newPassword, confirmPassword, adminInfo } = this.data

    if (!oldPassword) {
      wx.showToast({ title: TEXT.messages.missingOldPassword, icon: 'none' })
      return
    }

    if (!newPassword) {
      wx.showToast({ title: TEXT.messages.missingNewPassword, icon: 'none' })
      return
    }

    if (newPassword.length < 6) {
      wx.showToast({ title: TEXT.messages.shortPassword, icon: 'none' })
      return
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({ title: TEXT.messages.confirmMismatch, icon: 'none' })
      return
    }

    if (adminInfo.role === 'district') {
      wx.showModal({
        title: TEXT.passwordTitle,
        content: TEXT.messages.districtChangeBlocked,
        showCancel: false
      })
      return
    }

    wx.showLoading({ title: '\u4fee\u6539\u4e2d...' })

    db.collection('admins').where({
      username: adminInfo.username
    }).get().then((res) => {
      if (!res.data.length) {
        wx.hideLoading()
        wx.showToast({ title: TEXT.messages.accountMissing, icon: 'none' })
        return
      }

      const admin = res.data[0]
      if (admin.password !== oldPassword) {
        wx.hideLoading()
        wx.showToast({ title: TEXT.messages.wrongOldPassword, icon: 'none' })
        return
      }

      db.collection('admins').doc(admin._id).update({
        data: { password: newPassword }
      }).then(() => {
        wx.hideLoading()
        wx.showToast({ title: TEXT.messages.changeSuccess, icon: 'success' })
        this.setData({
          oldPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
      }).catch(() => {
        wx.hideLoading()
        wx.showToast({ title: TEXT.messages.changeFailed, icon: 'none' })
      })
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: TEXT.messages.queryFailed, icon: 'none' })
    })
  },

  logout() {
    wx.showModal({
      title: TEXT.messages.logoutTitle,
      content: TEXT.messages.logoutContent,
      success: (res) => {
        if (!res.confirm) return
        wx.removeStorageSync('adminUser')
        wx.redirectTo({
          url: '/pages/admin-login/admin-login'
        })
      }
    })
  },

  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
})
