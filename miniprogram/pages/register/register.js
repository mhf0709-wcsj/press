const { DISTRICTS } = require('../../constants/index')
const authService = require('../../services/auth-service')
const { storage } = require('../../utils/index')

const TEXT = {
  brandName: '\u538b\u529b\u8868\u667a\u80fd\u7ba1\u5bb6',
  title: '\u7533\u8bf7\u4f01\u4e1a\u5f00\u901a',
  desc: '',
  manualTitle: '\u4f01\u4e1a\u6ce8\u518c',
  manualDesc: '',
  companyLabel: '\u4f01\u4e1a\u540d\u79f0',
  companyPlaceholder: '\u8bf7\u8f93\u5165\u4f01\u4e1a\u5168\u79f0',
  creditCodeLabel: '\u7edf\u4e00\u793e\u4f1a\u4fe1\u7528\u4ee3\u7801',
  creditCodePlaceholder: '\u8bf7\u8f93\u5165 18 \u4f4d\u4fe1\u7528\u4ee3\u7801',
  legalPersonLabel: '\u4f01\u4e1a\u6cd5\u4eba',
  legalPersonPlaceholder: '\u8bf7\u8f93\u5165\u6cd5\u4eba\u59d3\u540d',
  phoneLabel: '\u6cd5\u4eba\u624b\u673a\u53f7',
  phonePlaceholder: '\u8bf7\u8f93\u5165\u6cd5\u4eba\u624b\u673a\u53f7',
  districtLabel: '\u6240\u5728\u8f96\u533a',
  districtPlaceholder: '\u8bf7\u9009\u62e9\u6240\u5728\u8f96\u533a',
  submit: '\u63d0\u4ea4\u5ba1\u6838',
  submitting: '\u63d0\u4ea4\u4e2d...',
  manualSubmit: '\u7acb\u5373\u6ce8\u518c',
  manualSubmitting: '\u6ce8\u518c\u4e2d...',
  assistText: '\u5df2\u6709\u4f01\u4e1a\u8d26\u53f7\uff1f',
  goLogin: '\u8fd4\u56de\u767b\u5f55',
  setupHint: '',
  requireCompany: '\u8bf7\u8f93\u5165\u4f01\u4e1a\u540d\u79f0',
  requireCreditCode: '\u8bf7\u8f93\u5165\u4f01\u4e1a\u4fe1\u7528\u4ee3\u7801',
  invalidCreditCode: '\u4fe1\u7528\u4ee3\u7801\u5e94\u4e3a 18 \u4f4d',
  requireLegalPerson: '\u8bf7\u8f93\u5165\u4f01\u4e1a\u6cd5\u4eba',
  requirePhone: '\u8bf7\u8f93\u5165\u6cd5\u4eba\u624b\u673a\u53f7',
  invalidPhone: '\u624b\u673a\u53f7\u683c\u5f0f\u4e0d\u6b63\u786e',
  requireDistrict: '\u8bf7\u9009\u62e9\u6240\u5728\u8f96\u533a',
  loading: '\u4fdd\u5b58\u4e2d...',
  existsCompany: '\u8be5\u4f01\u4e1a\u5df2\u6ce8\u518c',
  existsPhone: '\u8be5\u624b\u673a\u53f7\u5df2\u88ab\u6ce8\u518c',
  bindSuccess: '\u7ed1\u5b9a\u6210\u529f',
  pendingTitle: '\u7533\u8bf7\u5df2\u63d0\u4ea4',
  pendingContent: '\u8bf7\u7b49\u5f85\u6240\u5c5e\u8f96\u533a\u7ba1\u7406\u5458\u5ba1\u6838\uff0c\u5ba1\u6838\u901a\u8fc7\u540e\u5373\u53ef\u4f7f\u7528\u5fae\u4fe1\u8d26\u53f7\u767b\u5f55\u3002',
  registerSuccess: '\u6ce8\u518c\u6210\u529f',
  registerHint: '\u8bf7\u767b\u5f55',
  registerFailed: '\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
  bindRequired: '\u8bf7\u5148\u4ece\u5fae\u4fe1\u767b\u5f55\u5165\u53e3\u8fdb\u5165'
}

Page({
  data: {
    text: TEXT,
    bindMode: false,
    companyName: '',
    creditCode: '',
    legalPerson: '',
    phone: '',
    district: '',
    districtIndex: -1,
    districtOptions: [...DISTRICTS],
    loading: false
  },

  onLoad(options) {
    const bindMode = options.mode === 'bind'
    this.setData({ bindMode })
  },

  onInputCompanyName(e) {
    this.setData({ companyName: e.detail.value })
  },

  onInputCreditCode(e) {
    this.setData({ creditCode: e.detail.value })
  },

  onInputLegalPerson(e) {
    this.setData({ legalPerson: e.detail.value })
  },

  onInputPhone(e) {
    this.setData({ phone: e.detail.value })
  },

  onDistrictChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      districtIndex: index,
      district: this.data.districtOptions[index] || ''
    })
  },

  async handleRegister() {
    const payload = this.validateForm()
    if (!payload) return

    await this.handleBindEnterprise(payload)
  },

  validateForm() {
    const { companyName, creditCode, legalPerson, phone, district } = this.data

    if (!companyName.trim()) {
      wx.showToast({ title: TEXT.requireCompany, icon: 'none' })
      return null
    }
    if (!creditCode.trim()) {
      wx.showToast({ title: TEXT.requireCreditCode, icon: 'none' })
      return null
    }
    if (creditCode.trim().length !== 18) {
      wx.showToast({ title: TEXT.invalidCreditCode, icon: 'none' })
      return null
    }
    if (!legalPerson.trim()) {
      wx.showToast({ title: TEXT.requireLegalPerson, icon: 'none' })
      return null
    }
    if (!phone.trim()) {
      wx.showToast({ title: TEXT.requirePhone, icon: 'none' })
      return null
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: TEXT.invalidPhone, icon: 'none' })
      return null
    }
    if (!district) {
      wx.showToast({ title: TEXT.requireDistrict, icon: 'none' })
      return null
    }

    return {
      companyName: companyName.trim(),
      creditCode: creditCode.trim().toUpperCase(),
      legalPerson: legalPerson.trim(),
      phone: phone.trim(),
      district
    }
  },

  async handleBindEnterprise(payload) {
    const pending = wx.getStorageSync('enterpriseAuthPending')
    if (!pending || pending.authType !== 'wechat') {
      wx.showToast({ title: TEXT.bindRequired, icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.loading, mask: true })

    try {
      const result = await authService.bindEnterprise(payload)
      if (result.pendingReview || result.approvalStatus === 'pending') {
        wx.removeStorageSync('enterpriseAuthPending')
        wx.hideLoading()
        wx.showModal({
          title: TEXT.pendingTitle,
          content: TEXT.pendingContent,
          showCancel: false,
          success: () => wx.reLaunch({ url: '/pages/login/login' })
        })
        return
      }
      if (!result.enterprise) throw new Error(TEXT.registerFailed)

      storage.setEnterpriseUser(result.enterprise)
      wx.removeStorageSync('enterpriseAuthPending')
      wx.hideLoading()
      wx.showToast({ title: TEXT.bindSuccess, icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/equipment-detail/equipment-detail?mode=create&init=1' })
      }, 1200)
    } catch (error) {
      wx.hideLoading()
      console.error('Bind enterprise failed:', error)
      wx.showToast({ title: error.message || TEXT.registerFailed, icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goBack() {
    wx.navigateBack()
  }
})
