const db = wx.cloud.database()

const TEXT = {
  brandName: '\u538b\u529b\u8868\u667a\u80fd\u52a9\u624b',
  title: '\u4f01\u4e1a\u767b\u5f55',
  desc: '\u7ee7\u7eed\u4f7f\u7528 AI \u667a\u80fd\u7ba1\u5bb6',
  companyLabel: '\u4f01\u4e1a\u540d\u79f0',
  companyPlaceholder: '\u8bf7\u8f93\u5165\u4f01\u4e1a\u540d\u79f0',
  phoneLabel: '\u6cd5\u4eba\u624b\u673a\u53f7',
  phonePlaceholder: '\u8bf7\u8f93\u5165\u6cd5\u4eba\u624b\u673a\u53f7',
  submit: '\u8fdb\u5165\u667a\u80fd\u7ba1\u5bb6',
  submitting: '\u767b\u5f55\u4e2d...',
  assistText: '\u6ca1\u6709\u4f01\u4e1a\u8d26\u53f7\uff1f',
  register: '\u524d\u5f80\u6ce8\u518c',
  adminLogin: '\u7ba1\u7406\u7aef\u767b\u5f55',
  requireCompany: '\u8bf7\u8f93\u5165\u4f01\u4e1a\u540d\u79f0',
  requirePhone: '\u8bf7\u8f93\u5165\u6cd5\u4eba\u624b\u673a\u53f7',
  invalidPhone: '\u624b\u673a\u53f7\u683c\u5f0f\u4e0d\u6b63\u786e',
  loading: '\u767b\u5f55\u4e2d...',
  loginSuccess: '\u767b\u5f55\u6210\u529f',
  loginFailed: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
  userMissingTitle: '\u672a\u627e\u5230\u8be5\u7528\u6237',
  userMissingContent: '\u8be5\u4f01\u4e1a\u4fe1\u606f\u672a\u6ce8\u518c\uff0c\u662f\u5426\u524d\u5f80\u6ce8\u518c\uff1f',
  confirmRegister: '\u53bb\u6ce8\u518c',
  cancel: '\u53d6\u6d88'
}

Page({
  data: {
    text: TEXT,
    companyName: '',
    phone: '',
    loading: false
  },

  onLoad() {
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
      wx.showToast({ title: TEXT.requireCompany, icon: 'none' })
      return
    }

    if (!phone.trim()) {
      wx.showToast({ title: TEXT.requirePhone, icon: 'none' })
      return
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: TEXT.invalidPhone, icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.loading, mask: true })

    db.collection('enterprises').where({
      companyName: companyName.trim(),
      phone: phone.trim()
    }).get()
      .then((res) => {
        wx.hideLoading()
        if (res.data && res.data.length > 0) {
          const userInfo = res.data[0]
          wx.setStorageSync('enterpriseUser', userInfo)
          wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
          setTimeout(() => this.goToHome(), 1500)
          return
        }

        wx.showModal({
          title: TEXT.userMissingTitle,
          content: TEXT.userMissingContent,
          confirmText: TEXT.confirmRegister,
          cancelText: TEXT.cancel,
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.navigateTo({ url: '/pages/register/register' })
            }
          }
        })
      })
      .catch((err) => {
        wx.hideLoading()
        console.error('登录失败:', err)
        wx.showToast({ title: TEXT.loginFailed, icon: 'none' })
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
    wx.reLaunch({
      url: '/pages/ai-assistant/ai-assistant'
    })
  }
})
