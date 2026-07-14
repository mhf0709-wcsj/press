const authService = require('../../services/auth-service')
const { storage } = require('../../utils/index')

const TEXT = {
  brandName: '压力表智能管家',
  title: '企业登录',
  desc: '使用当前微信账号安全登录',
  submit: '微信账号登录',
  submitting: '验证中...',
  assistText: '首次使用？',
  register: '补全并绑定企业信息',
  adminLogin: '管理端登录',
  loginSuccess: '登录成功',
  loginFailed: '登录失败，请重试',
  unboundTitle: '尚未绑定企业',
  unboundContent: '请核验企业完整信息，将当前微信账号与企业绑定。',
  confirmRegister: '去绑定',
  cancel: '取消'
}

Page({
  data: { text: TEXT, loading: false },

  onLoad() {
    const userInfo = storage.getEnterpriseUser()
    if (userInfo?.companyName) this.goToHome()
  },

  async handleLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.submitting, mask: true })

    try {
      const result = await authService.wechatLogin()
      wx.hideLoading()
      if (result.registered && result.enterprise) {
        storage.setEnterpriseUser(result.enterprise)
        wx.removeStorageSync('enterpriseAuthPending')
        wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
        setTimeout(() => this.goToHome(), 500)
        return
      }

      wx.setStorageSync('enterpriseAuthPending', { authType: 'wechat', createdAt: Date.now() })
      wx.showModal({
        title: TEXT.unboundTitle,
        content: TEXT.unboundContent,
        confirmText: TEXT.confirmRegister,
        cancelText: TEXT.cancel,
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/register/register?mode=bind' })
        }
      })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || TEXT.loginFailed, icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goToRegister() {
    wx.setStorageSync('enterpriseAuthPending', { authType: 'wechat', createdAt: Date.now() })
    wx.navigateTo({ url: '/pages/register/register?mode=bind' })
  },

  goToAdminLogin() {
    wx.navigateTo({ url: '/pages/admin-login/admin-login' })
  },

  goToHome() {
    wx.reLaunch({ url: '/pages/ai-assistant/ai-assistant' })
  }
})
