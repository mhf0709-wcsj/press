const db = wx.cloud.database()

const TEXT = {
  brandName: '\u538b\u529b\u8868\u667a\u80fd\u52a9\u624b',
  title: '\u8865\u5168\u4f01\u4e1a\u4fe1\u606f',
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
  submit: '\u5b8c\u6210\u7ed1\u5b9a',
  submitting: '\u4fdd\u5b58\u4e2d...',
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
    districtOptions: ['\u5927\u5cf3\u6240', '\u73ca\u6eaa\u6240', '\u5de8\u5c7f\u6240', '\u5cf3\u53e3\u6240', '\u9ec4\u5766\u6240', '\u897f\u5751\u6240', '\u7389\u58f6\u6240', '\u5357\u7530\u6240', '\u767e\u4e08\u9645\u6240'],
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

    if (this.data.bindMode) {
      await this.handleBindEnterprise(payload)
      return
    }

    this.handleManualRegister(payload)
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
      const res = await wx.cloud.callFunction({
        name: 'enterpriseAuth',
        data: {
          action: 'bindEnterprise',
          ...payload
        }
      })

      const result = res.result || {}
      if (!result.success || !result.enterprise) {
        throw new Error(result.error || TEXT.registerFailed)
      }

      wx.setStorageSync('enterpriseUser', result.enterprise)
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

  handleManualRegister(payload) {
    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.loading, mask: true })

    db.collection('enterprises').where({
      companyName: payload.companyName
    }).get()
      .then((res) => {
        if (res.data && res.data.length > 0) {
          wx.hideLoading()
          wx.showToast({ title: TEXT.existsCompany, icon: 'none' })
          return Promise.reject(new Error('company_exists'))
        }

        return db.collection('enterprises').where({
          phone: payload.phone
        }).get()
      })
      .then((res) => {
        if (res.data && res.data.length > 0) {
          wx.hideLoading()
          wx.showToast({ title: TEXT.existsPhone, icon: 'none' })
          return Promise.reject(new Error('phone_exists'))
        }

        return db.collection('enterprises').add({
          data: {
            ...payload,
            createTime: new Date(),
            updateTime: new Date()
          }
        })
      })
      .then((res) => {
        wx.setStorageSync('enterpriseUser', {
          _id: res._id,
          ...payload
        })
        wx.hideLoading()
        wx.showToast({ title: TEXT.registerSuccess, icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/equipment-detail/equipment-detail?mode=create&init=1' })
        }, 1400)
      })
      .catch((err) => {
        if (err && (err.message === 'company_exists' || err.message === 'phone_exists')) {
          return
        }
        wx.hideLoading()
        console.error('Manual register failed:', err)
        wx.showToast({ title: TEXT.registerFailed, icon: 'none' })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  goBack() {
    wx.navigateBack()
  }
})
