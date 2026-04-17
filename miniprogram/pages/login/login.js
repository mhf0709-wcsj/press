const db = wx.cloud.database()

const TEXT = {
  brandName: '\u538b\u529b\u8868\u667a\u80fd\u52a9\u624b',
  title: '\u4f01\u4e1a\u767b\u5f55',
  desc: '\u4f18\u5148\u4f7f\u7528\u5fae\u4fe1\u767b\u5f55\uff0c\u9996\u6b21\u767b\u5f55\u540e\u518d\u8865\u5168\u4f01\u4e1a\u4fe1\u606f',
  wechatSubmit: '\u5fae\u4fe1\u767b\u5f55',
  wechatSubmitting: '\u767b\u5f55\u4e2d...',
  wechatHint: '\u5fae\u4fe1\u9a8c\u8bc1\u901a\u8fc7\u540e\uff0c\u53ef\u81ea\u52a8\u7ed1\u5b9a\u4f01\u4e1a\u8d26\u53f7',
  manualToggle: '\u4f7f\u7528\u4f01\u4e1a\u4fe1\u606f\u767b\u5f55',
  companyLabel: '\u4f01\u4e1a\u540d\u79f0',
  companyPlaceholder: '\u8bf7\u8f93\u5165\u4f01\u4e1a\u540d\u79f0',
  phoneLabel: '\u6cd5\u4eba\u624b\u673a\u53f7',
  phonePlaceholder: '\u8bf7\u8f93\u5165\u6cd5\u4eba\u624b\u673a\u53f7',
  submit: '\u4f7f\u7528\u4f01\u4e1a\u4fe1\u606f\u767b\u5f55',
  submitting: '\u767b\u5f55\u4e2d...',
  assistText: '\u8fd8\u6ca1\u6709\u7ed1\u5b9a\u4f01\u4e1a\uff1f',
  register: '\u8865\u5168\u4f01\u4e1a\u4fe1\u606f',
  adminLogin: '\u7ba1\u7406\u7aef\u767b\u5f55',
  requireCompany: '\u8bf7\u8f93\u5165\u4f01\u4e1a\u540d\u79f0',
  requirePhone: '\u8bf7\u8f93\u5165\u6cd5\u4eba\u624b\u673a\u53f7',
  invalidPhone: '\u624b\u673a\u53f7\u683c\u5f0f\u4e0d\u6b63\u786e',
  loading: '\u767b\u5f55\u4e2d...',
  loginSuccess: '\u767b\u5f55\u6210\u529f',
  loginFailed: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
  userMissingTitle: '\u672a\u627e\u5230\u8be5\u4f01\u4e1a',
  userMissingContent: '\u8be5\u4f01\u4e1a\u4fe1\u606f\u672a\u6ce8\u518c\uff0c\u662f\u5426\u5148\u4f7f\u7528\u5fae\u4fe1\u767b\u5f55\u5e76\u8865\u5168\u4f01\u4e1a\u4fe1\u606f\uff1f',
  confirmRegister: '\u53bb\u7ed1\u5b9a',
  cancel: '\u53d6\u6d88',
  wechatNeedBind: '\u9996\u6b21\u767b\u5f55\uff0c\u8bf7\u8865\u5168\u4f01\u4e1a\u4fe1\u606f',
  wechatFailed: '\u5fae\u4fe1\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5'
}

Page({
  data: {
    text: TEXT,
    companyName: '',
    phone: '',
    loading: false,
    manualVisible: false
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

  toggleManualLogin() {
    this.setData({
      manualVisible: !this.data.manualVisible
    })
  },

  async handleWechatLogin() {
    if (this.data.loading) return

    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.wechatSubmitting, mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'enterpriseAuth',
        data: {
          action: 'wechatLogin'
        }
      })

      const result = res.result || {}
      if (!result.success) {
        throw new Error(result.error || TEXT.wechatFailed)
      }

      if (result.registered && result.enterprise) {
        wx.setStorageSync('enterpriseUser', result.enterprise)
        wx.removeStorageSync('enterpriseAuthPending')
        wx.hideLoading()
        wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
        setTimeout(() => this.goToHome(), 1200)
        return
      }

      wx.setStorageSync('enterpriseAuthPending', {
        authType: 'wechat',
        bindMode: true
      })

      wx.hideLoading()
      wx.showToast({ title: TEXT.wechatNeedBind, icon: 'none' })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/register/register?mode=bind' })
      }, 500)
    } catch (error) {
      wx.hideLoading()
      console.error('Wechat login failed:', error)
      wx.showToast({ title: error.message || TEXT.wechatFailed, icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
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
          setTimeout(() => this.goToHome(), 1200)
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
        console.error('Manual login failed:', err)
        wx.showToast({ title: TEXT.loginFailed, icon: 'none' })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  goToRegister() {
    wx.navigateTo({ url: '/pages/register/register?mode=bind' })
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
