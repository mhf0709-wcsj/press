const authService = require('../../services/auth-service')
const { storage } = require('../../utils/index')

const TEXT = {
  brandName: '管理控制台',
  title: '管理端登录',
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
  shortPassword: '密码至少 8 位且包含字母和数字',
  confirmMismatch: '两次输入的密码不一致',
  loginSuccess: '登录成功',
  loginFailed: '登录失败，请重试',
  changePasswordSuccess: '密码已更新，请重新登录',
  changePasswordFailed: '修改失败，请重试'
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

  async onLoad() {
    if (storage.getAdminUser()?.token && await authService.validateAdminSession()) this.goToAdmin()
  },

  onInputUsername(e) { this.setData({ username: e.detail.value || '' }) },
  onInputPassword(e) { this.setData({ password: e.detail.value || '' }) },
  onInputResetOldPassword(e) { this.setData({ resetOldPassword: e.detail.value || '' }) },
  onInputResetNewPassword(e) { this.setData({ resetNewPassword: e.detail.value || '' }) },
  onInputResetConfirmPassword(e) { this.setData({ resetConfirmPassword: e.detail.value || '' }) },

  async handleLogin() {
    const username = String(this.data.username || '').trim()
    const password = String(this.data.password || '')
    if (!username) return wx.showToast({ title: TEXT.requireUsername, icon: 'none' })
    if (!password) return wx.showToast({ title: TEXT.requirePassword, icon: 'none' })

    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.submitting, mask: true })
    try {
      await authService.adminLogin(username, password)
      wx.hideLoading()
      wx.showToast({ title: TEXT.loginSuccess, icon: 'success' })
      setTimeout(() => this.goToAdmin(), 500)
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || TEXT.loginFailed, icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  togglePasswordEditor() {
    this.setData({ showPasswordEditor: !this.data.showPasswordEditor })
  },

  async handleChangePassword() {
    const username = String(this.data.username || '').trim()
    const oldPassword = String(this.data.resetOldPassword || '')
    const newPassword = String(this.data.resetNewPassword || '')
    const confirmPassword = String(this.data.resetConfirmPassword || '')
    if (!username) return wx.showToast({ title: TEXT.requireUsername, icon: 'none' })
    if (!oldPassword) return wx.showToast({ title: TEXT.requireResetOldPassword, icon: 'none' })
    if (!newPassword) return wx.showToast({ title: TEXT.requireResetNewPassword, icon: 'none' })
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return wx.showToast({ title: TEXT.shortPassword, icon: 'none' })
    }
    if (newPassword !== confirmPassword) return wx.showToast({ title: TEXT.confirmMismatch, icon: 'none' })

    try {
      await authService.changeAdminPassword(oldPassword, newPassword, username)
      storage.remove('adminUser')
      wx.showToast({ title: TEXT.changePasswordSuccess, icon: 'none' })
      this.setData({ showPasswordEditor: false, password: '', resetOldPassword: '', resetNewPassword: '', resetConfirmPassword: '' })
    } catch (error) {
      wx.showToast({ title: error.message || TEXT.changePasswordFailed, icon: 'none' })
    }
  },

  goToAdmin() { wx.redirectTo({ url: '/pages/dashboard/dashboard' }) },

  goToEnterprise() {
    if (storage.getEnterpriseUser()) return wx.switchTab({ url: '/pages/ai-assistant/ai-assistant' })
    wx.reLaunch({ url: '/pages/login/login' })
  }
})
