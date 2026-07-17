const { DISTRICTS } = require('../../constants/index')
const authService = require('../../services/auth-service')
const { storage } = require('../../utils/index')

Page({
  data: {
    companyName: '',
    creditCode: '',
    legalPerson: '',
    phone: '',
    district: '',
    districtIndex: -1,
    districtOptions: [...DISTRICTS],
    loading: false
  },

  onLoad() {
    const enterprise = storage.getEnterpriseUser()
    if (!enterprise) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }

    const district = enterprise.district || ''
    this.setData({
      companyName: enterprise.companyName || '',
      creditCode: enterprise.creditCode || '',
      legalPerson: enterprise.legalPerson || '',
      phone: enterprise.phone || '',
      district,
      districtIndex: this.data.districtOptions.indexOf(district)
    })
  },

  onInputLegalPerson(event) {
    this.setData({ legalPerson: event.detail.value || '' })
  },

  onInputPhone(event) {
    this.setData({ phone: event.detail.value || '' })
  },

  onDistrictChange(event) {
    const districtIndex = Number(event.detail.value)
    this.setData({
      districtIndex,
      district: this.data.districtOptions[districtIndex] || ''
    })
  },

  async handleSave() {
    if (this.data.loading) return

    const legalPerson = String(this.data.legalPerson || '').trim()
    const phone = String(this.data.phone || '').trim()
    const district = String(this.data.district || '').trim()

    if (!legalPerson) return wx.showToast({ title: '请输入企业法人', icon: 'none' })
    if (!/^1[3-9]\d{9}$/.test(phone)) return wx.showToast({ title: '请输入正确的联系电话', icon: 'none' })
    if (!district) return wx.showToast({ title: '请选择所在辖区', icon: 'none' })

    this.setData({ loading: true })
    try {
      const result = await authService.updateEnterpriseProfile({ legalPerson, phone, district })
      if (!result.enterprise) throw new Error('保存失败，请重试')
      storage.setEnterpriseUser(result.enterprise)
      wx.showToast({ title: '企业资料已更新', icon: 'success' })
      wx.navigateBack()
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
